// ─────────────────────────────────────────────────────────────────────────────
// Sehat Saathi — alarm persistence + scheduling helpers (client only)
//   Alarms live in localStorage (LS_ALARMS); box photos live in IndexedDB.
//   The fired-registry (LS_FIRED) guarantees each alarm slot rings at most
//   once per day even though the scheduler polls every 20 seconds.
// ─────────────────────────────────────────────────────────────────────────────

import {
  LS_ALARMS,
  LS_FIRED,
  type Alarm,
  type ExtractedMedicine,
  type ExtractionResult,
  type FoodTiming,
  type Frequency,
  type Quantity,
  type TakenLogEntry,
} from "@/lib/schema";
import { idbDel, idbSet } from "@/lib/idb";

// ── Small utilities ──────────────────────────────────────────────────────────

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Local date as "YYYY-MM-DD". */
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Parse "YYYY-MM-DD" as a LOCAL date at midnight; null if malformed. */
function parseDateStr(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ── CRUD over localStorage ───────────────────────────────────────────────────

function persistAlarms(alarms: Alarm[]): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(LS_ALARMS, JSON.stringify(alarms));
  } catch {
    // Quota exceeded / private mode — nothing more we can do client-side.
  }
}

export function loadAlarms(): Alarm[] {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(LS_ALARMS);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Alarm[]) : [];
  } catch {
    return [];
  }
}

/** Insert or update (by id). */
export function saveAlarm(a: Alarm): void {
  const alarms = loadAlarms();
  const idx = alarms.findIndex((x) => x.id === a.id);
  if (idx >= 0) alarms[idx] = a;
  else alarms.push(a);
  persistAlarms(alarms);
}

export function deleteAlarm(id: string): void {
  const alarms = loadAlarms();
  const target = alarms.find((a) => a.id === id);
  persistAlarms(alarms.filter((a) => a.id !== id));
  if (target?.photoKey) {
    // Best-effort cleanup of the stored photo.
    void idbDel(target.photoKey).catch(() => undefined);
  }
}

/** Append a dose log entry to the alarm's taken_log. */
export function logDose(
  id: string,
  date: string,
  time: string,
  status: TakenLogEntry["status"]
): void {
  const alarms = loadAlarms();
  const alarm = alarms.find((a) => a.id === id);
  if (!alarm) return;
  if (!Array.isArray(alarm.taken_log)) alarm.taken_log = [];
  alarm.taken_log.push({ date, time, status });
  persistAlarms(alarms);
}

// ── Scheduling ───────────────────────────────────────────────────────────────

/** Is the alarm active on the given date? (start_date ≤ date < start + duration) */
export function isActiveOn(a: Alarm, date: Date): boolean {
  const start = parseDateStr(a.start_date);
  if (!start) return true; // corrupt start date — fail open so doses aren't silently lost
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // Both dates are local midnights; round handles DST hour shifts.
  const diffDays = Math.round((day.getTime() - start.getTime()) / 86_400_000);
  if (diffDays < 0) return false;
  if (a.duration_days === null || a.duration_days === undefined) return true;
  return diffDays < a.duration_days;
}

type FiredRegistry = Record<string, true>;

function loadFired(): FiredRegistry {
  if (!hasStorage()) return {};
  try {
    const raw = window.localStorage.getItem(LS_FIRED);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as FiredRegistry)
      : {};
  } catch {
    return {};
  }
}

function persistFired(reg: FiredRegistry): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(LS_FIRED, JSON.stringify(reg));
  } catch {
    // best-effort
  }
}

function firedKey(alarmId: string, date: string, time: string): string {
  return `${alarmId}_${date}_${time}`;
}

/**
 * Scan all alarms for a slot due right now.
 *
 * Window: `[slot - 3s, slot + 45s]`. Asymmetric on purpose — the alarm must
 * never ring BEFORE the scheduled minute (a symmetric ±60s window would fire
 * up to a minute early, which reads as broken to a user setting an alarm for
 * a specific time). The +45s tail covers our 20s poll interval plus jitter,
 * so we never miss a slot either.
 */
const WINDOW_EARLY_MS = 3_000;
const WINDOW_LATE_MS = 45_000;

export function findDueAlarm(now: Date): { alarm: Alarm; time: string } | null {
  const alarms = loadAlarms();
  if (alarms.length === 0) return null;
  const fired = loadFired();
  const dateStr = toDateStr(now);

  for (const alarm of alarms) {
    if (!Array.isArray(alarm.times)) continue;
    if (!isActiveOn(alarm, now)) continue;
    for (const time of alarm.times) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(time);
      if (!m) continue;
      const slot = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        Number(m[1]),
        Number(m[2]),
        0,
        0
      );
      const delta = now.getTime() - slot.getTime();
      // Only fire at (or a hair before) the scheduled time, up to 45s late.
      if (delta < -WINDOW_EARLY_MS || delta > WINDOW_LATE_MS) continue;
      if (fired[firedKey(alarm.id, dateStr, time)]) continue;
      return { alarm, time };
    }
  }
  return null;
}

/** Record that this alarm slot rang today — prevents double-rings across polls. */
export function markFired(alarmId: string, date: string, time: string): void {
  const reg = loadFired();
  reg[firedKey(alarmId, date, time)] = true;
  persistFired(reg);
}

/** Drop fired-registry entries that are not from today (keeps the registry tiny). */
export function clearOldFired(): void {
  const today = toDateStr(new Date());
  const reg = loadFired();
  const next: FiredRegistry = {};
  let changed = false;
  for (const key of Object.keys(reg)) {
    // Key shape: `${alarmId}_${YYYY-MM-DD}_${HH:MM}` — alarm ids contain no
    // underscores (UUIDs), so the date is always the second-to-last segment.
    const parts = key.split("_");
    const datePart = parts.length >= 3 ? parts[parts.length - 2] : null;
    if (datePart === today) next[key] = true;
    else changed = true;
  }
  if (changed) persistFired(next);
}

// ── Building alarms from an extraction result ────────────────────────────────

const QTY_UR: Record<Quantity, string> = {
  half_tablet: "کی آدھی گولی",
  one_tablet: "کی ایک گولی",
  two_tablets: "کی دو گولیاں",
  one_spoon: "کا ایک چمچ",
  half_spoon: "کا آدھا چمچ",
  drops: "کے قطرے",
  injection: "کا ٹیکہ",
  puff: "کا ایک پف",
  sachet: "کا ایک ساشے",
  unknown: "",
};

const QTY_EN: Record<Quantity, string> = {
  half_tablet: "Half a tablet of",
  one_tablet: "One tablet of",
  two_tablets: "Two tablets of",
  one_spoon: "One spoonful of",
  half_spoon: "Half a spoonful of",
  drops: "Drops of",
  injection: "An injection of",
  puff: "A puff of",
  sachet: "A sachet of",
  unknown: "",
};

const FOOD_UR: Record<FoodTiming, string> = {
  before_food: "کھانے سے پہلے",
  after_food: "کھانے کے بعد",
  empty_stomach: "خالی پیٹ",
  with_milk: "دودھ کے ساتھ",
  any: "",
  unknown: "",
};

const FOOD_EN: Record<FoodTiming, string> = {
  before_food: "before food",
  after_food: "after food",
  empty_stomach: "on an empty stomach",
  with_milk: "with milk",
  any: "",
  unknown: "",
};

/**
 * Compose the spoken Urdu announcement. Medicine name is kept in Latin script
 * on purpose — drug names are English (Panadol, Augmentin, Brufen) and TTS
 * mispronounces them badly when they arrive as Urdu transliteration, but
 * handles English proper-nouns embedded in Urdu speech surprisingly well.
 */
export function composeUrduAnnouncement(
  brandName: string,
  quantity: Quantity,
  food: FoodTiming,
): string {
  const qty = QTY_UR[quantity] ?? "";
  const foodPhrase = FOOD_UR[food] ?? "";
  const parts: string[] = ["دوا کا وقت ہو گیا ہے۔"];
  parts.push(qty ? `${brandName} ${qty}` : brandName);
  if (foodPhrase) parts.push(`، ${foodPhrase} لیں۔`);
  else parts.push(" لیں۔");
  return parts.join("");
}

export function composeEnglishAnnouncement(
  brandName: string,
  quantity: Quantity,
  food: FoodTiming,
): string {
  const qty = QTY_EN[quantity] ?? "";
  const foodPhrase = FOOD_EN[food] ?? "";
  const dose = qty ? `${qty} ${brandName}` : brandName;
  const suffix = foodPhrase ? `, ${foodPhrase}` : "";
  return `It is time for your medicine. Please take ${dose}${suffix}.`;
}

function urduAnnouncement(med: ExtractedMedicine): string {
  return composeUrduAnnouncement(med.brand_name, med.quantity, med.food);
}

function englishAnnouncement(med: ExtractedMedicine): string {
  return composeEnglishAnnouncement(med.brand_name, med.quantity, med.food);
}

/** Sensible default slots when the extraction did not provide times. */
function defaultTimesFor(freq: Frequency): string[] {
  switch (freq) {
    case "once_daily":
      return ["08:00"];
    case "twice_daily":
      return ["08:00", "20:00"];
    case "thrice_daily":
      return ["08:00", "14:00", "20:00"];
    case "four_times_daily":
      return ["06:00", "12:00", "18:00", "23:00"];
    case "every_8_hours":
      return ["06:00", "14:00", "22:00"];
    case "at_bedtime":
      return ["21:00"];
    case "once_weekly":
      return ["08:00"];
    case "as_needed":
      return []; // no scheduled ring — taken when needed
    case "unknown":
    default:
      return ["08:00"];
  }
}

/**
 * Turn a voted extraction result into Alarm objects, storing the prescription
 * photo (if any) in IndexedDB under `photo_${alarmId}`.
 */
export async function buildAlarmsFromExtraction(
  result: ExtractionResult,
  photoDataUrl: string | null
): Promise<Alarm[]> {
  const today = toDateStr(new Date());
  const nowIso = new Date().toISOString();
  const alarms: Alarm[] = [];

  for (const med of result.medicines) {
    const id = makeId();
    let photoKey: string | null = null;
    if (photoDataUrl) {
      photoKey = `photo_${id}`;
      try {
        await idbSet(photoKey, photoDataUrl);
      } catch {
        photoKey = null; // photo store failed — alarm still works, with placeholder
      }
    }

    const times =
      Array.isArray(med.times) && med.times.length > 0
        ? [...med.times]
        : defaultTimesFor(med.frequency);

    alarms.push({
      id,
      medicine_name: med.brand_name,
      salt: med.salt,
      photoKey,
      urdu_announcement: urduAnnouncement(med),
      english_announcement: englishAnnouncement(med),
      times,
      start_date: today,
      duration_days: med.duration_days,
      food: med.food,
      taken_log: [],
      created_at: nowIso,
    });
  }

  return alarms;
}
