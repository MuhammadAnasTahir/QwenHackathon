// ─────────────────────────────────────────────────────────────────────────────
// lib/vote.ts — self-consistency voting across N extraction runs.
// The same prescription image is read N times at temperature 0.3; fields where
// the runs disagree are, by definition, low-confidence. This module merges the
// runs into one ExtractionResult via per-field majority vote.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ExtractedMedicine,
  ExtractionResult,
  Frequency,
} from "@/lib/schema";

/** Canonical alarm times for each frequency (mirrors the extraction prompt). */
export function timesForFrequency(freq: Frequency): string[] {
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
    case "as_needed":
      return [];
    case "once_weekly":
      return ["08:00"];
    default:
      return ["08:00"];
  }
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Normalize a brand name for grouping: lowercase, drop spaces, strip a
 * trailing strength suffix ("625mg", "40", "120 ml"), drop punctuation.
 */
function normalizeBrand(name: string): string {
  let s = name.toLowerCase().replace(/\s+/g, "");
  // strip trailing strength/pack suffixes: 625mg, 40, 5%, 120ml, 1g ...
  s = s.replace(/(?:\d+(?:\.\d+)?(?:mg|ml|mcg|g|iu|%)?)+$/g, "");
  // keep only Latin letters and Arabic-script letters
  s = s.replace(/[^a-z؀-ۿ]/g, "");
  return s;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** Fuzzy match between two normalized brand keys. */
function sameBrand(a: string, b: string): boolean {
  if (a.length === 0 || b.length === 0) return a === b;
  if (a === b) return true;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  return levenshtein(a, b) <= 2;
}

interface Mode<T> {
  value: T;
  count: number;
  unanimous: boolean;
}

/** Most common value (first-seen wins ties). */
function mode<T>(values: T[]): Mode<T> {
  const counts = new Map<string, { value: T; count: number }>();
  for (const v of values) {
    const k = JSON.stringify(v ?? null);
    const e = counts.get(k);
    if (e) e.count += 1;
    else counts.set(k, { value: v, count: 1 });
  }
  let best: { value: T; count: number } | null = null;
  for (const e of counts.values()) {
    if (!best || e.count > best.count) best = e;
  }
  // values is never empty where we call this, but stay safe:
  if (!best) return { value: values[0], count: 0, unanimous: true };
  return { value: best.value, count: best.count, unanimous: counts.size === 1 };
}

interface Group {
  key: string;
  members: ExtractedMedicine[];
  runsSeen: Set<number>;
}

/**
 * Merge N extraction runs into one voted result.
 * - Medicines grouped by fuzzy-normalized brand name.
 * - Enum fields (quantity/frequency/food) + duration majority-voted.
 * - times re-derived from the voted frequency.
 * - Any disagreement on quantity/frequency/food → needs_user_confirmation and
 *   directions confidence pinned to the minimum across runs.
 * - Medicines seen in fewer than ceil(n/2) runs are dropped (unless n ≤ 2).
 * - overall_confidence = mean per-medicine confidence × agreement ratio.
 */
export function voteExtractions(runs: ExtractionResult[]): ExtractionResult {
  const valid = runs.filter((r) => r && Array.isArray(r.medicines));
  const n = valid.length;
  if (n === 0) {
    return {
      medicines: [],
      doctor_notes: null,
      unreadable_regions: [],
      overall_confidence: 0,
    };
  }

  const groups: Group[] = [];
  valid.forEach((run, ri) => {
    for (const med of run.medicines) {
      if (!med || typeof med.brand_name !== "string" || med.brand_name.trim() === "") continue;
      const key = normalizeBrand(med.brand_name);
      let g = groups.find((grp) => sameBrand(grp.key, key));
      if (!g) {
        g = { key, members: [], runsSeen: new Set<number>() };
        groups.push(g);
      }
      g.members.push(med);
      g.runsSeen.add(ri);
    }
  });

  const minAppearances = n <= 2 ? 1 : Math.ceil(n / 2);
  const kept = groups.filter((g) => g.runsSeen.size >= minAppearances);

  const medicines: ExtractedMedicine[] = kept.map((g) => {
    const ms = g.members;

    const q = mode(ms.map((m) => m.quantity ?? "unknown"));
    const f = mode(ms.map((m) => m.frequency ?? "unknown"));
    const fd = mode(ms.map((m) => m.food ?? "unknown"));
    const dur = mode(ms.map((m) => (typeof m.duration_days === "number" ? m.duration_days : null)));
    const disagreement = !q.unanimous || !f.unanimous || !fd.unanimous;

    // Representative run: one that agrees with the majority frequency.
    const rep = ms.find((m) => m.frequency === f.value) ?? ms[0];
    const firstNonNull = (get: (m: ExtractedMedicine) => string | null): string | null => {
      for (const m of ms) {
        const v = get(m);
        if (typeof v === "string" && v.trim() !== "") return v;
      }
      return null;
    };
    const pickStr = (get: (m: ExtractedMedicine) => string | null): string | null => {
      const v = get(rep);
      return typeof v === "string" && v.trim() !== "" ? v : firstNonNull(get);
    };

    const brandConfs = ms
      .map((m) => m.confidence?.brand_name)
      .filter((c): c is number => typeof c === "number" && Number.isFinite(c));
    const dirConfs = ms
      .map((m) => m.confidence?.directions)
      .filter((c): c is number => typeof c === "number" && Number.isFinite(c));
    const brandConf = brandConfs.length > 0 ? avg(brandConfs) : 0.5;
    const dirConf = dirConfs.length === 0 ? 0.5 : disagreement ? Math.min(...dirConfs) : avg(dirConfs);

    const frequency = f.value;
    const repTimes = Array.isArray(rep.times) ? rep.times.filter((t) => typeof t === "string" && TIME_RE.test(t)) : [];
    const times =
      frequency !== "unknown"
        ? timesForFrequency(frequency)
        : repTimes.length > 0
          ? repTimes
          : ["08:00"];

    return {
      brand_name: rep.brand_name,
      salt: pickStr((m) => m.salt),
      form: pickStr((m) => m.form),
      directions_raw_urdu: pickStr((m) => m.directions_raw_urdu),
      directions_raw_latin: pickStr((m) => m.directions_raw_latin),
      quantity: q.value,
      frequency,
      times,
      food: fd.value,
      duration_days: dur.value,
      confidence: { brand_name: clamp01(brandConf), directions: clamp01(dirConf) },
      needs_user_confirmation:
        disagreement || g.runsSeen.size < n || ms.some((m) => m.needs_user_confirmation === true),
    };
  });

  const agreementRatio = kept.length > 0 ? avg(kept.map((g) => g.runsSeen.size / n)) : 0;
  const meanConf =
    medicines.length > 0
      ? avg(medicines.map((m) => (m.confidence.brand_name + m.confidence.directions) / 2))
      : 0;

  const notes = valid
    .map((r) => r.doctor_notes)
    .find((d) => typeof d === "string" && d.trim() !== "");
  const unreadable = Array.from(
    new Set(
      valid.flatMap((r) =>
        Array.isArray(r.unreadable_regions)
          ? r.unreadable_regions.filter((s) => typeof s === "string" && s.trim() !== "")
          : [],
      ),
    ),
  );

  return {
    medicines,
    doctor_notes: notes ?? null,
    unreadable_regions: unreadable,
    overall_confidence: clamp01(meanConf * agreementRatio),
  };
}
