"use client";

import { useEffect, useState } from "react";
import type { Alarm, ExtractApiResponse } from "@/lib/schema";
import { EVT_TRACE } from "@/lib/schema";
import { useLang } from "@/lib/i18n";
import { saveAlarm } from "@/lib/alarms";
import { fileToDataUrl, pdfFirstPageToDataUrl, preprocess } from "@/lib/image";
import { streamJson } from "@/lib/streamClient";
import { CaptureOrUpload } from "./CaptureOrUpload";
import { ExtractReview } from "./ExtractReview";

/**
 * Full-flow dialog for turning a photograph into alarms without leaving the
 * Alarms page. Wizard steps:
 *   1. CaptureOrUpload (Take photo / Upload from files)
 *   2. Staged progress list while /api/extract streams SSE progress events
 *   3. ExtractReview → user confirms → alarms saved → onSaved() fires
 */

type Stage = "picker" | "loading" | "review" | "error";

// Progress stages match the server SSE frames (see app/api/extract/route.ts).
type ProgressKey = "prep" | "ocr" | "vision" | "vote" | "safety";
type ProgressStatus = "pending" | "running" | "done";

interface ProgressRow {
  key: ProgressKey;
  status: ProgressStatus;
  label_ur: string;
  label_en: string;
  emoji: string;
}

function initialProgress(): ProgressRow[] {
  return [
    {
      key: "prep",
      status: "pending",
      emoji: "🖼️",
      label_ur: "تصویر تیار کی جا رہی ہے",
      label_en: "Preparing image",
    },
    {
      key: "ocr",
      status: "pending",
      emoji: "🔎",
      label_ur: "دستاویز پڑھی جا رہی ہے",
      label_en: "Reading document",
    },
    {
      key: "vision",
      status: "pending",
      emoji: "💊",
      label_ur: "دوائیں نکالی جا رہی ہیں",
      label_en: "Extracting medicines",
    },
    {
      key: "safety",
      status: "pending",
      emoji: "🛡️",
      label_ur: "حفاظت کی جانچ",
      label_en: "Checking for safety issues",
    },
  ];
}

export interface PrescriptionExtractDialogProps {
  open: boolean;
  onClose(): void;
  onSaved(count: number): void;
}

export function PrescriptionExtractDialog({
  open,
  onClose,
  onSaved,
}: PrescriptionExtractDialogProps) {
  const { lang, t } = useLang();
  const ur = lang === "ur";
  const urduFont = ur ? "font-urdu leading-loose" : "";

  const [stage, setStage] = useState<Stage>("picker");
  const [photo, setPhoto] = useState<string | null>(null);
  const [data, setData] = useState<ExtractApiResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressRow[]>(initialProgress);

  useEffect(() => {
    if (open) {
      setStage("picker");
      setPhoto(null);
      setData(null);
      setErrorMsg(null);
      setProgress(initialProgress());
    }
  }, [open]);

  if (!open) return null;

  const markStage = (key: ProgressKey) => {
    setProgress((prev) => {
      const idx = prev.findIndex((p) => p.key === key);
      if (idx < 0) return prev;
      return prev.map((p, i) => {
        if (i < idx && p.status !== "done") return { ...p, status: "done" };
        if (i === idx) return { ...p, status: "running" };
        return p;
      });
    });
  };

  const runExtract = async (file: File) => {
    setStage("loading");
    setErrorMsg(null);
    setProgress(initialProgress());
    markStage("prep");

    let full: string;
    try {
      const raw =
        file.type === "application/pdf"
          ? await pdfFirstPageToDataUrl(file)
          : await fileToDataUrl(file);
      full = await preprocess(raw, { maxDim: 1200 });
    } catch {
      setErrorMsg(
        ur
          ? "تصویر تیار نہیں ہو سکی۔ کوئی اور فائل چنیں۔"
          : "Could not prepare the file. Please pick another one.",
      );
      setStage("error");
      return;
    }
    setPhoto(full);

    // Stream the extraction. onProgress paints the step list, onDone renders
    // the review card, onError shows the retry sheet. The `holder` object is
    // a workaround for TS's inability to narrow closure-mutated locals across
    // an await: we assign into holder.value and read it back afterwards.
    const holder: { value: ExtractApiResponse | null } = { value: null };
    await streamJson(
      "/api/extract",
      { image: full },
      {
        onProgress: (stageKey) => markStage(stageKey as ProgressKey),
        onDone: (payload) => {
          holder.value = payload as unknown as ExtractApiResponse;
        },
        onError: (err) => {
          setErrorMsg(
            typeof navigator !== "undefined" && !navigator.onLine
              ? t("error_offline")
              : err.message || t("error_generic"),
          );
        },
      },
    );

    const finalPayload = holder.value;
    if (!finalPayload) {
      if (!errorMsg) {
        setErrorMsg(
          typeof navigator !== "undefined" && !navigator.onLine ? t("error_offline") : t("error_generic"),
        );
      }
      setStage("error");
      return;
    }

    // Mark all stages as done, dispatch trace for DevPanel.
    setProgress((prev) => prev.map((p) => ({ ...p, status: "done" as const })));
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(EVT_TRACE, {
          detail: { steps: finalPayload.trace.steps, payload: finalPayload },
        }),
      );
    }

    if (finalPayload.result.medicines.length === 0) {
      setErrorMsg(
        ur
          ? "تصویر سے کوئی دوا نہیں پڑھی جا سکی۔ برائے مہربانی صاف تصویر لیں۔"
          : "Could not read any medicines from the image. Please try a clearer photo.",
      );
      setStage("error");
      return;
    }

    setData(finalPayload);
    setStage("review");
  };

  const onConfirmed = (alarms: Alarm[]) => {
    for (const a of alarms) saveAlarm(a);
    onSaved(alarms.length);
  };

  const onRetake = () => {
    setStage("picker");
    setPhoto(null);
    setData(null);
    setErrorMsg(null);
    setProgress(initialProgress());
  };

  // ── Stage: picker — delegate to CaptureOrUpload. ──────────────────────────
  if (stage === "picker") {
    return (
      <CaptureOrUpload
        open
        onClose={onClose}
        onFile={(f) => void runExtract(f)}
        accept="image/*,application/pdf"
        title={ur ? "نسخے کی تصویر لیں" : "Photograph the prescription"}
      />
    );
  }

  // ── Stage: loading — staged progress list. ────────────────────────────────
  if (stage === "loading") {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
        <div className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
          <div className="flex flex-col items-center gap-4">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo}
                alt=""
                className="max-h-40 w-auto rounded-2xl border-2 border-stone-200 object-contain"
              />
            ) : null}
            <h2
              className={`text-center text-lg font-extrabold text-stone-800 ${urduFont}`}
              dir="auto"
            >
              {ur ? "نسخہ پڑھا جا رہا ہے…" : "Reading your prescription…"}
            </h2>

            <ol className="w-full space-y-2">
              {progress.map((p) => {
                const label = ur ? p.label_ur : p.label_en;
                const style =
                  p.status === "done"
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : p.status === "running"
                      ? "bg-amber-50 text-amber-800 border-amber-200 animate-pulse"
                      : "bg-stone-50 text-stone-400 border-stone-200";
                const icon =
                  p.status === "done" ? "✅" : p.status === "running" ? p.emoji : "○";
                return (
                  <li
                    key={p.key}
                    className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${style}`}
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
          </div>
        </div>
      </div>
    );
  }

  // ── Stage: error — inline retry. ──────────────────────────────────────────
  if (stage === "error") {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
        <div className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
          <p
            role="alert"
            dir="auto"
            className={`mb-4 rounded-2xl bg-red-50 p-3 text-center text-base font-semibold text-red-700 ${urduFont}`}
          >
            {errorMsg}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onRetake}
              className={`flex min-h-16 items-center justify-center rounded-2xl bg-emerald-600 text-xl font-extrabold text-white shadow-md active:bg-emerald-700 ${urduFont}`}
            >
              {ur ? "دوبارہ" : "Try again"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`flex min-h-16 items-center justify-center rounded-2xl border-2 border-stone-300 bg-white text-xl font-extrabold text-stone-700 active:bg-stone-50 ${urduFont}`}
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Stage: review — the ExtractReview card in a scrollable sheet. ─────────
  if (data) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
        <div className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
          <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3">
            <h2 className={`text-xl font-extrabold text-stone-900 ${urduFont}`} dir="auto">
              📋 {t("extract_review_title")}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("cancel")}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-100 text-lg text-stone-600 active:bg-stone-200"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <ExtractReview
              data={data}
              photo={photo}
              onConfirmed={onConfirmed}
              onRetake={onRetake}
            />
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default PrescriptionExtractDialog;
