// ─────────────────────────────────────────────────────────────────────────────
// Sehat Saathi — client-side image helpers (canvas preprocessing + pdf.js)
//   Handwriting OCR is disproportionately sensitive to input quality, so we
//   downscale to a sane size and optionally grayscale + contrast-stretch
//   before sending anything to the vision model.
// ─────────────────────────────────────────────────────────────────────────────

/** Read a File (camera / gallery / picker) into a data URL. */
export function fileToDataUrl(f: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("file-read-failed"));
    reader.readAsDataURL(f);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image-load-failed"));
    img.src = src;
  });
}

function makeCanvas(
  w: number,
  h: number
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas-2d-unavailable");
  return { canvas, ctx };
}

function fitWithin(w: number, h: number, maxDim: number): { w: number; h: number } {
  const scale = Math.min(1, maxDim / Math.max(w, h));
  return {
    w: Math.max(1, Math.round(w * scale)),
    h: Math.max(1, Math.round(h * scale)),
  };
}

/**
 * Grayscale + percentile contrast stretch, in place.
 * Uses the 2nd/98th luminance percentiles so a few glare pixels or ink blots
 * don't flatten the whole remap.
 */
function grayscaleContrastStretch(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const imageData = ctx.getImageData(0, 0, w, h);
  const px = imageData.data;
  const n = w * h;

  // Pass 1: luminance histogram.
  const hist = new Uint32Array(256);
  const lum = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const l = Math.round(0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2]);
    lum[i] = l;
    hist[l]++;
  }

  // Find 2% / 98% percentile bounds.
  const loTarget = n * 0.02;
  const hiTarget = n * 0.98;
  let acc = 0;
  let lo = 0;
  let hi = 255;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= loTarget) {
      lo = v;
      break;
    }
  }
  acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= hiTarget) {
      hi = v;
      break;
    }
  }
  if (hi <= lo) hi = lo + 1;
  const scale = 255 / (hi - lo);

  // Pass 2: write stretched gray back to all channels.
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    let v = (lum[i] - lo) * scale;
    if (v < 0) v = 0;
    else if (v > 255) v = 255;
    px[o] = px[o + 1] = px[o + 2] = v;
  }
  ctx.putImageData(imageData, 0, 0);
}

/**
 * Downscale to at most `maxDim` px on the longest side (default 1200) and
 * optionally grayscale + contrast-stretch. Returns a JPEG data URL (q 0.85).
 *
 * The default was lowered from 1600 → 1200 for demo-day latency: at 1200 px
 * a typical prescription is still comfortably readable to a VLM, but the
 * network transfer + model prefill are meaningfully faster.
 */
export async function preprocess(
  dataUrl: string,
  opts?: { maxDim?: number; grayscale?: boolean }
): Promise<string> {
  const maxDim = opts?.maxDim ?? 1200;
  const grayscale = opts?.grayscale ?? false;

  const img = await loadImage(dataUrl);
  const { w, h } = fitWithin(img.naturalWidth || img.width, img.naturalHeight || img.height, maxDim);
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);

  if (grayscale) grayscaleContrastStretch(ctx, w, h);

  return canvas.toDataURL("image/jpeg", 0.85);
}

/** Small preview version of an image (default 300px longest side, JPEG q 0.7). */
export async function thumbnail(dataUrl: string, dim: number = 300): Promise<string> {
  const img = await loadImage(dataUrl);
  const { w, h } = fitWithin(img.naturalWidth || img.width, img.naturalHeight || img.height, dim);
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.7);
}

/**
 * Render page 1 of a PDF to a JPEG data URL via pdf.js (loaded lazily so the
 * ~1MB library never blocks first paint). Pakistani prescription PDFs are
 * almost always scans, so rasterising is the right move anyway.
 */
export async function pdfFirstPageToDataUrl(f: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const data = new Uint8Array(await f.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;
  try {
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const { canvas } = makeCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvas, viewport }).promise;
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    void loadingTask.destroy().catch(() => undefined);
  }
}
