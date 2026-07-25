"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";
import { type Alarm } from "@/lib/schema";
import { deleteAlarm, loadAlarms } from "@/lib/alarms";
import { idbGet } from "@/lib/idb";
import { LanguageToggle } from "@/components/LanguageToggle";
import { AddAlarmDialog } from "@/components/AddAlarmDialog";
import { PrescriptionExtractDialog } from "@/components/PrescriptionExtractDialog";
import { AlarmCard } from "@/components/AlarmCard";
import { AlarmDetailsModal } from "@/components/AlarmDetailsModal";

export default function Home() {
  const router = useRouter();
  const { lang, t } = useLang();
  const ur = lang === "ur";
  const [showAdd, setShowAdd] = useState(false);
  const [showExtract, setShowExtract] = useState(false);
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [selectedAlarm, setSelectedAlarm] = useState<Alarm | null>(null);
  const [editTarget, setEditTarget] = useState<Alarm | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const list = loadAlarms();
    setAlarms(list);
    for (const a of list) {
      if (!a.photoKey) continue;
      void idbGet(a.photoKey)
        .then((url) => {
          if (url) setPhotos((prev) => (prev[a.id] === url ? prev : { ...prev, [a.id]: url }));
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const doDelete = (id: string) => {
    deleteAlarm(id);
    setConfirmId(null);
    refresh();
  };

  const confirmTarget = confirmId ? alarms.find((a) => a.id === confirmId) ?? null : null;

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-x-hidden px-5 pb-4 pt-3">
      {/* Top pill bar */}
      <header className="relative z-10 flex items-center justify-between rounded-full bg-white/80 px-3 py-2 shadow-sm border border-stone-200 backdrop-blur animate-fade-up">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/transparent.png" alt="" className="h-12 w-12 rounded-full" />
          <h1
            className={`text-xl text-emerald-900 ${ur ? "font-urdu font-bold leading-tight" : "font-extrabold leading-none"}`}
            dir={ur ? "rtl" : "ltr"}
            lang={ur ? "ur" : "en"}
          >
            {ur ? "صحت ساتھی" : "Sehat Saathi"}
          </h1>
        </div>
        <LanguageToggle />
      </header>

      {/* Tagline */}
      <section
        className="animate-fade-up relative z-10 mt-2 px-2 text-center"
        style={{ animationDelay: "260ms" }}
      >
        <p
          className={`text-xs font-medium tracking-tight text-emerald-800 ${ur ? "font-urdu leading-loose tracking-normal" : "leading-tight whitespace-nowrap"}`}
          dir="auto"
        >
          {ur ? "آپ کی صحت، آپ کا ساتھی" : "AI-Powered Medical Assistant that Understands You."}
        </p>
      </section>

      {/* The two big doors into the app */}
      <section className="relative z-10 mt-3 grid flex-1 content-start gap-3">
        <button
          onClick={() => router.push("/chat")}
          className="animate-fade-up flex w-full min-w-0 items-center gap-4 rounded-full bg-emerald-600 px-5 py-4 text-white shadow-md touch-manipulation"
          style={{ animationDelay: "320ms" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Transparent.png" alt="" className="h-10 w-10 shrink-0 object-contain drop-shadow-md brightness-0 invert" />
          <div className="flex-1 min-w-0 text-left">
            <h2 className={`font-extrabold text-lg leading-tight ${ur ? "font-urdu" : ""}`} dir="auto">
              {t("home_chat")}
            </h2>
            <p className={`text-xs opacity-90 truncate ${ur ? "font-urdu mt-1" : "mt-0.5"}`} dir="auto">
              {ur ? "نسخے کی تصویر بھیجیں یا بول کر پوچھیں" : "Send a prescription photo or ask by voice"}
            </p>
          </div>
          <span aria-hidden="true" className="text-xl opacity-80" dir={ur ? "rtl" : "ltr"}>
            {ur ? "←" : "➔"}
          </span>
        </button>

        <div className="animate-fade-up flex min-w-0 flex-col gap-3 rounded-[2rem] bg-stone-50 p-4 shadow-lg shadow-emerald-900/10 border border-stone-200" style={{ animationDelay: "380ms" }}>
          <div className="flex items-center gap-3 w-full text-left">
            <span aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center p-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/alarm.png" alt="" className="h-full w-full object-contain drop-shadow-md" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className={`truncate text-xl font-extrabold text-stone-900 ${ur ? "font-urdu" : ""}`} dir="auto">
                {t("home_alarms")}
              </h2>
              <p className={`text-sm text-stone-500 ${ur ? "font-urdu leading-loose" : ""}`} dir="auto">
                {ur ? "وقت پر دوا کی یاد دہانی، تصویر کے ساتھ" : "On-time reminders with a photo"}
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2 mt-1">
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className={`flex min-h-[3rem] flex-col min-[360px]:flex-row items-center justify-center gap-1 min-[360px]:gap-1.5 rounded-2xl border-2 border-dashed border-emerald-300 bg-white p-2 min-[360px]:p-3 text-xs min-[360px]:text-sm font-extrabold text-emerald-700 text-center leading-tight active:bg-emerald-50 ${ur ? "font-urdu" : ""}`}
            >
              <span aria-hidden="true">➕</span>
              <span>{t("alarms_add")}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowExtract(true)}
              className={`flex min-h-[3rem] flex-col min-[360px]:flex-row items-center justify-center gap-1 min-[360px]:gap-1.5 rounded-2xl bg-emerald-600 p-2 min-[360px]:p-3 text-xs min-[360px]:text-sm font-extrabold text-white text-center leading-tight shadow-md active:bg-emerald-700 ${ur ? "font-urdu" : ""}`}
            >
              <span aria-hidden="true">📸</span>
              <span>{ur ? "نسخے سے" : "From prescription"}</span>
            </button>
          </div>

          {savedMsg ? (
            <div
              role="status"
              className={`rounded-2xl bg-emerald-50 p-3 text-center text-sm font-bold text-emerald-800 ${ur ? "font-urdu" : ""}`}
              dir="auto"
            >
              ✅ {savedMsg}
            </div>
          ) : null}

          {alarms.length > 0 && (
            <div className="mt-2 space-y-2 border-t border-stone-200 pt-3">
              {alarms.map((a) => (
                <AlarmCard
                  key={a.id}
                  alarm={a}
                  photo={photos[a.id] ?? null}
                  onClick={(alarm) => setSelectedAlarm(alarm)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Persistent safety disclaimer */}
      <footer
        className="animate-fade-up relative z-10 mt-3 flex items-start justify-center gap-2 rounded-2xl bg-amber-50 p-3 px-4 border border-amber-200"
        style={{ animationDelay: "440ms" }}
      >
        <span aria-hidden="true" className="mt-0.5 text-lg">
          ⚠️
        </span>
        <p
          className={`text-center text-sm font-medium text-amber-900 ${ur ? "font-urdu leading-loose" : ""}`}
          dir="auto"
        >
          {t("disclaimer")}
        </p>
      </footer>

      {/* Dialogs */}
      {showAdd || editTarget ? (
        <AddAlarmDialog 
          initialAlarm={editTarget ?? undefined}
          initialPhoto={editTarget ? (photos[editTarget.id] ?? null) : null}
          onClose={() => { setShowAdd(false); setEditTarget(null); }} 
          onSaved={() => { setShowAdd(false); setEditTarget(null); refresh(); }} 
        />
      ) : null}
      
      {selectedAlarm ? (
        <AlarmDetailsModal
          alarm={selectedAlarm}
          photo={photos[selectedAlarm.id] ?? null}
          onClose={() => setSelectedAlarm(null)}
          onEdit={() => {
            setEditTarget(selectedAlarm);
            setSelectedAlarm(null);
          }}
          onDelete={() => {
            setConfirmId(selectedAlarm.id);
            setSelectedAlarm(null);
          }}
        />
      ) : null}

      <PrescriptionExtractDialog
        open={showExtract}
        onClose={() => setShowExtract(false)}
        onSaved={(count) => {
          setShowExtract(false);
          refresh();
          const msg = ur
            ? count > 1
              ? `${count} دواؤں کے الارم بن گئے`
              : "الارم بن گیا"
            : count > 1
              ? `${count} alarms created`
              : "Alarm created";
          setSavedMsg(msg);
          window.setTimeout(() => setSavedMsg(null), 5000);
        }}
      />

      {/* Delete confirmation dialog */}
      {confirmTarget ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-5 shadow-2xl">
            <p className={`text-center text-xl font-extrabold text-stone-900 ${ur ? "font-urdu leading-loose" : ""}`} dir="auto">
              🗑️{" "}
              {ur
                ? `کیا "${confirmTarget.medicine_name}" کا الارم ہٹا دیں؟`
                : `Delete the alarm for "${confirmTarget.medicine_name}"?`}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => doDelete(confirmTarget.id)}
                className={`flex min-h-16 items-center justify-center rounded-2xl bg-red-600 text-xl font-extrabold text-white shadow-md active:bg-red-700 ${ur ? "font-urdu" : ""}`}
              >
                {t("delete")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmId(null)}
                className={`flex min-h-16 items-center justify-center rounded-2xl border-2 border-stone-300 bg-white text-xl font-extrabold text-stone-700 active:bg-stone-50 ${ur ? "font-urdu" : ""}`}
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

