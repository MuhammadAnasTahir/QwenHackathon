"use client";

import { useRef, useState } from "react";
import { type Alarm, type FoodTiming, type Frequency, type Quantity } from "@/lib/schema";
import type { TKey } from "@/lib/translations";
import { useLang } from "@/lib/i18n";
import { composeEnglishAnnouncement, composeUrduAnnouncement, saveAlarm } from "@/lib/alarms";
import { idbSet } from "@/lib/idb";
import { fileToDataUrl, thumbnail } from "@/lib/image";
import { MicButton } from "@/components/MicButton";

type AddFrequency = Exclude<Frequency, "every_8_hours" | "once_weekly" | "unknown">;

const FREQ_OPTIONS: { value: AddFrequency; tkey: TKey }[] = [
  { value: "once_daily", tkey: "freq_once" },
  { value: "twice_daily", tkey: "freq_twice" },
  { value: "thrice_daily", tkey: "freq_thrice" },
  { value: "four_times_daily", tkey: "freq_four" },
  { value: "at_bedtime", tkey: "freq_bedtime" },
  { value: "as_needed", tkey: "freq_needed" },
];

// "any" is intentionally NOT offered here — for a medicine alarm the user
// should pick a real food timing. ("any" still exists in the type for the
// extraction path where the prescription genuinely says nothing about food.)
const FOOD_OPTIONS: { value: FoodTiming; tkey: TKey }[] = [
  { value: "before_food", tkey: "food_before" },
  { value: "after_food", tkey: "food_after" },
  { value: "empty_stomach", tkey: "food_empty" },
  { value: "with_milk", tkey: "food_milk" },
];

function defaultTimes(freq: AddFrequency): string[] {
  switch (freq) {
    case "once_daily":
      return ["08:00"];
    case "twice_daily":
      return ["08:00", "20:00"];
    case "thrice_daily":
      return ["08:00", "14:00", "20:00"];
    case "four_times_daily":
      return ["06:00", "12:00", "18:00", "23:00"];
    case "at_bedtime":
      return ["21:00"];
    case "as_needed":
      return [];
  }
}

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const DURATION_CHOICES: (number | null)[] = [3, 5, 7, 14, 30, null];

export function AddAlarmDialog({ 
  onClose, 
  onSaved,
  initialAlarm,
  initialPhoto
}: { 
  onClose(): void; 
  onSaved(): void;
  initialAlarm?: Alarm;
  initialPhoto?: string | null;
}) {
  const { lang, t } = useLang();
  const ur = lang === "ur";
  const urduFont = ur ? "font-urdu leading-loose" : "";

  const [photo, setPhoto] = useState<string | null>(initialPhoto ?? null);
  const [name, setName] = useState(initialAlarm?.medicine_name ?? "");
  const [freq, setFreq] = useState<AddFrequency>("once_daily");
  const [times, setTimes] = useState<string[]>(initialAlarm?.times ?? defaultTimes("once_daily"));
  // Default to "after_food" (the most common) since "any" is no longer offered.
  // When editing, keep whatever the alarm already had — including a legacy "any".
  const [food, setFood] = useState<FoodTiming>(initialAlarm?.food ?? "after_food");
  const [duration, setDuration] = useState<number | null>(initialAlarm?.duration_days ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickFreq = (f: AddFrequency) => {
    setFreq(f);
    setTimes(defaultTimes(f));
  };

  const onFile = async (f: File | undefined | null) => {
    if (!f) return;
    try {
      const raw = await fileToDataUrl(f);
      setPhoto(await thumbnail(raw, 700));
    } catch {
      // photo is optional — ignore failures
    }
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(false);
    try {
      const id = initialAlarm?.id ?? makeId();
      let photoKey: string | null = initialAlarm?.photoKey ?? null;
      // If photo was changed (or added), we should update it
      if (photo && photo !== initialPhoto) {
        photoKey = `photo_${id}`;
        try {
          await idbSet(photoKey, photo);
        } catch {
          photoKey = null;
        }
      } else if (!photo && initialPhoto) {
        // user removed the photo, wait, we don't have a way to remove photo yet, but just in case
        photoKey = null;
      }

      const quantity: Quantity = "one_tablet";
      const alarm: Alarm = {
        id,
        medicine_name: trimmed,
        salt: initialAlarm?.salt ?? null,
        photoKey,
        urdu_announcement: composeUrduAnnouncement(trimmed, quantity, food),
        english_announcement: composeEnglishAnnouncement(trimmed, quantity, food),
        times: [...times],
        start_date: initialAlarm?.start_date ?? todayStr(),
        duration_days: duration,
        food,
        taken_log: initialAlarm?.taken_log ?? [],
        created_at: initialAlarm?.created_at ?? new Date().toISOString(),
      };
      saveAlarm(alarm);
      onSaved();
    } catch {
      setError(true);
      setSaving(false);
    }
  };

  const chip = (active: boolean) =>
    `flex min-h-14 items-center justify-center gap-1.5 rounded-2xl border-2 px-3 text-base font-bold transition-colors ${
      active
        ? "border-emerald-500 bg-emerald-50 text-emerald-800"
        : "border-stone-200 bg-white text-stone-600"
    }`;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
      <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        {/* Dialog header */}
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3">
          <h2 className={`text-2xl font-extrabold text-stone-900 ${urduFont}`} dir="auto">
            {initialAlarm ? (ur ? "ترمیم کریں" : "Edit Alarm") : t("alarms_add")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("cancel")}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-xl text-stone-600 touch-manipulation"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Photo of the box */}
          <div>
            <p className={`mb-2 text-lg font-bold text-stone-700 ${urduFont}`} dir="auto">
              {t("add_photo")}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                void onFile(f);
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed border-emerald-300 bg-emerald-50 text-5xl"
              aria-label={t("add_photo")}
            >
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="" className="h-full w-full object-cover" />
              ) : (
                <span aria-hidden="true" className="text-stone-400">+</span>
              )}
            </button>
          </div>

          {/* Name */}
          <div>
            <p className={`mb-2 text-lg font-bold text-stone-700 ${urduFont}`} dir="auto">
              {t("medicine_name")}
            </p>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("medicine_name")}
                dir="auto"
                className={`h-16 min-w-0 flex-1 rounded-2xl border-2 border-stone-200 bg-stone-50 px-4 text-lg text-stone-900 placeholder:text-stone-400 focus:border-emerald-500 focus:outline-none ${urduFont}`}
              />
              <MicButton onResult={(text) => setName(text)} />
            </div>
          </div>

          {/* Frequency */}
          <div>
            <p className={`mb-2 text-lg font-bold text-stone-700 ${urduFont}`} dir="auto">
              {ur ? "دن میں کتنی بار؟" : "How often?"}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {FREQ_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => pickFreq(o.value)}
                  aria-pressed={freq === o.value}
                  className={`${chip(freq === o.value)} ${urduFont}`}
                >
                  {t(o.tkey)}
                </button>
              ))}
            </div>
          </div>

          {/* Times */}
          {times.length > 0 ? (
            <div>
              <p className={`mb-2 text-lg font-bold text-stone-700 ${urduFont}`} dir="auto">
                {t("times_label")}
              </p>
              <div className="flex flex-wrap gap-3">
                {times.map((tm, i) => (
                  <label key={i} className="flex flex-col items-center gap-1 rounded-2xl bg-stone-50 p-3">
                    <input
                      type="time"
                      dir="ltr"
                      value={tm}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return;
                        setTimes((prev) => prev.map((x, j) => (j === i ? v : x)));
                      }}
                      className="h-14 w-full min-w-[9.5rem] rounded-xl border-2 border-stone-200 bg-white px-3 text-center text-lg font-bold text-stone-800 focus:border-emerald-500 focus:outline-none"
                    />
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {/* Food timing */}
          <div>
            <p className={`mb-2 text-lg font-bold text-stone-700 ${urduFont}`} dir="auto">
              {ur ? "کھانے کے ساتھ کیسے؟" : "With food?"}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {FOOD_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setFood(o.value)}
                  aria-pressed={food === o.value}
                  className={`${chip(food === o.value)} ${urduFont}`}
                >
                  {t(o.tkey)}
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div>
            <p className={`mb-2 text-lg font-bold text-stone-700 ${urduFont}`} dir="auto">
              {t("duration_label")}
            </p>
            <div className="flex flex-wrap gap-2">
              {DURATION_CHOICES.map((d) => (
                <button
                  key={d === null ? "forever" : d}
                  type="button"
                  onClick={() => setDuration(d)}
                  aria-pressed={duration === d}
                  className={`${chip(duration === d)} min-w-16 ${urduFont}`}
                >
                  {d === null ? (ur ? "مسلسل" : "Ongoing") : ur ? `${d} دن` : `${d} days`}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <p className={`text-base font-bold text-red-700 ${urduFont}`} dir="auto" role="alert">
              {t("error_generic")}
            </p>
          ) : null}
        </div>

        {/* Dialog footer */}
        <div className="grid grid-cols-2 gap-3 border-t border-stone-100 px-5 py-4">
          <button
            type="submit"
            disabled={!name.trim() || saving}
            className={`flex min-h-16 items-center justify-center rounded-2xl bg-emerald-600 text-xl font-extrabold text-white shadow-md disabled:opacity-40 touch-manipulation ${urduFont}`}
          >
            {saving ? (ur ? "محفوظ ہو رہا ہے..." : "Saving...") : t("save")}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className={`flex min-h-16 items-center justify-center rounded-2xl border-2 border-stone-300 bg-white text-xl font-extrabold text-stone-700 touch-manipulation ${urduFont}`}
          >
            {t("cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
