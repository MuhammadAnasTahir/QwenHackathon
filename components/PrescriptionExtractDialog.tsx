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
import { ProgressTimeline, type ProgressStage } from "./ProgressTimeline";

/**
 * Full-flow dialog for turning a photograph into alarms without leaving the
 * Alarms page. Wizard steps:
 *   1. CaptureOrUpload (Take photo / Upload from files)
 *   2. Staged progress list while /api/extract streams SSE progress events
 *   3. ExtractReview → user confirms → alarms saved → onSaved() fires
 */

type Stage = "picker" | "loading" | "review" | "error";

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
  const [currentStage, setCurrentStage] = useState<ProgressStage | null>(null);
  const [finishedProgress, setFinishedProgress] = useState(false);

  useEffect(() => {
    if (open) {
      setStage("picker");
      setPhoto(null);
      setData(null);
      setErrorMsg(null);
      setCurrentStage(null);
      setFinishedProgress(false);
    }
  }, [open]);

  if (!open) return null;

  const runExtract = async (file: File) => {
    setStage("loading");
    setErrorMsg(null);
    setCurrentStage("prep");
    setFinishedProgress(false);

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
        onProgress: (stageKey) => setCurrentStage(stageKey as ProgressStage),
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
    setFinishedProgress(true);
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
    setCurrentStage(null);
    setFinishedProgress(false);
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

            <ProgressTimeline currentStage={currentStage} finished={finishedProgress} />
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
