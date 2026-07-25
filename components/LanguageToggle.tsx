"use client";

import { useLang } from "@/lib/i18n";

export function LanguageToggle({ className }: { className?: string }) {
  const { lang, setLang, t } = useLang();

  const seg = (active: boolean) =>
    `flex min-h-8 min-w-16 items-center justify-center rounded-full px-3 py-1 text-sm transition-colors ${
      active
        ? "bg-white font-bold text-emerald-700 shadow"
        : "text-stone-600 active:bg-stone-300/60"
    }`;

  return (
    <div
      role="group"
      aria-label={t("language_toggle")}
      dir="ltr"
      className={`inline-flex shrink-0 select-none items-center rounded-full bg-stone-200 p-1 ${className ?? ""}`}
    >
      <button
        type="button"
        aria-pressed={lang === "ur"}
        onClick={() => setLang("ur")}
        className={`${seg(lang === "ur")} font-urdu`}
      >
        اردو
      </button>
      <button
        type="button"
        aria-pressed={lang === "en"}
        onClick={() => setLang("en")}
        className={seg(lang === "en")}
      >
        English
      </button>
    </div>
  );
}

export default LanguageToggle;
