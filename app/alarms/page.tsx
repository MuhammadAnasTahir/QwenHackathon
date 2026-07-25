"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  EVT_TEST_ALARM,
  type Alarm,
  type FoodTiming,
  type Frequency,
  type Quantity,
} from "@/lib/schema";
import type { TKey } from "@/lib/translations";
import { useLang } from "@/lib/i18n";
import {
  composeEnglishAnnouncement,
  composeRomanUrduAnnouncement,
  composeUrduAnnouncement,
  deleteAlarm,
  loadAlarms,
  markFired,
  saveAlarm,
} from "@/lib/alarms";
import { idbGet, idbSet } from "@/lib/idb";
import { fileToDataUrl, thumbnail } from "@/lib/image";
import { AlarmCard } from "@/components/AlarmCard";
import { LanguageToggle } from "@/components/LanguageToggle";
import { MicButton } from "@/components/MicButton";
import { PrescriptionExtractDialog } from "@/components/PrescriptionExtractDialog";
import { SpeakButton } from "@/components/SpeakButton";

// ── Local helpers (page-scoped, mirror the shared enums) ─────────────────────

type AddFrequency = Exclude<Frequency, "every_8_hours" | "once_weekly" | "unknown">;

const FREQ_OPTIONS: { value: AddFrequency; tkey: TKey; icon: string }[] = [
  { value: "once_daily", tkey: "freq_once", icon: "1️⃣" },
  { value: "twice_daily", tkey: "freq_twice", icon: "2️⃣" },
  { value: "thrice_daily", tkey: "freq_thrice", icon: "3️⃣" },
  { value: "four_times_daily", tkey: "freq_four", icon: "4️⃣" },
  { value: "at_bedtime", tkey: "freq_bedtime", icon: "🌙" },
  { value: "as_needed", tkey: "freq_needed", icon: "🆘" },
];

const FOOD_OPTIONS: { value: FoodTiming; tkey: TKey; icon: string }[] = [
  { value: "before_food", tkey: "food_before", icon: "🍽️" },
  { value: "after_food", tkey: "food_after", icon: "🍽️" },
  { value: "empty_stomach", tkey: "food_empty", icon: "⛔" },
  { value: "with_milk", tkey: "food_milk", icon: "🥛" },
  { value: "any", tkey: "food_any", icon: "🆗" },
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

function timeIcon(hhmm: string): string {
  const h = Number.parseInt(hhmm.slice(0, 2), 10);
  if (Number.isNaN(h)) return "⏰";
  if (h >= 4 && h < 11) return "☀️";
  if (h >= 11 && h < 16) return "🌤️";
  if (h >= 16 && h < 20) return "🌆";
  return "🌙";
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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AlarmsPage() {
  const { lang, t, dir } = useLang();
  const ur = lang === "ur";
  const urduFont = ur ? "font-urdu leading-loose" : "";

  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [showExtract, setShowExtract] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [quickAddedTime, setQuickAddedTime] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const list = loadAlarms();
    setAlarms(list);
    for (const a of list) {
      if (!a.photoKey) continue;
      void idbGet(a.photoKey)
        .then((url) => {
          if (url) setPhotos((prev) => (prev[a.id] === url ? prev : { ...prev, [a.id]: url }));
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load-on-mount from localStorage/IndexedDB, not derivable during render
    refresh();
  }, [refresh]);

  const DEMO_DELAY_SECONDS = 30;

  /**
   * Demo helper: create a real alarm (persisted the same way a real
   * prescription's alarm is) that rings exactly DEMO_DELAY_SECONDS from now.
   *
   * Ringing itself goes through EVT_TEST_ALARM's precise setTimeout rather
   * than the ordinary poll + findDueAlarm() minute-granularity match — that
   * matcher only resolves to whole-minute slots (checked every 20s with a
   * small early/late grace window), so a 30s target could take up to ~90s
   * to actually ring, breaking the button's promise. We still save the real
   * Alarm (so it shows in the list like any other) and pre-mark its slot as
   * fired so the ordinary poll doesn't also independently ring it later.
   */
  const quickDemoAlarm = () => {
    const now = new Date();
    const target = new Date(now.getTime() + DEMO_DELAY_SECONDS * 1000);
    const hh = String(target.getHours()).padStart(2, "0");
    const mm = String(target.getMinutes()).padStart(2, "0");
    const time = `${hh}:${mm}`;
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `id-${Date.now().toString(36)}`;
    const quantity: Quantity = "one_tablet";
    const food: FoodTiming = "after_food";
    const brand = "Panadol 500mg";
    const alarm: Alarm = {
      id,
      medicine_name: brand,
      salt: "paracetamol",
      photoKey: null,
      urdu_announcement: composeUrduAnnouncement(brand, quantity, food),
      roman_urdu_announcement: composeRomanUrduAnnouncement(brand, quantity, food),
      english_announcement: composeEnglishAnnouncement(brand, quantity, food),
      times: [time],
      start_date: todayStr(),
      duration_days: 1,
      food,
      taken_log: [],
      created_at: now.toISOString(),
    };
    saveAlarm(alarm);
    markFired(id, todayStr(), time);
    window.dispatchEvent(new CustomEvent(EVT_TEST_ALARM, { detail: { seconds: DEMO_DELAY_SECONDS, alarmId: id } }));
    setQuickAddedTime(time);
    refresh();
    window.setTimeout(() => setQuickAddedTime(null), 8000);
  };

  const doDelete = (id: string) => {
    deleteAlarm(id);
    setConfirmId(null);
    refresh();
  };

  const confirmTarget = confirmId ? alarms.find((a) => a.id === confirmId) ?? null : null;

  const screenSummary = (() => {
    if (alarms.length === 0) {
      return `${t("alarms_title")}${ur ? "۔ " : ". "}${t("alarms_empty")}`;
    }
    const parts = alarms.map((a) => `${a.medicine_name}: ${a.times.join(ur ? "، " : ", ")}`);
    return `${t("alarms_title")}. ${parts.join(ur ? "۔ " : ". ")}`;
  })();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-stone-200 bg-white/90 px-3 py-2 backdrop-blur">
        <Link
          href="/"
          aria-label={ur ? "واپس" : "Back"}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl text-stone-600 active:bg-stone-100"
        >
          <span aria-hidden="true">{dir === "rtl" ? "→" : "←"}</span>
        </Link>
        <h1 className={`flex-1 truncate text-2xl font-extrabold text-stone-900 ${urduFont}`} dir="auto">
          ⏰ {t("alarms_title")}
        </h1>
        <SpeakButton text={screenSummary} className="h-14 w-14 text-xl" />
        <LanguageToggle />
      </header>

      <main className="flex-1 space-y-4 px-4 py-4">
        {/* Quick demo: sets a real alarm that rings exactly 30s from now via
            EVT_TEST_ALARM's precise timer (see quickDemoAlarm). Useful for
            showing judges the ring flow without waiting for a scheduled
            time to arrive. */}
        <button
          type="button"
          onClick={quickDemoAlarm}
          disabled={quickAddedTime !== null}
          className={`flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-lg font-extrabold shadow-sm transition-transform active:scale-[0.98] ${
            quickAddedTime !== null
              ? "animate-pulse border-amber-400 bg-amber-50 text-amber-800"
              : "border-emerald-300 bg-white text-emerald-700"
          } ${urduFont}`}
        >
          🧪{" "}
          {quickAddedTime !== null
            ? ur
              ? `الارم ${quickAddedTime} پر بجے گا`
              : `Alarm will ring at ${quickAddedTime}`
            : ur
              ? "30 سیکنڈ بعد کا الارم بنائیں (ڈیمو)"
              : "Set a demo alarm 30 seconds from now"}
        </button>

        {/* Photograph-the-prescription CTA — ALWAYS visible, no matter how
            many alarms already exist. Opens the CaptureOrUpload → extract
            → review dialog in place; does NOT redirect to /chat. */}
        <button
          type="button"
          onClick={() => setShowExtract(true)}
          className="flex min-h-28 w-full flex-col items-center justify-center gap-1 rounded-3xl bg-emerald-600 p-4 text-white shadow-lg shadow-emerald-900/20 transition-transform active:scale-[0.98]"
        >
          <span aria-hidden="true" className="text-4xl leading-none">
            📸
          </span>
          <span className={`text-center text-xl font-extrabold ${urduFont}`} dir="auto">
            {ur ? "نسخے کی تصویر سے الارم بنائیں" : "Create alarms from a prescription"}
          </span>
          <span className={`text-center text-xs text-emerald-100 ${urduFont}`} dir="auto">
            {ur ? "تصویر لیں یا اپلوڈ کریں" : "Take a photo or upload one"}
          </span>
        </button>

        {/* Manual add — also always visible */}
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className={`flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-emerald-300 bg-white text-xl font-extrabold text-emerald-700 shadow-sm transition-transform active:scale-[0.98] ${urduFont}`}
        >
          ➕ {t("alarms_add")}
        </button>

        {/* Success toast after prescription extraction */}
        {savedMsg ? (
          <div
            role="status"
            className={`rounded-2xl bg-emerald-50 p-3 text-center text-base font-bold text-emerald-800 ${urduFont}`}
            dir="auto"
          >
            ✅ {savedMsg}
          </div>
        ) : null}

        {/* My Alarms section */}
        {alarms.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-2 py-6 text-center">
            <span aria-hidden="true" className="text-6xl">
              💊
            </span>
            <p className={`text-lg font-semibold text-stone-500 ${urduFont}`} dir="auto">
              {t("alarms_empty")}
            </p>
          </div>
        ) : (
          <section className="mt-6 space-y-3">
            <h2
              className={`px-1 text-lg font-extrabold uppercase tracking-wide text-stone-500 ${urduFont}`}
              dir="auto"
            >
              {ur ? "میرے الارم" : "My Alarms"}
            </h2>
            {alarms.map((a) => (
              <AlarmCard
                key={a.id}
                alarm={a}
                photo={photos[a.id] ?? null}
                onDelete={(id) => setConfirmId(id)}
              />
            ))}
          </section>
        )}
      </main>

      {/* Persistent disclaimer */}
      <footer className="px-6 pb-4">
        <p className={`text-center text-sm text-stone-400 ${urduFont}`} dir="auto">
          ⚠️ {t("disclaimer")}
        </p>
      </footer>

      {/* Delete confirmation dialog */}
      {confirmTarget ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-5 shadow-2xl">
            <p className={`text-center text-xl font-extrabold text-stone-900 ${urduFont}`} dir="auto">
              🗑️{" "}
              {ur
                ? `کیا "${confirmTarget.medicine_name}" کا الارم ہٹا دیں؟`
                : `Delete the alarm for "${confirmTarget.medicine_name}"?`}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => doDelete(confirmTarget.id)}
                className={`flex min-h-16 items-center justify-center rounded-2xl bg-red-600 text-xl font-extrabold text-white shadow-md active:bg-red-700 ${urduFont}`}
              >
                {t("delete")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmId(null)}
                className={`flex min-h-16 items-center justify-center rounded-2xl border-2 border-stone-300 bg-white text-xl font-extrabold text-stone-700 active:bg-stone-50 ${urduFont}`}
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Manual add dialog */}
      {showAdd ? (
        <AddAlarmDialog
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            refresh();
          }}
        />
      ) : null}

      {/* Photograph-a-prescription → extraction → review → alarms saved */}
      <PrescriptionExtractDialog
        open={showExtract}
        onClose={() => setShowExtract(false)}
        onSaved={(count) => {
          setShowExtract(false);
          refresh();
          const msg = ur
            ? count > 1
              ? `${count} دواؤں کے الارم بن گئے`
              : "الارم بن گیا"
            : count > 1
              ? `${count} alarms created`
              : "Alarm created";
          setSavedMsg(msg);
          window.setTimeout(() => setSavedMsg(null), 5000);
        }}
      />
    </div>
  );
}

// ── Manual add form ──────────────────────────────────────────────────────────

function AddAlarmDialog({ onClose, onSaved }: { onClose(): void; onSaved(): void }) {
  const { lang, t } = useLang();
  const ur = lang === "ur";
  const urduFont = ur ? "font-urdu leading-loose" : "";

  const [photo, setPhoto] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [freq, setFreq] = useState<AddFrequency>("once_daily");
  const [times, setTimes] = useState<string[]>(defaultTimes("once_daily"));
  const [food, setFood] = useState<FoodTiming>("any");
  const [duration, setDuration] = useState<number | null>(null);
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
      const id = makeId();
      let photoKey: string | null = null;
      if (photo) {
        photoKey = `photo_${id}`;
        try {
          await idbSet(photoKey, photo);
        } catch {
          photoKey = null;
        }
      }
      // We don't ask the user for quantity in the manual form (it's a hackathon
      // add-in). "one_tablet" is by far the most common case; if it's wrong,
      // the announcement still names the medicine and the food timing, which
      // is what a low-literacy user actually needs to hear.
      const quantity: Quantity = "one_tablet";
      const alarm: Alarm = {
        id,
        medicine_name: trimmed,
        salt: null,
        photoKey,
        urdu_announcement: composeUrduAnnouncement(trimmed, quantity, food),
        roman_urdu_announcement: composeRomanUrduAnnouncement(trimmed, quantity, food),
        english_announcement: composeEnglishAnnouncement(trimmed, quantity, food),
        times: [...times],
        start_date: todayStr(),
        duration_days: duration,
        food,
        taken_log: [],
        created_at: new Date().toISOString(),
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
      <div className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        {/* Dialog header */}
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3">
          <h2 className={`text-2xl font-extrabold text-stone-900 ${urduFont}`} dir="auto">
            ➕ {t("alarms_add")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("cancel")}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-xl text-stone-600 active:bg-stone-200"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Photo of the box — the identifier for our user */}
          <div>
            <p className={`mb-2 text-lg font-bold text-stone-700 ${urduFont}`} dir="auto">
              📷 {t("add_photo")}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
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
                <span aria-hidden="true">📦</span>
              )}
            </button>
          </div>

          {/* Name — typed or spoken */}
          <div>
            <p className={`mb-2 text-lg font-bold text-stone-700 ${urduFont}`} dir="auto">
              💊 {t("medicine_name")}
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
              🔁 {ur ? "دن میں کتنی بار؟" : "How often?"}
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
                  <span aria-hidden="true">{o.icon}</span> {t(o.tkey)}
                </button>
              ))}
            </div>
          </div>

          {/* Times (auto from frequency, editable) */}
          {times.length > 0 ? (
            <div>
              <p className={`mb-2 text-lg font-bold text-stone-700 ${urduFont}`} dir="auto">
                ⏰ {t("times_label")}
              </p>
              <div className="flex flex-wrap gap-3">
                {times.map((tm, i) => (
                  <label key={i} className="flex flex-col items-center gap-1 rounded-2xl bg-stone-50 p-3">
                    <span aria-hidden="true" className="text-3xl leading-none">
                      {timeIcon(tm)}
                    </span>
                    <input
                      type="time"
                      dir="ltr"
                      value={tm}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return;
                        setTimes((prev) => prev.map((x, j) => (j === i ? v : x)));
                      }}
                      className="h-14 w-32 rounded-xl border-2 border-stone-200 bg-white px-2 text-center text-xl font-bold text-stone-800 focus:border-emerald-500 focus:outline-none"
                    />
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {/* Food timing */}
          <div>
            <p className={`mb-2 text-lg font-bold text-stone-700 ${urduFont}`} dir="auto">
              🍽️ {ur ? "کھانے کے ساتھ کیسے؟" : "With food?"}
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
                  <span aria-hidden="true">{o.icon}</span> {t(o.tkey)}
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div>
            <p className={`mb-2 text-lg font-bold text-stone-700 ${urduFont}`} dir="auto">
              📅 {t("duration_label")}
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
            type="button"
            onClick={() => void save()}
            disabled={!name.trim() || saving}
            className={`flex min-h-16 items-center justify-center rounded-2xl bg-emerald-600 text-xl font-extrabold text-white shadow-md active:bg-emerald-700 disabled:opacity-40 ${urduFont}`}
          >
            {saving ? "⏳" : "✅"} {t("save")}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className={`flex min-h-16 items-center justify-center rounded-2xl border-2 border-stone-300 bg-white text-xl font-extrabold text-stone-700 active:bg-stone-50 ${urduFont}`}
          >
            {t("cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
