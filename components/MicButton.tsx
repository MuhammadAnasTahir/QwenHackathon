"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";
import { initAudio, listen, stopListening, sttSupported } from "@/lib/speech";

export interface MicButtonProps {
  onResult(text: string): void;
  onInterim?(s: string): void;
  disabled?: boolean;
}

export function MicButton({ onResult, onInterim, disabled }: MicButtonProps) {
  const { lang, t } = useLang();
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const listeningRef = useRef(false);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- SpeechRecognition support is only known client-side; avoids SSR hydration mismatch
    setSupported(sttSupported());
    return () => {
      // Release the microphone if we unmount mid-listen.
      if (listeningRef.current) stopListening();
      if (errorTimerRef.current !== null) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const showError = (message: string) => {
    setErrorMsg(message);
    if (errorTimerRef.current !== null) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setErrorMsg(null), 4000);
  };

  const tap = async () => {
    initAudio();
    if (listeningRef.current) {
      // Second tap ends the recognition session; the pending promise settles.
      stopListening();
      return;
    }
    setErrorMsg(null);
    listeningRef.current = true;
    setListening(true);
    try {
      const text = await listen(lang, onInterim);
      if (text && text.trim()) onResult(text.trim());
    } catch (err) {
      const code = err instanceof Error ? err.message : "speech-error";
      if (code === "aborted") {
        // User tapped again to stop early — not an error, say nothing.
      } else if (code === "mic-permission-denied" || code === "not-allowed" || code === "service-not-allowed") {
        showError(t("error_mic_denied"));
      } else if (code === "speech-recognition-unsupported") {
        setSupported(false);
      } else {
        showError(t("error_no_speech"));
      }
    } finally {
      listeningRef.current = false;
      setListening(false);
    }
  };

  const isDisabled = disabled || !supported;

  return (
    <div className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={() => void tap()}
        disabled={isDisabled}
        aria-label={listening ? t("chat_listening") : t("chat_tap_mic")}
        aria-pressed={listening}
        className={`relative flex h-20 w-20 shrink-0 select-none items-center justify-center rounded-full text-3xl shadow-lg transition-colors ${
          listening
            ? "animate-pulse bg-red-500 text-white ring-4 ring-red-300"
            : "bg-emerald-600 text-white active:bg-emerald-700"
        } ${isDisabled ? "cursor-not-allowed opacity-40" : ""}`}
      >
        <span aria-hidden="true">🎤</span>
        {listening ? (
          <span
            aria-hidden="true"
            className="absolute -top-1 -end-1 h-4 w-4 rounded-full bg-red-600 ring-2 ring-white"
          />
        ) : null}
      </button>
      {errorMsg ? (
        <div
          role="alert"
          dir="auto"
          className={`absolute top-full left-1/2 z-10 mt-2 w-max max-w-56 -translate-x-1/2 rounded-xl bg-red-600 px-3 py-2 text-center text-sm font-bold text-white shadow-lg ${
            lang === "ur" ? "font-urdu" : ""
          }`}
        >
          {errorMsg}
        </div>
      ) : null}
    </div>
  );
}

export default MicButton;
