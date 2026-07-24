"use client";

import type { Alarm } from "@/lib/schema";
import { useLang } from "@/lib/i18n";
import { isActiveOn } from "@/lib/alarms";
import {
  foodIcon,
  foodLabel,
  isArabicScript,
  timeOfDayIcon,
  todayStr,
} from "./labels";

export interface AlarmCardProps {
  alarm: Alarm;
  photo: string | null;
  onDelete(id: string): void;
}

type DayStatus = "taken" | "snoozed" | "missed" | "none" | "off";

const DOT_STYLE: Record<DayStatus, string> = {
  taken: "bg-emerald-500",
  snoozed: "bg-amber-400",
  missed: "bg-red-400",
  none: "bg-stone-200",
  off: "border border-stone-200 bg-transparent",
};

function dayStatus(alarm: Alarm, dateStr: string, d: Date): DayStatus {
  const entries = alarm.taken_log.filter((e) => e.date === dateStr);
  if (entries.some((e) => e.status === "taken")) return "taken";
  if (entries.some((e) => e.status === "snoozed")) return "snoozed";
  if (entries.some((e) => e.status === "missed")) return "missed";
  let active = true;
  try {
    active = isActiveOn(alarm, d);
  } catch {
    active = true;
  }
  return active ? "none" : "off";
}

export function AlarmCard({ alarm, photo, onDelete }: AlarmCardProps) {
  const { lang, t } = useLang();
  const ur = lang === "ur";

  // Show one dot per day of the course, capped at 14 for readability. Ongoing
  // (null duration) shows the last 7 days as a rolling window. This makes the
  // dot count match the "3 days" / "7 days" duration the user selected.
  const dotCount =
    alarm.duration_days === null || alarm.duration_days === undefined
      ? 7
      : Math.max(1, Math.min(14, alarm.duration_days));

  const days: { dateStr: string; d: Date }[] = [];
  if (alarm.duration_days && alarm.duration_days > 0) {
    // Course-based: start_date + 0..dotCount-1
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(alarm.start_date);
    const start = parts
      ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
      : new Date();
    for (let i = 0; i < dotCount; i++) {
      const d = new Date(start);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + i);
      days.push({ dateStr: todayStr(d), d });
    }
  } else {
    // Ongoing: rolling last 7 days ending today.
    for (let i = dotCount - 1; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      days.push({ dateStr: todayStr(d), d });
    }
  }
  const todayKey = todayStr(new Date());

  const urduName = isArabicScript(alarm.medicine_name);

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-stone-100 bg-white p-4 shadow-md">
      {/* Photo of the actual box — the identifier for our user */}
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt={alarm.medicine_name}
          className="h-20 w-20 shrink-0 rounded-2xl border border-stone-200 object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-4xl"
        >
          💊
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p
          dir="auto"
          className={`truncate text-start text-xl font-extrabold text-stone-900 ${
            urduName ? "font-urdu leading-loose" : ""
          }`}
        >
          {alarm.medicine_name}
        </p>
        {alarm.salt ? (
          <p dir="ltr" className="truncate text-start text-xs italic text-stone-500">
            {alarm.salt}
          </p>
        ) : null}

        {/* Times as icon chips + food chip */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {alarm.times.map((tm, i) => (
            <span
              key={i}
              dir="ltr"
              className="rounded-full bg-emerald-50 px-2.5 py-1 text-sm font-bold text-emerald-800"
            >
              {timeOfDayIcon(tm)} {tm}
            </span>
          ))}
          <span
            dir="auto"
            className={`rounded-full bg-stone-100 px-2.5 py-1 text-sm font-semibold text-stone-700 ${
              ur ? "font-urdu" : ""
            }`}
          >
            {foodIcon(alarm.food)} {foodLabel(alarm.food, t, lang)}
          </span>
        </div>

        {/* Last-7-day adherence dots (oldest → newest) */}
        <div className="mt-2 flex items-center gap-2">
          <span className={`text-xs text-stone-500 ${ur ? "font-urdu" : ""}`} dir="auto">
            {t("adherence_title")}
          </span>
          <span className="flex flex-wrap items-center gap-1" dir="ltr">
            {days.map(({ dateStr, d }) => (
              <span
                key={dateStr}
                title={dateStr}
                className={`h-3 w-3 rounded-full ${DOT_STYLE[dayStatus(alarm, dateStr, d)]} ${
                  dateStr === todayKey ? "ring-2 ring-emerald-200" : ""
                }`}
              />
            ))}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onDelete(alarm.id)}
        aria-label={t("delete")}
        className="flex h-16 w-16 shrink-0 select-none items-center justify-center rounded-2xl bg-red-50 text-2xl text-red-600 transition-colors active:bg-red-100"
      >
        <span aria-hidden="true">🗑️</span>
      </button>
    </div>
  );
}

export default AlarmCard;
