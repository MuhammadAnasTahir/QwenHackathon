"use client";

import type { Alarm } from "@/lib/schema";
import { isArabicScript } from "./labels";

export interface AlarmCardProps {
  alarm: Alarm;
  photo: string | null;
  onClick(alarm: Alarm): void;
}

export function AlarmCard({ alarm, photo, onClick }: AlarmCardProps) {
  const urduName = isArabicScript(alarm.medicine_name);

  return (
    <button
      type="button"
      onClick={() => onClick(alarm)}
      className="flex w-full items-center gap-3 rounded-xl border border-stone-100 bg-white p-3 shadow-sm active:bg-stone-50 transition-colors text-left"
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt={alarm.medicine_name}
          className="h-16 w-16 shrink-0 rounded-xl border border-stone-200 object-cover"
        />
      ) : (
        <span aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center p-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pills.jpg" alt="" className="h-full w-full rounded-xl object-cover drop-shadow-sm" />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p
          dir="auto"
          className={`text-start text-lg font-extrabold text-stone-900 break-all whitespace-normal ${
            urduName ? "font-urdu leading-loose" : "leading-tight"
          }`}
        >
          {alarm.medicine_name}
        </p>
      </div>
    </button>
  );
}

export default AlarmCard;
