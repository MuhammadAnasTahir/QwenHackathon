"use client";

import { useEffect } from "react";
import type { Alarm } from "@/lib/schema";
import { useLang } from "@/lib/i18n";
import { beepPattern, initAudio, speak, stopBeeps, stopSpeaking } from "@/lib/speech";
import { timeOfDayIcon } from "./labels";

export interface RingOverlayProps {
  alarm: Alarm;
  photo: string | null;
  time: string;
  onTaken(): void;
  onSnooze(): void;
}

export function RingOverlay({ alarm, photo, time, onTaken, onSnooze }: RingOverlayProps) {
  const { lang, t } = useLang();
  const ur = lang === "ur";

  useEffect(() => {
    initAudio();

    // Pick what to speak for the current UI language. For Urdu we speak the
    // Roman Urdu text (e.g. "Aap ka Panadol khane ka waqt ho gaya hai")
    // through an English voice: most devices ship a working en voice but no
    // ur-PK one, and an English TTS engine reading phonetic Roman Urdu comes
    // out understandable, where it reading Nastaliq Urdu script does not.
    // Alarms saved before this field existed fall back to the Urdu script.
    const useRoman = lang === "ur" && !!alarm.roman_urdu_announcement;
    const spokenLang: "ur" | "en" =
      lang === "en" && alarm.english_announcement
        ? "en"
        : useRoman || !alarm.urdu_announcement
          ? "en"
          : "ur";
    const announcement =
      lang === "en"
        ? alarm.english_announcement || alarm.urdu_announcement
        : (alarm.roman_urdu_announcement ?? alarm.urdu_announcement ?? alarm.english_announcement);
    const announce = () => {
      speak(announcement, spokenLang).catch(() => {});
    };
    const vibrate = () => {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate([300, 150, 300, 150, 600]);
        } catch {
          /* unsupported */
        }
      }
    };

    // Ring immediately, then keep ringing until dismissed.
    beepPattern();
    vibrate();
    const firstSpeak = window.setTimeout(announce, 1200); // let the beeps land first
    const beepLoop = window.setInterval(() => {
      beepPattern();
      vibrate();
    }, 4000);
    const speakLoop = window.setInterval(announce, 8000);

    return () => {
      window.clearTimeout(firstSpeak);
      window.clearInterval(beepLoop);
      window.clearInterval(speakLoop);
      stopBeeps();
      stopSpeaking();
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate(0);
        } catch {
          /* unsupported */
        }
      }
    };
  }, [alarm.id, alarm.urdu_announcement, alarm.roman_urdu_announcement, alarm.english_announcement, time, lang]);

  const silenceAnd = (fn: () => void) => () => {
    stopBeeps();
    stopSpeaking();
    fn();
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={t("alarm_ring_title")}
      className="fixed inset-0 z-50 flex flex-col items-center justify-between gap-4 overflow-y-auto bg-emerald-600 p-6 pt-10 text-white"
    >
      <div className="flex flex-col items-center gap-1">
        <span aria-hidden="true" className="animate-bounce text-5xl">
          ⏰
        </span>
        <p className={`text-2xl font-extrabold ${ur ? "font-urdu leading-loose" : ""}`} dir="auto">
          {t("alarm_ring_title")}
        </p>
        <p dir="ltr" className="text-xl font-bold opacity-90">
          {timeOfDayIcon(time)} {time}
        </p>
      </div>

      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt={alarm.medicine_name}
          className="max-h-[38vh] w-auto max-w-full rounded-3xl border-4 border-white/70 object-contain shadow-2xl"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-48 w-48 items-center justify-center rounded-3xl bg-white/15 text-8xl"
        >
          💊
        </div>
      )}

      <div className="text-center">
        <p dir="ltr" className="text-3xl font-extrabold drop-shadow-sm">
          {alarm.medicine_name}
        </p>
        {lang === "ur" ? (
          <p dir="rtl" className="font-urdu mt-1 text-xl leading-loose text-emerald-50">
            {alarm.urdu_announcement}
          </p>
        ) : (
          <p dir="ltr" className="mt-1 text-xl leading-relaxed text-emerald-50">
            {alarm.english_announcement || alarm.urdu_announcement}
          </p>
        )}
      </div>

      <div className="grid w-full grid-cols-2 gap-4 pb-4">
        <button
          type="button"
          onClick={silenceAnd(onTaken)}
          className={`flex min-h-24 select-none flex-col items-center justify-center gap-1 rounded-3xl bg-white text-emerald-700 shadow-xl transition-transform active:scale-95 ${
            ur ? "font-urdu" : ""
          }`}
        >
          <span aria-hidden="true" className="text-4xl leading-none">✅</span>
          <span className="text-2xl font-extrabold leading-loose">{t("alarm_taken")}</span>
        </button>
        <button
          type="button"
          onClick={silenceAnd(onSnooze)}
          className={`flex min-h-24 select-none flex-col items-center justify-center gap-1 rounded-3xl border-2 border-white/50 bg-emerald-800/70 text-white shadow-xl transition-transform active:scale-95 ${
            ur ? "font-urdu" : ""
          }`}
        >
          <span aria-hidden="true" className="text-4xl leading-none">⏰</span>
          <span className="text-2xl font-extrabold leading-loose">{t("alarm_snooze")}</span>
        </button>
      </div>
    </div>
  );
}

export default RingOverlay;
