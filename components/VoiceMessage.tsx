"use client";

import { useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/schema";
import { speak, stopSpeaking } from "@/lib/speech";

/**
 * A WhatsApp-style voice-message bubble. Two modes:
 *   - User side  (audioUrl set):  a play button that plays back the recording.
 *   - Assistant side (text set):  a play button that speaks the hidden reply
 *     text via TTS. The text is NEVER shown — this is a voice-only reply.
 *
 * `autoPlay` (assistant side) starts playback as soon as the bubble mounts,
 * so a spoken question gets a spoken answer with no taps.
 */

export interface VoiceMessageProps {
  role: "user" | "assistant";
  audioUrl?: string | null; // user recording (object URL)
  text?: string | null; // assistant reply text (spoken, never displayed)
  lang: Lang;
  durationMs?: number;
  autoPlay?: boolean;
}

function fmtDuration(ms: number): string {
  const totalSec = Math.max(1, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Static "waveform" bar heights — decorative, gives the voice-note look.
const BARS = [8, 14, 20, 12, 24, 16, 10, 22, 14, 18, 9, 20, 13, 24, 11, 16];

export function VoiceMessage({
  role,
  audioUrl,
  text,
  lang,
  durationMs = 0,
  autoPlay = false,
}: VoiceMessageProps) {
  const isUser = role === "user";
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoPlayedRef = useRef(false);

  // Assistant bubble: auto-play the TTS reply once on mount.
  useEffect(() => {
    if (isUser || !autoPlay || autoPlayedRef.current || !text) return;
    autoPlayedRef.current = true;
    setPlaying(true);
    void speak(text, lang)
      .catch(() => {})
      .finally(() => setPlaying(false));
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    if (isUser) {
      const el = audioRef.current;
      if (!el) return;
      if (playing) {
        el.pause();
        el.currentTime = 0;
        setPlaying(false);
      } else {
        void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
      }
    } else {
      if (playing) {
        stopSpeaking();
        setPlaying(false);
      } else if (text) {
        setPlaying(true);
        void speak(text, lang)
          .catch(() => {})
          .finally(() => setPlaying(false));
      }
    }
  };

  const bubbleCls = isUser
    ? "rounded-ee-md bg-emerald-600 text-white"
    : "rounded-ss-md border border-stone-200 bg-white text-stone-800";
  const barCls = isUser ? "bg-white/70" : "bg-emerald-500/70";
  const btnCls = isUser
    ? "bg-white/20 text-white"
    : "bg-emerald-600 text-white";

  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`flex max-w-[85%] items-center gap-3 rounded-2xl px-3 py-2.5 shadow-sm ${bubbleCls}`}
      >
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Stop" : "Play voice message"}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl transition-transform active:scale-95 ${btnCls}`}
        >
          <span aria-hidden="true">{playing ? "⏸️" : "▶️"}</span>
        </button>

        {/* Decorative waveform */}
        <div className="flex items-center gap-0.5" aria-hidden="true">
          {BARS.map((h, i) => (
            <span
              key={i}
              className={`w-1 rounded-full ${barCls} ${playing ? "animate-pulse" : ""}`}
              style={{ height: `${h}px` }}
            />
          ))}
        </div>

        <span className="shrink-0 text-xs font-semibold opacity-80">
          {durationMs > 0 ? fmtDuration(durationMs) : "🎤"}
        </span>

        {audioUrl ? (
          <audio
            ref={audioRef}
            src={audioUrl}
            preload="metadata"
            onEnded={() => setPlaying(false)}
            className="hidden"
          />
        ) : null}
      </div>
    </div>
  );
}

export default VoiceMessage;
