// ─────────────────────────────────────────────────────────────────────────────
// Sehat Saathi — shared types (the single source of truth for all modules)
// Every module imports from here. Do not redefine these shapes elsewhere.
// ─────────────────────────────────────────────────────────────────────────────

export type Lang = "ur" | "en";

// ── Extraction (closed vocabulary — mirrors the enums in the extraction prompt)

export type Quantity =
  | "half_tablet"
  | "one_tablet"
  | "two_tablets"
  | "one_spoon"
  | "half_spoon"
  | "drops"
  | "injection"
  | "puff"
  | "sachet"
  | "unknown";

export type Frequency =
  | "once_daily"
  | "twice_daily"
  | "thrice_daily"
  | "four_times_daily"
  | "every_8_hours"
  | "at_bedtime"
  | "as_needed"
  | "once_weekly"
  | "unknown";

export type FoodTiming =
  | "before_food"
  | "after_food"
  | "empty_stomach"
  | "with_milk"
  | "any"
  | "unknown";

export interface ExtractedMedicine {
  brand_name: string;
  salt: string | null;
  form: string | null; // tablet | syrup | capsule | drops | injection | cream | ...
  directions_raw_urdu: string | null; // literal Urdu text as seen on paper
  directions_raw_latin: string | null; // literal Latin notation as seen (e.g. "1 BD")
  quantity: Quantity;
  frequency: Frequency;
  times: string[]; // "HH:MM" 24h, derived from frequency (defaults 08:00/14:00/21:00)
  food: FoodTiming;
  duration_days: number | null;
  confidence: { brand_name: number; directions: number }; // 0..1
  needs_user_confirmation: boolean;
}

export interface ExtractionResult {
  medicines: ExtractedMedicine[];
  doctor_notes: string | null;
  unreadable_regions: string[];
  overall_confidence: number; // 0..1
}

// ── Safety pass (Qwen Max)

export interface SafetyWarning {
  type: "duplicate_salt" | "interaction" | "implausible_dose" | "other";
  severity: "info" | "warning" | "danger";
  text_ur: string;
  text_en: string;
  medicines: string[]; // brand names involved
}

export interface PerMedicineCheck {
  brand_name: string;
  plausible: boolean;
  note_ur: string | null;
  note_en: string | null;
}

export interface SafetyResult {
  warnings: SafetyWarning[];
  per_medicine: PerMedicineCheck[];
  summary_ur: string;
  summary_en: string;
}

// ── Verify ("is this the right medicine?" + expiry)

export interface VerifyResult {
  match: boolean | null; // null = could not tell
  matched_brand: string | null;
  salt_seen: string | null;
  expiry_date: string | null; // "YYYY-MM" or "YYYY-MM-DD" as printed
  expired: boolean | null;
  explanation_ur: string;
  explanation_en: string;
}

// ── Pipeline trace (shown in the judge-facing DevPanel)

export interface PipelineStep {
  model: string; // e.g. "qwen3.7-plus"
  label: string; // e.g. "extraction run 1/3"
  ms: number;
}

export interface PipelineTrace {
  steps: PipelineStep[];
}

// ── API request/response shapes

export interface ChatApiRequest {
  messages: { role: "user" | "assistant"; content: string }[];
  images?: string[]; // data URLs, attached to the LAST user message
  language: Lang;
}
export interface ChatApiResponse {
  reply: string;
  red_flag: boolean; // model detected an emergency → client shows 1122 banner
  trace: PipelineTrace;
}

export interface ExtractApiRequest {
  image: string; // data URL (JPEG/PNG)
  runs?: number; // self-consistency votes, default 3
}
export interface ExtractApiResponse {
  result: ExtractionResult; // majority-voted
  safety: SafetyResult | null; // Max grounding pass (null if it failed)
  runs_raw: ExtractionResult[]; // individual runs, for the DevPanel
  trace: PipelineTrace;
}

export interface SafetyApiRequest {
  medicines: { brand_name: string; salt: string | null }[];
  language: Lang;
}
// response: SafetyResult & { trace: PipelineTrace }

export interface VerifyApiRequest {
  image: string; // data URL of the medicine box photo
  medicines: { brand_name: string; salt: string | null }[]; // from saved alarms
}
// response: VerifyResult & { trace: PipelineTrace }

// ── Alarms (client-side persistence)

export interface TakenLogEntry {
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:MM" (the scheduled slot)
  status: "taken" | "missed" | "snoozed";
}

export interface Alarm {
  id: string; // crypto.randomUUID()
  medicine_name: string;
  salt: string | null;
  photoKey: string | null; // IndexedDB key for the box photo (data URL value)
  urdu_announcement: string; // shown when ringing, e.g. "آگمنٹن کی ایک گولی، کھانے کے بعد"
  roman_urdu_announcement?: string; // spoken for "ur" alarms via an en voice, e.g. "Aap ka Panadol khane ka waqt ho gaya hai" — optional for alarms saved before this field existed
  english_announcement: string;
  times: string[]; // "HH:MM" 24h
  start_date: string; // "YYYY-MM-DD"
  duration_days: number | null; // null = ongoing
  food: FoodTiming;
  taken_log: TakenLogEntry[];
  created_at: string; // ISO
}

// ── Cross-component events (window CustomEvent names)

export const EVT_TEST_ALARM = "ss:test-alarm"; // detail: { seconds: number }
export const EVT_TRACE = "ss:trace"; // detail: PipelineTrace (DevPanel listens)
export const LS_ALARMS = "ss_alarms";
export const LS_LANG = "ss_lang";
export const LS_FIRED = "ss_fired"; // { [alarmId_date_time]: true }
