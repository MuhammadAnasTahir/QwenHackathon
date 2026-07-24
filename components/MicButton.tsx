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
  const listeningRef = useRef(false);

  useEffect(() => {
    setSupported(sttSupported());
    return () => {
      // Release the microphone if we unmount mid-listen.
      if (listeningRef.current) stopListening();
    };
  }, []);

  const tap = async () => {
    initAudio();
    if (listeningRef.current) {
      // Second tap ends the recognition session; the pending promise settles.
      stopListening();
      return;
    }
    listeningRef.current = true;
    setListening(true);
    try {
      const text = await listen(lang, onInterim);
      if (text && text.trim()) onResult(text.trim());
    } catch {
      // no-speech / permission denied — just reset quietly
    } finally {
      listeningRef.current = false;
      setListening(false);
    }
  };

  const isDisabled = disabled || !supported;

  return (
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
  );
}

export default MicButton;
