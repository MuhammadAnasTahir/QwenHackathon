"use client";

import { useEffect, useState } from "react";
import type { Alarm, ExtractApiRequest, ExtractApiResponse } from "@/lib/schema";
import { EVT_TRACE } from "@/lib/schema";
import { useLang } from "@/lib/i18n";
import { saveAlarm } from "@/lib/alarms";
import { fileToDataUrl, pdfFirstPageToDataUrl, preprocess } from "@/lib/image";
import { CaptureOrUpload } from "./CaptureOrUpload";
import { ExtractReview } from "./ExtractReview";

/**
 * Full-flow dialog for turning a photograph into alarms without leaving the
 * Alarms page. Steps:
 *   1. CaptureOrUpload (Take photo / Upload from files)
 *   2. Loading spinner while /api/extract runs
 *   3. ExtractReview → user confirms → alarms saved → onSaved() fires
 * Any error goes back to step 1 with an inline red message.
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

  useEffect(() => {
    if (open) {
      setStage("picker");
      setPhoto(null);
      setData(null);
      setErrorMsg(null);
    }
  }, [open]);

  if (!open) return null;

  const runExtract = async (file: File) => {
    setStage("loading");
    setErrorMsg(null);
    try {
      const raw =
        file.type === "application/pdf"
          ? await pdfFirstPageToDataUrl(file)
          : await fileToDataUrl(file);
      const full = await preprocess(raw, { maxDim: 1600 });
      setPhoto(full);

      const body: ExtractApiRequest = { image: full };
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`extract ${res.status}`);
      const parsed = (await res.json()) as ExtractApiResponse;

      // Feed the DevPanel too — same trace event the chat page uses.
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(EVT_TRACE, {
            detail: { steps: parsed.trace.steps, payload: parsed },
          }),
        );
      }

      if (parsed.result.medicines.length === 0) {
        setErrorMsg(
          ur
            ? "تصویر سے کوئی دوا نہیں پڑھی جا سکی۔ برائے مہربانی صاف تصویر لیں۔"
            : "Could not read any medicines from the image. Please try a clearer photo.",
        );
        setStage("error");
        return;
      }

      setData(parsed);
      setStage("review");
    } catch {
      setErrorMsg(
        typeof navigator !== "undefined" && !navigator.onLine ? t("error_offline") : t("error_generic"),
      );
      setStage("error");
    }
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
  };

  // Stage: picker — delegate to CaptureOrUpload.
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

  // Stage: loading — full-screen sheet with a spinner and the picked photo.
  if (stage === "loading") {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
        <div className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
          <div className="flex flex-col items-center gap-4 text-center">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo}
                alt=""
                className="max-h-52 w-auto rounded-2xl border-2 border-stone-200 object-contain"
              />
            ) : null}
            <div className="flex items-center gap-3">
              <span className="flex gap-1" aria-hidden="true">
                <span className="h-3 w-3 animate-bounce rounded-full bg-emerald-400 [animation-delay:0ms]" />
                <span className="h-3 w-3 animate-bounce rounded-full bg-emerald-400 [animation-delay:150ms]" />
                <span className="h-3 w-3 animate-bounce rounded-full bg-emerald-400 [animation-delay:300ms]" />
              </span>
              <p className={`text-lg font-bold text-stone-700 ${urduFont}`} dir="auto">
                {ur ? "نسخہ پڑھا جا رہا ہے…" : "Reading the prescription…"}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Stage: error — inline retry.
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

  // Stage: review — the ExtractReview card lives inside a scrollable sheet.
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
