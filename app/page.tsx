"use client";

import { useRouter } from "next/navigation";
import { useLang } from "@/lib/i18n";
import { BigButton } from "@/components/BigButton";
import { LanguageToggle } from "@/components/LanguageToggle";
import { SpeakButton } from "@/components/SpeakButton";

export default function Home() {
  const router = useRouter();
  const { lang, t } = useLang();
  const ur = lang === "ur";

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-hidden px-5 pb-6 pt-4">
      {/* Soft decorative glows behind everything */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -end-24 h-72 w-72 rounded-full bg-emerald-200/50 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/3 -start-28 h-64 w-64 rounded-full bg-teal-200/40 blur-3xl"
      />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between animate-fade-up">
        <LanguageToggle />
      </header>

      {/* Hero */}
      <section className="relative z-10 mt-8 flex flex-col items-center text-center">
        <div
          className="animate-fade-up rounded-[2rem] p-1.5 shadow-xl shadow-emerald-600/20 ring-1 ring-emerald-100"
          style={{ animationDelay: "60ms" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="h-24 w-24 rounded-3xl" />
        </div>

        <h1
          className="animate-fade-up mt-5 font-urdu text-5xl font-bold leading-loose text-emerald-900"
          style={{ animationDelay: "120ms" }}
          dir="rtl"
          lang="ur"
        >
          صحت ساتھی
        </h1>
        <p
          className="animate-fade-up text-xl font-extrabold tracking-wide text-emerald-600"
          style={{ animationDelay: "160ms" }}
          dir="ltr"
          lang="en"
        >
          Sehat Saathi
        </p>
        <p
          className={`animate-fade-up mt-2 text-lg text-stone-600 ${ur ? "font-urdu leading-loose" : ""}`}
          style={{ animationDelay: "200ms" }}
          dir="auto"
        >
          {t("tagline")}
        </p>
      </section>

      {/* Spoken hint — nothing on this screen requires reading */}
      <section
        className="animate-fade-up relative z-10 mt-6 flex items-center gap-3 rounded-2xl border border-emerald-100 bg-white/80 p-4 shadow-sm backdrop-blur"
        style={{ animationDelay: "260ms" }}
      >
        <SpeakButton text={t("home_hint")} className="h-16 w-16 shrink-0 text-2xl" />
        <p
          className={`flex-1 text-lg text-stone-700 ${ur ? "font-urdu leading-loose" : "leading-relaxed"}`}
          dir="auto"
        >
          {t("home_hint")}
        </p>
      </section>

      {/* The two big doors into the app */}
      <section className="relative z-10 mt-6 grid flex-1 content-start gap-4">
        <div className="animate-fade-up" style={{ animationDelay: "320ms" }}>
          <BigButton
            icon="⏰"
            label={t("home_alarms")}
            sub={ur ? "وقت پر دوا کی یاد دہانی، تصویر کے ساتھ" : "On-time reminders with a photo"}
            onClick={() => router.push("/alarms")}
          />
        </div>
        <div className="animate-fade-up" style={{ animationDelay: "380ms" }}>
          <BigButton
            icon="💬"
            label={t("home_chat")}
            sub={ur ? "نسخے کی تصویر بھیجیں یا بول کر پوچھیں" : "Send a prescription photo or ask by voice"}
            onClick={() => router.push("/chat")}
          />
        </div>
      </section>

      {/* Persistent safety disclaimer */}
      <footer
        className="animate-fade-up relative z-10 mt-6 flex items-start justify-center gap-2 px-2"
        style={{ animationDelay: "440ms" }}
      >
        <span aria-hidden="true" className="mt-0.5 text-base">
          ⚠️
        </span>
        <p
          className={`text-center text-sm text-stone-500 ${ur ? "font-urdu leading-loose" : ""}`}
          dir="auto"
        >
          {t("disclaimer")}
        </p>
      </footer>
    </main>
  );
}
