// Shared presentational helpers for Track C components (internal to components/).
// Enum → human label maps. Where a TKey exists in lib/translations we use t();
// for enum members without a TKey we keep small local bilingual maps here.

import type { FoodTiming, Frequency, Lang, Quantity } from "@/lib/schema";
import type { TKey } from "@/lib/translations";

export type TFn = (k: TKey) => string;

/** True when the string contains Arabic-script (Urdu) characters. */
export function isArabicScript(s: string): boolean {
  return /[؀-ۿ]/.test(s);
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local date as "YYYY-MM-DD". */
export function todayStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Local time as "HH:MM". */
export function nowHHMM(d: Date = new Date()): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Time-of-day emoji for an "HH:MM" slot. */
export function timeOfDayIcon(hhmm: string): string {
  const h = Number.parseInt(hhmm.slice(0, 2), 10);
  if (Number.isNaN(h)) return "⏰";
  if (h >= 4 && h < 11) return "☀️";
  if (h >= 11 && h < 16) return "🌤️";
  if (h >= 16 && h < 20) return "🌆";
  return "🌙";
}

/** Translation key for the time-of-day of an "HH:MM" slot. */
export function timeOfDayKey(hhmm: string): TKey {
  const h = Number.parseInt(hhmm.slice(0, 2), 10);
  if (Number.isNaN(h)) return "night";
  if (h >= 4 && h < 11) return "morning";
  if (h >= 11 && h < 16) return "noon";
  if (h >= 16 && h < 20) return "evening";
  return "night";
}

const QUANTITY_LABELS: Record<Quantity, { ur: string; en: string }> = {
  half_tablet: { ur: "آدھی گولی", en: "Half tablet" },
  one_tablet: { ur: "ایک گولی", en: "One tablet" },
  two_tablets: { ur: "دو گولیاں", en: "Two tablets" },
  one_spoon: { ur: "ایک چمچ", en: "One spoon" },
  half_spoon: { ur: "آدھا چمچ", en: "Half spoon" },
  drops: { ur: "قطرے", en: "Drops" },
  injection: { ur: "ٹیکہ", en: "Injection" },
  puff: { ur: "پف", en: "Puff" },
  sachet: { ur: "ساشے", en: "Sachet" },
  unknown: { ur: "معلوم نہیں", en: "Not known" },
};

export function quantityLabel(q: Quantity, lang: Lang): string {
  return QUANTITY_LABELS[q]?.[lang] ?? QUANTITY_LABELS.unknown[lang];
}

const FREQ_EXTRA: Record<string, { ur: string; en: string }> = {
  every_8_hours: { ur: "ہر آٹھ گھنٹے بعد", en: "Every 8 hours" },
  once_weekly: { ur: "ہفتے میں ایک بار", en: "Once a week" },
  unknown: { ur: "معلوم نہیں", en: "Not known" },
};

export function frequencyLabel(f: Frequency, t: TFn, lang: Lang): string {
  switch (f) {
    case "once_daily":
      return t("freq_once");
    case "twice_daily":
      return t("freq_twice");
    case "thrice_daily":
      return t("freq_thrice");
    case "four_times_daily":
      return t("freq_four");
    case "at_bedtime":
      return t("freq_bedtime");
    case "as_needed":
      return t("freq_needed");
    default:
      return (FREQ_EXTRA[f] ?? FREQ_EXTRA.unknown)[lang];
  }
}

const FOOD_UNKNOWN = { ur: "معلوم نہیں", en: "Not known" };

export function foodLabel(f: FoodTiming, t: TFn, lang: Lang): string {
  switch (f) {
    case "before_food":
      return t("food_before");
    case "after_food":
      return t("food_after");
    case "empty_stomach":
      return t("food_empty");
    case "with_milk":
      return t("food_milk");
    case "any":
      return t("food_any");
    default:
      return FOOD_UNKNOWN[lang];
  }
}

export function foodIcon(f: FoodTiming): string {
  switch (f) {
    case "before_food":
    case "after_food":
      return "🍽️";
    case "empty_stomach":
      return "⛔";
    case "with_milk":
      return "🥛";
    case "any":
      return "🆗";
    default:
      return "❓";
  }
}

export function durationLabel(days: number | null, lang: Lang): string {
  if (days === null) return lang === "ur" ? "مسلسل" : "Ongoing";
  return lang === "ur" ? `${days} دن` : `${days} ${days === 1 ? "day" : "days"}`;
}
