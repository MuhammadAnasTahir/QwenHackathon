"use client";

import type { ReactNode } from "react";
import { isArabicScript } from "./labels";

export interface BigButtonProps {
  icon: ReactNode;
  label: string;
  sub?: string;
  onClick(): void;
  className?: string;
}

export function BigButton({ icon, label, sub, onClick, className }: BigButtonProps) {
  const urduLabel = isArabicScript(label);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-28 w-full select-none flex-col items-center justify-center gap-2 rounded-3xl border-2 border-emerald-100 bg-white p-4 text-stone-800 shadow-lg shadow-emerald-900/5 transition-transform duration-100 active:scale-[0.97] active:border-emerald-400 ${className ?? ""}`}
    >
      <span aria-hidden="true" className="text-4xl leading-none">
        {icon}
      </span>
      <span
        className={`text-2xl font-extrabold ${urduLabel ? "font-urdu leading-loose" : ""}`}
        dir="auto"
      >
        {label}
      </span>
      {sub ? (
        <span
          className={`text-base text-stone-500 ${isArabicScript(sub) ? "font-urdu leading-loose" : ""}`}
          dir="auto"
        >
          {sub}
        </span>
      ) : null}
    </button>
  );
}

export default BigButton;
