"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";
import {
  initAudio,
  startVoiceRecording,
  type VoiceRecordingController,
} from "@/lib/speech";

/**
 * Chat voice-message recorder. Tap to start, tap to stop. On stop it hands the
 * caller the recorded audio (for playback) AND the transcript (which the caller
 * sends to the text-only model). The transcript is never shown to the user —
 * this is a voice-in / voice-out experience.
 */

export interface VoiceRecordButtonProps {
  onRecorded(result: { transcript: string; audioUrl: string | null; durationMs: number }): void;
  disabled?: boolean;
}

export function VoiceRecordButton({ onRecorded, disabled }: VoiceRecordButtonProps) {
  const { lang, t } = useLang();
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const controllerRef = useRef<VoiceRecordingController | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      controllerRef.current?.cancel();
      if (tickRef.current !== null) clearInterval(tickRef.current);
      if (errorTimerRef.current !== null) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const showError = (message: string) => {
    setErrorMsg(message);
    if (errorTimerRef.current !== null) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setErrorMsg(null), 4000);
  };

  const start = async () => {
    initAudio();
    setErrorMsg(null);
    try {
      const controller = await startVoiceRecording(lang);
      controllerRef.current = controller;
      setRecording(true);
      setElapsed(0);
      tickRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch (err) {
      const code = err instanceof Error ? err.message : "mic-error";
      if (code === "mic-permission-denied" || code === "not-allowed") {
        showError(t("error_mic_denied"));
      } else {
        showError(t("error_no_speech"));
      }
    }
  };

  const stop = async () => {
    const controller = controllerRef.current;
    controllerRef.current = null;
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setRecording(false);
    if (!controller) return;
    const result = await controller.stop();
    if (!result.transcript.trim()) {
      // Nothing intelligible was heard — tell the user, discard the recording.
      if (result.audioUrl) URL.revokeObjectURL(result.audioUrl);
      showError(t("error_no_speech"));
      return;
    }
    onRecorded(result);
  };

  const tap = () => {
    if (recording) void stop();
    else void start();
  };

  const mm = Math.floor(elapsed / 60);
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={tap}
        disabled={disabled}
        aria-label={recording ? "Stop recording" : "Record a voice message"}
        aria-pressed={recording}
        className={`relative flex h-12 w-12 shrink-0 select-none items-center justify-center rounded-full text-3xl transition-colors touch-manipulation ${
          recording
            ? "animate-pulse bg-red-500 ring-4 ring-red-300"
            : "bg-transparent border border-emerald-200 active:bg-stone-100"
        } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
      >
        {recording ? (
          <span aria-hidden="true" className="text-white">⏹️</span>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src="/mic.avif" alt="" className="h-10 w-10 object-contain mix-blend-multiply" />
        )}
      </button>

      {recording ? (
        <span
          className="absolute -top-7 left-1/2 -translate-x-1/2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white shadow"
          aria-hidden="true"
        >
          ● {mm}:{ss}
        </span>
      ) : null}

      {errorMsg ? (
        <div
          role="alert"
          dir="auto"
          className={`absolute bottom-full left-1/2 z-10 mb-2 w-max max-w-56 -translate-x-1/2 rounded-xl bg-red-600 px-3 py-2 text-center text-sm font-bold text-white shadow-lg ${
            lang === "ur" ? "font-urdu" : ""
          }`}
        >
          {errorMsg}
        </div>
      ) : null}
    </div>
  );
}

export default VoiceRecordButton;
