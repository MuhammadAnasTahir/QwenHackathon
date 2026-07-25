"use client";

import { useLang } from "@/lib/i18n";

/**
 * Multi-step pipeline timeline shown while /api/extract streams progress
 * events. Same shape everywhere it appears (inside the alarms dialog, and
 * inline in the chat transcript) so users see a consistent story.
 *
 * A step's `status` is derived from the current stage returned by the server:
 *   - stages BEFORE the current one → done (✅ green)
 *   - the current stage             → running (emoji, amber pulse)
 *   - stages AFTER the current one  → pending (○ grey)
 * The `prep` stage is emitted first, so once the timeline appears it always
 * has at least one row marked running.
 */

export type ProgressStage = "prep" | "ocr" | "vision" | "vote" | "safety";

interface TimelineRow {
  key: ProgressStage;
  emoji: string;
  label_ur: string;
  label_en: string;
}

// The order here defines the visual order of the timeline. It also decides
// which rows are "before" and "after" the current stage.
const TIMELINE: TimelineRow[] = [
  {
    key: "prep",
    emoji: "🖼️",
    label_ur: "تصویر تیار کی جا رہی ہے",
    label_en: "Preparing image",
  },
  {
    key: "ocr",
    emoji: "🔎",
    label_ur: "دستاویز پڑھی جا رہی ہے",
    label_en: "Reading document",
  },
  {
    key: "vision",
    emoji: "💊",
    label_ur: "دوائیں نکالی جا رہی ہیں",
    label_en: "Extracting medicines",
  },
  {
    key: "safety",
    emoji: "🛡️",
    label_ur: "حفاظت کی جانچ",
    label_en: "Checking for safety",
  },
];

export interface ProgressTimelineProps {
  /** Current stage. `null` = not started yet; the whole list looks pending. */
  currentStage: ProgressStage | null;
  /** Once true, every row is marked done regardless of currentStage. */
  finished?: boolean;
  className?: string;
}

export function ProgressTimeline({
  currentStage,
  finished = false,
  className = "",
}: ProgressTimelineProps) {
  const { lang } = useLang();
  const ur = lang === "ur";
  const urduFont = ur ? "font-urdu leading-loose" : "";

  const currentIdx = currentStage ? TIMELINE.findIndex((r) => r.key === currentStage) : -1;

  return (
    <ol className={`w-full space-y-2 ${className}`}>
      {TIMELINE.map((row, idx) => {
        let status: "done" | "running" | "pending";
        if (finished) status = "done";
        else if (currentIdx < 0) status = "pending";
        else if (idx < currentIdx) status = "done";
        else if (idx === currentIdx) status = "running";
        else status = "pending";

        const style =
          status === "done"
            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
            : status === "running"
              ? "bg-amber-50 text-amber-800 border-amber-200 animate-pulse"
              : "bg-stone-50 text-stone-400 border-stone-200";
        const icon = status === "done" ? "✅" : status === "running" ? row.emoji : "○";
        const label = ur ? row.label_ur : row.label_en;

        return (
          <li
            key={row.key}
            className={`flex items-center gap-3 rounded-2xl border px-3 py-2 ${style}`}
          >
            <span aria-hidden="true" className="text-xl leading-none">
              {icon}
            </span>
            <span className={`flex-1 text-base font-bold ${urduFont}`} dir="auto">
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default ProgressTimeline;
