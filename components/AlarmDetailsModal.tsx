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

export interface AlarmDetailsModalProps {
  alarm: Alarm;
  photo: string | null;
  onClose(): void;
  onEdit(): void;
  onDelete(): void;
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

export function AlarmDetailsModal({ alarm, photo, onClose, onEdit, onDelete }: AlarmDetailsModalProps) {
  const { lang, t } = useLang();
  const ur = lang === "ur";
  const urduFont = ur ? "font-urdu leading-loose" : "";

  const dotCount =
    alarm.duration_days === null || alarm.duration_days === undefined
      ? 7
      : Math.max(1, Math.min(31, alarm.duration_days));

  const days: { dateStr: string; d: Date }[] = [];
  if (alarm.duration_days && alarm.duration_days > 0) {
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
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
      <div className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3">
          <h2 className={`text-xl font-extrabold text-stone-900 ${urduFont}`} dir="auto">
            {t("alarms_title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("cancel")}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-100 text-lg text-stone-600 touch-manipulation"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="flex flex-col items-center gap-3 text-center mb-6">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo}
                alt={alarm.medicine_name}
                className="h-32 w-32 shrink-0 rounded-2xl border-2 border-stone-200 object-cover shadow-sm"
              />
            ) : (
              <span aria-hidden="true" className="flex h-32 w-32 shrink-0 items-center justify-center p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/pills.jpg" alt="" className="h-full w-full rounded-2xl object-cover drop-shadow-sm" />
              </span>
            )}
            <div>
              <p
                dir="auto"
                className={`text-2xl font-extrabold text-stone-900 break-words ${urduName ? "font-urdu leading-loose" : "leading-tight"}`}
              >
                {alarm.medicine_name}
              </p>
              {alarm.salt && (
                <p dir="ltr" className="text-sm italic text-stone-500 mt-1">
                  {alarm.salt}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-4 rounded-2xl bg-stone-50 p-4 border border-stone-100">
            <div>
              <p className={`text-sm font-bold text-stone-500 mb-1 ${urduFont}`} dir="auto">
                {t("times_label")}
              </p>
              <div className="flex flex-wrap gap-2">
                {alarm.times.map((tm, i) => (
                  <span
                    key={i}
                    dir="ltr"
                    className="rounded-xl bg-white border border-stone-200 px-3 py-1.5 text-base font-bold text-stone-800 shadow-sm"
                  >
                    {tm}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <p className={`text-sm font-bold text-stone-500 mb-1 ${urduFont}`} dir="auto">
                {ur ? "کھانے کے ساتھ کیسے؟" : "With food?"}
              </p>
              <span
                dir="auto"
                className={`inline-block rounded-xl bg-white border border-stone-200 px-3 py-1.5 text-base font-bold text-stone-800 shadow-sm ${ur ? "font-urdu" : ""}`}
              >
                {foodLabel(alarm.food, t, lang)}
              </span>
            </div>

            <div>
              <p className={`text-sm font-bold text-stone-500 mb-1 ${urduFont}`} dir="auto">
                {ur ? "مدت" : "Duration"}
              </p>
              <span
                dir="auto"
                className={`inline-block rounded-xl bg-white border border-stone-200 px-3 py-1.5 text-base font-bold text-stone-800 shadow-sm ${ur ? "font-urdu" : ""}`}
              >
                {alarm.duration_days === null || alarm.duration_days === undefined
                  ? (ur ? "مسلسل" : "Ongoing")
                  : (ur ? `${alarm.duration_days} دن` : `${alarm.duration_days} days`)}
              </span>
            </div>

            <div>
              <p className={`text-sm font-bold text-stone-500 mb-1 ${urduFont}`} dir="auto">
                {alarm.duration_days && alarm.duration_days > 0
                  ? ur
                    ? `پیش رفت (${dotCount} دن)`
                    : `Progress (${dotCount} days)`
                  : ur
                    ? "پچھلے 7 دن"
                    : "Last 7 days"}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 bg-white p-2 rounded-xl border border-stone-200 shadow-sm" dir="ltr">
                {days.map(({ dateStr, d }) => (
                  <span
                    key={dateStr}
                    title={dateStr}
                    className={`h-4 w-4 rounded-full ${DOT_STYLE[dayStatus(alarm, dateStr, d)]} ${
                      dateStr === todayKey ? "ring-2 ring-emerald-300 ring-offset-1" : ""
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-stone-100 px-5 py-4">
          <button
            type="button"
            onClick={onEdit}
            className={`flex min-h-16 items-center justify-center rounded-2xl bg-stone-100 text-lg font-extrabold text-stone-800 touch-manipulation ${urduFont}`}
          >
            {ur ? "تبدیل کریں" : "Edit"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className={`flex min-h-16 items-center justify-center rounded-2xl bg-red-50 text-lg font-extrabold text-red-600 touch-manipulation ${urduFont}`}
          >
            {t("delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
