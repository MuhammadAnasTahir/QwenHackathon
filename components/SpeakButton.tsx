"use client";

import { useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/schema";
import { useLang } from "@/lib/i18n";
import { initAudio, speak, stopSpeaking } from "@/lib/speech";

export interface SpeakButtonProps {
  text: string;
  lang?: Lang;
  className?: string;
}

export function SpeakButton({ text, lang, className }: SpeakButtonProps) {
  const { lang: uiLang, t } = useLang();
  const effLang = lang ?? uiLang;
  const [speaking, setSpeaking] = useState(false);
  const startedByMe = useRef(false);

  useEffect(() => {
    // If this button started speech and unmounts mid-utterance, stop it.
    return () => {
      if (startedByMe.current) stopSpeaking();
    };
  }, []);

  const toggle = async () => {
    initAudio();
    if (speaking) {
      stopSpeaking();
      startedByMe.current = false;
      setSpeaking(false);
      return;
    }
    startedByMe.current = true;
    setSpeaking(true);
    try {
      await speak(text, effLang);
    } catch {
      // no voice available / interrupted — fail silently
    } finally {
      startedByMe.current = false;
      setSpeaking(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      aria-label={t("speak_screen")}
      aria-pressed={speaking}
      className={`flex select-none items-center justify-center rounded-full shadow-sm transition-colors ${
        speaking
          ? "animate-pulse bg-emerald-600 text-white"
          : "bg-emerald-100 text-emerald-700 active:bg-emerald-200"
      } ${className ?? "h-16 w-16 text-2xl"}`}
    >
      <span aria-hidden="true">{speaking ? "⏹" : "🔊"}</span>
    </button>
  );
}

export default SpeakButton;
