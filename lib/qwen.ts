// ─────────────────────────────────────────────────────────────────────────────
// Sehat Saathi — Qwen client + shared server helpers (Track A)
// SERVER-ONLY: never import this from a client component. The API key must
// never reach the browser.
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI from "openai";
import type {
  ExtractedMedicine,
  ExtractionResult,
  FoodTiming,
  Frequency,
  PerMedicineCheck,
  PipelineStep,
  Quantity,
  SafetyResult,
  SafetyWarning,
  VerifyResult,
} from "@/lib/schema";
import { timesForFrequency } from "@/lib/vote";

export const qwen: OpenAI = new OpenAI({
  // Fallback keeps module import (and `next build`) from throwing when the env
  // var is absent; real calls will fail with a normal 401 instead of crashing.
  apiKey: process.env.DASHSCOPE_API_KEY ?? "missing-DASHSCOPE_API_KEY",
  baseURL:
    process.env.DASHSCOPE_BASE_URL ??
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
});

export const VISION_MODEL = process.env.QWEN_VISION_MODEL ?? "qwen3.7-plus";
export const REASONING_MODEL = process.env.QWEN_REASONING_MODEL ?? "qwen3.7-max";

/**
 * Extra params sent to Qwen 3 series when we want the FAST path — no hidden
 * reasoning phase before the answer. On ModelScope's OpenAI-compat endpoint
 * these are forwarded to the model via `extra_body`. If the endpoint doesn't
 * recognize a key, it silently ignores it (typical for OpenAI-compat gateways).
 *
 * Use this for:
 *   - chat replies (perceived latency matters, deep reasoning wastes time)
 *   - Qwen Max safety pass (small structured task, well-served by direct answer)
 *
 * Do NOT use for:
 *   - prescription extraction (handwriting parsing genuinely benefits from
 *     the model's chain-of-thought)
 */
export const FAST_MODE: Record<string, unknown> = {
  // Qwen 3.x thinking-mode kill switch. Documented for Qwen 3.0/3.5; also
  // accepted by 3.7 on ModelScope. Belt-and-braces: pass both known aliases.
  enable_thinking: false,
  reasoning_effort: "none",
};

/**
 * Parse JSON out of raw model output that may be wrapped in markdown fences,
 * prefixed with prose, or suffixed with commentary.
 *
 * Strategy: strip ``` fences → slice from the first "{" to the last "}" →
 * JSON.parse. If strict parsing fails, attempt cheap repairs for the two most
 * common model mistakes (trailing commas, curly quotes). Throws if no valid
 * JSON object can be recovered.
 */
export function parseJsonLoose(text: string): unknown {
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new Error("parseJsonLoose: empty model output");
  }
  // Remove markdown code fences (```json ... ``` or bare ```)
  const unfenced = text.replace(/```[a-zA-Z0-9_-]*/g, "").trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("parseJsonLoose: no JSON object found in model output");
  }
  const slice = unfenced.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    // Last-resort repairs (only reached when strict parse already failed):
    // 1. trailing commas before } or ]
    // 2. curly “smart” double quotes used as string delimiters
    const repaired = slice
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/[“”]/g, '"');
    return JSON.parse(repaired); // throws if still unparseable
  }
}

/**
 * Run `fn`, timing it, and push a {model, label, ms} step onto `trace`.
 * The step is recorded even when `fn` throws, so failed calls still show up
 * in the judge-facing DevPanel.
 */
export async function timed<T>(
  label: string,
  model: string,
  fn: () => Promise<T>,
  trace: PipelineStep[],
): Promise<T> {
  const started = Date.now();
  try {
    return await fn();
  } finally {
    trace.push({ model, label, ms: Date.now() - started });
  }
}

/**
 * Redact anything that looks like an API key from an error before logging.
 * (DashScope keys are "sk-..." — never let one hit the logs.)
 */
export function safeErrorMessage(err: unknown): string {
  const msg =
    err instanceof Error ? err.message : typeof err === "string" ? err : String(err);
  return msg.replace(/sk-[A-Za-z0-9_-]{4,}/g, "sk-***");
}

// ─────────────────────────────────────────────────────────────────────────────
// Defensive coercion — routes must NEVER crash on model garbage. These take
// unknown parsed JSON and force it into the exact shapes from lib/schema.
// ─────────────────────────────────────────────────────────────────────────────

const QUANTITIES: readonly Quantity[] = [
  "half_tablet",
  "one_tablet",
  "two_tablets",
  "one_spoon",
  "half_spoon",
  "drops",
  "injection",
  "puff",
  "sachet",
  "unknown",
];

const FREQUENCIES: readonly Frequency[] = [
  "once_daily",
  "twice_daily",
  "thrice_daily",
  "four_times_daily",
  "every_8_hours",
  "at_bedtime",
  "as_needed",
  "once_weekly",
  "unknown",
];

const FOODS: readonly FoodTiming[] = [
  "before_food",
  "after_food",
  "empty_stomach",
  "with_milk",
  "any",
  "unknown",
];

const WARNING_TYPES = ["duplicate_salt", "interaction", "implausible_dose", "other"] as const;
const SEVERITIES = ["info", "warning", "danger"] as const;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isObj(u: unknown): u is Record<string, unknown> {
  return typeof u === "object" && u !== null && !Array.isArray(u);
}

function asStr(u: unknown): string | null {
  return typeof u === "string" && u.trim() !== "" ? u.trim() : null;
}

function asBool(u: unknown, fallback: boolean): boolean {
  return typeof u === "boolean" ? u : fallback;
}

function num01(u: unknown, fallback: number): number {
  if (typeof u !== "number" || !Number.isFinite(u)) return fallback;
  return Math.min(1, Math.max(0, u));
}

function pickEnum<T extends string>(u: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof u === "string") {
    const v = u.trim().toLowerCase();
    if ((allowed as readonly string[]).includes(v)) return v as T;
  }
  return fallback;
}

function strArray(u: unknown, max = 30): string[] {
  if (!Array.isArray(u)) return [];
  return u
    .filter((s): s is string => typeof s === "string" && s.trim() !== "")
    .map((s) => s.trim())
    .slice(0, max);
}

/** Coerce arbitrary parsed JSON into a valid ExtractionResult. Never throws. */
export function coerceExtraction(u: unknown): ExtractionResult {
  const o = isObj(u) ? u : {};
  const medsIn = Array.isArray(o.medicines) ? o.medicines : [];
  const medicines: ExtractedMedicine[] = [];
  for (const raw of medsIn.slice(0, 15)) {
    if (!isObj(raw)) continue;
    const brand = asStr(raw.brand_name);
    if (!brand) continue;
    const frequency = pickEnum(raw.frequency, FREQUENCIES, "unknown");
    const conf = isObj(raw.confidence) ? raw.confidence : {};
    const givenTimes = Array.isArray(raw.times)
      ? raw.times.filter((t): t is string => typeof t === "string" && TIME_RE.test(t))
      : [];
    const times =
      givenTimes.length > 0 || frequency === "as_needed"
        ? givenTimes
        : timesForFrequency(frequency);
    const dur = raw.duration_days;
    medicines.push({
      brand_name: brand,
      salt: asStr(raw.salt),
      form: asStr(raw.form),
      directions_raw_urdu: asStr(raw.directions_raw_urdu),
      directions_raw_latin: asStr(raw.directions_raw_latin),
      quantity: pickEnum(raw.quantity, QUANTITIES, "unknown"),
      frequency,
      times,
      food: pickEnum(raw.food, FOODS, "unknown"),
      duration_days:
        typeof dur === "number" && Number.isFinite(dur) && dur > 0 ? Math.round(dur) : null,
      confidence: {
        brand_name: num01(conf.brand_name, 0.5),
        directions: num01(conf.directions, 0.5),
      },
      needs_user_confirmation: asBool(raw.needs_user_confirmation, true),
    });
  }
  return {
    medicines,
    doctor_notes: asStr(o.doctor_notes),
    unreadable_regions: strArray(o.unreadable_regions, 20),
    overall_confidence: num01(o.overall_confidence, medicines.length > 0 ? 0.5 : 0),
  };
}

/** Coerce arbitrary parsed JSON into a valid SafetyResult. Never throws. */
export function coerceSafety(u: unknown): SafetyResult {
  const o = isObj(u) ? u : {};
  const warnings: SafetyWarning[] = (Array.isArray(o.warnings) ? o.warnings : [])
    .filter(isObj)
    .map((w) => ({
      type: pickEnum(w.type, WARNING_TYPES, "other"),
      severity: pickEnum(w.severity, SEVERITIES, "warning"),
      text_ur: asStr(w.text_ur) ?? "",
      text_en: asStr(w.text_en) ?? "",
      medicines: strArray(w.medicines, 10),
    }))
    .filter((w) => w.text_ur !== "" || w.text_en !== "")
    .slice(0, 15);
  const per_medicine: PerMedicineCheck[] = (Array.isArray(o.per_medicine) ? o.per_medicine : [])
    .filter(isObj)
    .flatMap((p): PerMedicineCheck[] => {
      const brand = asStr(p.brand_name);
      if (!brand) return [];
      return [
        {
          brand_name: brand,
          plausible: asBool(p.plausible, true),
          note_ur: asStr(p.note_ur),
          note_en: asStr(p.note_en),
        },
      ];
    })
    .slice(0, 15);
  return {
    warnings,
    per_medicine,
    summary_ur: asStr(o.summary_ur) ?? "",
    summary_en: asStr(o.summary_en) ?? "",
  };
}

/** Coerce arbitrary parsed JSON into a valid VerifyResult. Never throws. */
export function coerceVerify(u: unknown): VerifyResult {
  const o = isObj(u) ? u : {};
  return {
    match: typeof o.match === "boolean" ? o.match : null,
    matched_brand: asStr(o.matched_brand),
    salt_seen: asStr(o.salt_seen),
    expiry_date: asStr(o.expiry_date),
    expired: typeof o.expired === "boolean" ? o.expired : null,
    explanation_ur: asStr(o.explanation_ur) ?? "",
    explanation_en: asStr(o.explanation_en) ?? "",
  };
}
