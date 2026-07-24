"use client";

import { useEffect, useRef, useState } from "react";
import type {
  Alarm,
  ExtractApiResponse,
  ExtractedMedicine,
  ExtractionResult,
  SafetyWarning,
} from "@/lib/schema";
import { useLang } from "@/lib/i18n";
import { initAudio, speak, stopSpeaking } from "@/lib/speech";
import { buildAlarmsFromExtraction } from "@/lib/alarms";
import { MicButton } from "./MicButton";
import { SpeakButton } from "./SpeakButton";
import {
  durationLabel,
  foodIcon,
  foodLabel,
  frequencyLabel,
  isArabicScript,
  quantityLabel,
  timeOfDayIcon,
  timeOfDayKey,
} from "./labels";

export interface ExtractReviewProps {
  data: ExtractApiResponse;
  photo: string | null;
  onConfirmed(alarms: Alarm[]): void;
  onRetake(): void;
}

const LOW_CONFIDENCE = 0.7;

const YES_WORDS = [
  "ہاں",
  "جی",
  "ٹھیک",
  "درست",
  "صحیح",
  "haan",
  "han",
  "ji",
  "jee",
  "yes",
  "theek",
  "thik",
  "sahi",
  "ok",
  "okay",
];
const NO_WORDS = [
  "نہیں",
  "غلط",
  "دوبارہ",
  "nahi",
  "nahin",
  "no",
  "galat",
  "dobara",
  "retake",
  "wrong",
];

function severityStyle(w: SafetyWarning): { box: string; icon: string } {
  switch (w.severity) {
    case "danger":
      return { box: "border-red-500 bg-red-50 text-red-900", icon: "🚨" };
    case "warning":
      return { box: "border-amber-400 bg-amber-50 text-amber-900", icon: "⚠️" };
    default:
      return { box: "border-sky-300 bg-sky-50 text-sky-900", icon: "ℹ️" };
  }
}

export function ExtractReview({ data, photo, onConfirmed, onRetake }: ExtractReviewProps) {
  const { lang, t } = useLang();
  const ur = lang === "ur";

  const [meds, setMeds] = useState<ExtractedMedicine[]>(() =>
    data.result.medicines.map((m) => ({ ...m, times: [...m.times] })),
  );
  const [stage, setStage] = useState<"review" | "confirming">("review");
  const [busy, setBusy] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const confirmingRef = useRef(false);

  useEffect(() => {
    return () => stopSpeaking();
  }, []);

  const safety = data.safety;

  const summaryText = (() => {
    const parts = meds.map((m) => {
      const bits = [
        quantityLabel(m.quantity, lang),
        frequencyLabel(m.frequency, t, lang),
        foodLabel(m.food, t, lang),
      ].join(ur ? "، " : ", ");
      return `${m.brand_name}: ${bits}`;
    });
    if (ur) {
      return `میں نے نسخے میں یہ دوائیں پڑھی ہیں۔ ${parts.join("۔ ")}۔ کیا یہ سب ٹھیک ہے؟`;
    }
    return `I read these medicines on the prescription. ${parts.join(". ")}. Is everything correct?`;
  })();

  const setTime = (mi: number, ti: number, value: string) => {
    if (!value) return;
    setMeds((prev) =>
      prev.map((m, i) =>
        i === mi ? { ...m, times: m.times.map((tm, j) => (j === ti ? value : tm)) } : m,
      ),
    );
  };

  const perMedicineNote = (brand: string) => {
    if (!safety) return null;
    const hit = safety.per_medicine.find(
      (p) => p.brand_name.toLowerCase().trim() === brand.toLowerCase().trim() && !p.plausible,
    );
    if (!hit) return null;
    return ur ? hit.note_ur ?? hit.note_en : hit.note_en ?? hit.note_ur;
  };

  const startReadBack = () => {
    initAudio();
    setStage("confirming");
    setHeard(null);
    speak(summaryText, lang).catch(() => {});
  };

  const doConfirm = async () => {
    if (confirmingRef.current || meds.length === 0) return;
    confirmingRef.current = true;
    setBusy(true);
    setFailed(false);
    stopSpeaking();
    try {
      const edited: ExtractionResult = { ...data.result, medicines: meds };
      const alarms = await buildAlarmsFromExtraction(edited, photo);
      onConfirmed(alarms);
    } catch {
      setFailed(true);
      confirmingRef.current = false;
      setBusy(false);
      return;
    }
    confirmingRef.current = false;
    setBusy(false);
  };

  const doRetake = () => {
    stopSpeaking();
    onRetake();
  };

  const onVoiceAnswer = (text: string) => {
    const s = text.toLowerCase();
    const tokens = s.split(/\s+/);
    const hasWord = (words: string[]) =>
      words.some((w) => (isArabicScript(w) ? s.includes(w) : tokens.includes(w)));
    if (hasWord(NO_WORDS)) {
      doRetake();
      return;
    }
    if (hasWord(YES_WORDS)) {
      void doConfirm();
      return;
    }
    setHeard(text);
  };

  const bigBtn =
    "flex min-h-16 w-full select-none items-center justify-center gap-2 rounded-2xl text-xl font-extrabold shadow-md transition-transform active:scale-[0.98] disabled:opacity-50";
  const urduFont = ur ? "font-urdu leading-loose" : "";

  // ── Empty extraction: nothing readable — only offer retake ────────────────
  if (meds.length === 0) {
    return (
      <section className="w-full rounded-3xl border-2 border-amber-300 bg-amber-50 p-5 shadow-lg">
        <p className={`text-xl font-bold text-amber-900 ${ur ? "font-urdu leading-loose" : ""}`} dir="auto">
          {ur
            ? "معاف کیجیے، تصویر سے کوئی دوا پڑھ نہیں سکے۔ براہ کرم صاف روشنی میں دوبارہ تصویر لیں۔"
            : "Sorry, we could not read any medicine from the photo. Please retake it in better light."}
        </p>
        <button type="button" onClick={doRetake} className={`${bigBtn} mt-4 bg-emerald-600 text-white ${urduFont}`}>
          📷 {t("confirm_retake")}
        </button>
      </section>
    );
  }

  return (
    <section className="w-full space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="h-16 w-16 shrink-0 rounded-xl border border-stone-200 object-cover" />
        ) : null}
        <h2 className={`flex-1 text-2xl font-extrabold text-stone-800 ${urduFont}`} dir="auto">
          📋 {t("extract_review_title")}
        </h2>
        <SpeakButton text={summaryText} lang={lang} className="h-14 w-14 text-xl" />
      </div>

      {/* Safety warnings — most important, shown first and loud */}
      {safety && safety.warnings.length > 0 ? (
        <div className="space-y-2">
          {safety.warnings.map((w, i) => {
            const st = severityStyle(w);
            const txt = ur ? w.text_ur : w.text_en;
            return (
              <div key={i} className={`flex items-start gap-3 rounded-2xl border-2 p-4 ${st.box}`} role="alert">
                <span aria-hidden="true" className="text-3xl leading-none">
                  {st.icon}
                </span>
                <p className={`flex-1 text-lg font-bold ${isArabicScript(txt) ? "font-urdu leading-loose" : ""}`} dir="auto">
                  {txt}
                </p>
                <SpeakButton text={txt} lang={isArabicScript(txt) ? "ur" : "en"} className="h-12 w-12 text-lg" />
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Unreadable regions */}
      {data.result.unreadable_regions.length > 0 ? (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-3">
          <p className={`text-base font-semibold text-amber-900 ${urduFont}`} dir="auto">
            ⚠️ {ur ? "نسخے کے یہ حصے پڑھے نہیں جا سکے:" : "These parts could not be read:"}
          </p>
          <p className="mt-1 text-sm text-amber-800" dir="ltr">
            {data.result.unreadable_regions.join(" · ")}
          </p>
        </div>
      ) : null}

      {/* One card per medicine */}
      {meds.map((m, mi) => {
        const lowName = m.confidence.brand_name < LOW_CONFIDENCE;
        const lowDirections = m.confidence.directions < LOW_CONFIDENCE || m.needs_user_confirmation;
        const note = perMedicineNote(m.brand_name);
        return (
          <article
            key={`${m.brand_name}-${mi}`}
            className={`space-y-3 rounded-2xl border-2 bg-white p-4 shadow-md ${
              lowName || lowDirections ? "border-amber-400" : "border-stone-100"
            }`}
          >
            {/* Name + salt */}
            <div>
              <p
                dir="ltr"
                className={`text-start text-2xl font-extrabold text-stone-900 ${
                  lowName ? "rounded-lg bg-amber-100 px-2 py-1" : ""
                }`}
              >
                💊 {m.brand_name}
                {lowName ? <span aria-hidden="true"> ⚠️</span> : null}
              </p>
              {m.salt ? (
                <p dir="ltr" className="mt-0.5 text-start text-sm italic text-stone-500">
                  {m.salt}
                  {m.form ? ` · ${m.form}` : ""}
                </p>
              ) : m.form ? (
                <p dir="ltr" className="mt-0.5 text-start text-sm italic text-stone-500">
                  {m.form}
                </p>
              ) : null}
            </div>

            {/* Safety note for this medicine (implausible dose etc.) */}
            {note ? (
              <div className="flex items-start gap-2 rounded-xl border-2 border-red-400 bg-red-50 p-3" role="alert">
                <span aria-hidden="true" className="text-2xl leading-none">🚨</span>
                <p className={`text-base font-bold text-red-900 ${isArabicScript(note) ? "font-urdu leading-loose" : ""}`} dir="auto">
                  {note}
                </p>
              </div>
            ) : null}

            {/* Raw directions as written on paper */}
            {m.directions_raw_urdu || m.directions_raw_latin ? (
              <div
                className={`rounded-xl p-3 ${
                  lowDirections ? "border-2 border-amber-400 bg-amber-50" : "bg-stone-50"
                }`}
              >
                {m.directions_raw_urdu ? (
                  <p dir="rtl" className="font-urdu text-start text-xl leading-loose text-stone-800">
                    {m.directions_raw_urdu}
                  </p>
                ) : null}
                {m.directions_raw_latin ? (
                  <p dir="ltr" className="mt-1 text-start font-mono text-sm text-stone-500">
                    {m.directions_raw_latin}
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* Low-confidence warning */}
            {lowDirections ? (
              <p className={`flex items-center gap-2 text-base font-bold text-amber-700 ${urduFont}`} dir="auto">
                <span aria-hidden="true">⚠️</span> {t("extract_low_confidence")}
              </p>
            ) : null}

            {/* Normalized chips: quantity / frequency / food */}
            <div className="flex flex-wrap gap-2">
              {[
                `💊 ${quantityLabel(m.quantity, lang)}`,
                `🔁 ${frequencyLabel(m.frequency, t, lang)}`,
                `${foodIcon(m.food)} ${foodLabel(m.food, t, lang)}`,
              ].map((chip, ci) => (
                <span
                  key={ci}
                  dir="auto"
                  className={`rounded-full px-3 py-1.5 text-base font-semibold ${
                    lowDirections ? "bg-amber-100 text-amber-900" : "bg-emerald-50 text-emerald-800"
                  } ${ur ? "font-urdu" : ""}`}
                >
                  {chip}
                </span>
              ))}
              <span
                dir="auto"
                className={`rounded-full bg-stone-100 px-3 py-1.5 text-base font-semibold text-stone-700 ${ur ? "font-urdu" : ""}`}
              >
                📅 {t("duration_label")}: {durationLabel(m.duration_days, lang)}
              </span>
            </div>

            {/* Editable times with time-of-day icons */}
            <div>
              <p className={`mb-2 text-base font-bold text-stone-600 ${urduFont}`} dir="auto">
                ⏰ {t("times_label")}
              </p>
              <div className="flex flex-wrap gap-3">
                {m.times.map((tm, ti) => (
                  <label
                    key={ti}
                    className="flex flex-col items-center gap-1 rounded-2xl bg-stone-50 p-3"
                  >
                    <span aria-hidden="true" className="text-3xl leading-none">
                      {timeOfDayIcon(tm)}
                    </span>
                    <span className={`text-sm font-semibold text-stone-600 ${ur ? "font-urdu" : ""}`}>
                      {t(timeOfDayKey(tm))}
                    </span>
                    <input
                      type="time"
                      dir="ltr"
                      value={tm}
                      onChange={(e) => setTime(mi, ti, e.target.value)}
                      className="h-14 w-32 rounded-xl border-2 border-stone-200 bg-white px-2 text-center text-xl font-bold text-stone-800 focus:border-emerald-500 focus:outline-none"
                    />
                  </label>
                ))}
              </div>
            </div>
          </article>
        );
      })}

      {/* Safety summary line */}
      {safety ? (
        <p className={`px-1 text-base text-stone-600 ${urduFont}`} dir="auto">
          🛡️ {ur ? safety.summary_ur : safety.summary_en}
        </p>
      ) : null}

      {failed ? (
        <p className={`text-base font-bold text-red-700 ${urduFont}`} dir="auto" role="alert">
          {t("error_generic")}
        </p>
      ) : null}

      {/* Footer actions */}
      {stage === "review" ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={startReadBack}
            disabled={busy}
            className={`${bigBtn} bg-emerald-600 text-white ${urduFont}`}
          >
            🔊 {t("confirm_schedule")}
          </button>
          <button
            type="button"
            onClick={doRetake}
            disabled={busy}
            className={`${bigBtn} border-2 border-stone-300 bg-white text-stone-700 ${urduFont}`}
          >
            📷 {t("confirm_retake")}
          </button>
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4">
          <p className={`text-center text-xl font-extrabold text-emerald-900 ${urduFont}`} dir="auto">
            {ur ? "کیا یہ سب ٹھیک ہے؟" : "Is everything correct?"}
          </p>
          <div className="flex items-center justify-center">
            <MicButton onResult={onVoiceAnswer} disabled={busy} />
          </div>
          <p className={`text-center text-sm text-emerald-800 ${urduFont}`} dir="auto">
            {ur ? "مائیک دبا کر ہاں یا نہیں کہیں" : "Tap the mic and say yes or no"}
          </p>
          {heard ? (
            <p className={`text-center text-sm text-stone-500 ${isArabicScript(heard) ? "font-urdu" : ""}`} dir="auto">
              🎤 “{heard}” — {ur ? "سمجھ نہیں آیا، ہاں یا نہیں کہیں" : "not understood, say yes or no"}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => void doConfirm()}
              disabled={busy}
              className={`${bigBtn} bg-emerald-600 text-white ${urduFont}`}
            >
              ✅ {t("confirm_yes")}
            </button>
            <button
              type="button"
              onClick={doRetake}
              disabled={busy}
              className={`${bigBtn} border-2 border-stone-300 bg-white text-stone-700 ${urduFont}`}
            >
              🔄 {t("confirm_retake")}
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              stopSpeaking();
              setStage("review");
            }}
            disabled={busy}
            className={`mx-auto block min-h-12 rounded-xl px-4 text-base font-semibold text-stone-500 underline ${urduFont}`}
          >
            {t("cancel")}
          </button>
          {busy ? (
            <p className={`text-center text-base font-bold text-emerald-700 ${urduFont}`} dir="auto">
              ⏳ {ur ? "الارم بن رہے ہیں…" : "Creating alarms…"}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

export default ExtractReview;
