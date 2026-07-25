"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";

/**
 * Bottom-sheet dialog that asks the user how they want to add a photo:
 * "Take a photo" (rear camera on mobile) or "Upload from files".
 *
 * On desktop we tell the user the camera path is mobile-only, because on a
 * laptop `<input capture>` silently falls back to the file picker — which is
 * confusing when they explicitly asked to capture.
 */

interface CaptureOrUploadProps {
  open: boolean;
  onClose(): void;
  onFile(file: File): void;
  accept?: string; // default "image/*,application/pdf"
  title?: string;
}

function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|IEMobile|Opera Mini|Mobile/i.test(ua);
}

export function CaptureOrUpload({
  open,
  onClose,
  onFile,
  accept = "image/*,application/pdf",
  title,
}: CaptureOrUploadProps) {
  const { lang, t } = useLang();
  const ur = lang === "ur";
  const urduFont = ur ? "font-urdu leading-loose" : "";
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [noCamera, setNoCamera] = useState(false);

  // Reset the "no camera" hint every time the dialog reopens.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient hint each time this dialog reopens
    if (open) setNoCamera(false);
  }, [open]);

  if (!open) return null;

  const handleCapture = () => {
    if (!isMobileDevice()) {
      setNoCamera(true);
      return;
    }
    cameraRef.current?.click();
  };

  const handleUpload = () => {
    uploadRef.current?.click();
  };

  const emitAndClose = (f: File | undefined | null) => {
    if (!f) return;
    onFile(f);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl"
      >
        {/* Hidden file inputs — one with `capture` attr for mobile camera, one without for a plain file picker */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            emitAndClose(f);
          }}
        />
        <input
          ref={uploadRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            emitAndClose(f);
          }}
        />

        <div className="mb-3 flex items-center justify-between">
          <h2 className={`text-xl font-extrabold text-stone-900 ${urduFont}`} dir="auto">
            📷 {title ?? (ur ? "تصویر شامل کریں" : "Add a photo")}
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

        <div className="grid grid-cols-1 gap-3">
          <button
            type="button"
            onClick={handleCapture}
            className={`flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-3 text-emerald-800 shadow-sm transition-transform active:scale-[0.98] ${urduFont}`}
          >
            <span aria-hidden="true" className="text-4xl leading-none">
              📸
            </span>
            <span className="text-lg font-extrabold">
              {ur ? "تصویر لیں" : "Take a photo"}
            </span>
            <span className="text-xs text-emerald-700/80">
              {ur ? "کیمرے سے" : "Use your camera"}
            </span>
          </button>

          <button
            type="button"
            onClick={handleUpload}
            className={`flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-stone-200 bg-white p-3 text-stone-800 shadow-sm transition-transform active:scale-[0.98] ${urduFont}`}
          >
            <span aria-hidden="true" className="text-4xl leading-none">
              📁
            </span>
            <span className="text-lg font-extrabold">
              {ur ? "فائل سے چنیں" : "Upload from files"}
            </span>
            <span className="text-xs text-stone-500">
              {ur ? "گیلری یا PDF" : "Gallery or PDF"}
            </span>
          </button>
        </div>

        {noCamera ? (
          <p
            role="alert"
            dir="auto"
            className={`mt-3 rounded-2xl bg-amber-50 p-3 text-center text-sm font-semibold text-amber-800 ${urduFont}`}
          >
            {ur
              ? "معذرت — لیپ ٹاپ پر کیمرا دستیاب نہیں۔ برائے مہربانی 'فائل سے چنیں' استعمال کریں۔"
              : "Sorry — camera capture is only available on mobile. Please use 'Upload from files' instead."}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default CaptureOrUpload;
