"use client";

import { useLang } from "@/lib/i18n";

export interface RedFlagBannerProps {
  onDismiss(): void;
}

export function RedFlagBanner({ onDismiss }: RedFlagBannerProps) {
  const { lang, t } = useLang();
  const ur = lang === "ur";
  const urduFont = ur ? "font-urdu leading-loose" : "";

  return (
    <div
      role="alert"
      className="w-full rounded-3xl border-4 border-red-600 bg-red-50 p-4 shadow-lg"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="animate-pulse text-4xl leading-none">
          🚨
        </span>
        <p
          dir="auto"
          className={`flex-1 text-xl font-extrabold text-red-900 ${urduFont}`}
        >
          {t("red_flag_banner")}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("cancel")}
          className="flex h-12 w-12 shrink-0 select-none items-center justify-center rounded-full bg-red-100 text-xl text-red-700 transition-colors active:bg-red-200"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      <a
        href="tel:1122"
        dir="ltr"
        className={`mt-4 flex min-h-20 w-full select-none items-center justify-center gap-3 rounded-2xl bg-red-600 text-white shadow-xl transition-transform active:scale-[0.98] ${urduFont}`}
      >
        <span aria-hidden="true" className="text-4xl leading-none">📞</span>
        <span className="text-2xl font-extrabold">{t("call_1122")}</span>
      </a>
    </div>
  );
}

export default RedFlagBanner;
