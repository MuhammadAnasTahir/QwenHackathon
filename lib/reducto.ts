// ─────────────────────────────────────────────────────────────────────────────
// Sehat Saathi — Reducto document-OCR client (server-only).
//
// Reducto is a document-understanding API (https://docs.reducto.ai). We use it
// as an OCR preprocessor: image/PDF → clean text with layout preserved. That
// text is then handed to Qwen 3.7 Plus as auxiliary context alongside the raw
// image, so Plus has both a high-quality OCR pass AND the pixels to work from.
//
// Design rules for this module:
// - Server-only. The Reducto key must never reach the browser.
// - Never crash the extraction flow. If Reducto is unconfigured, times out, or
//   errors, we log and return null; the caller falls back to image-only Qwen.
// - Two-step Reducto flow:
//     1) POST /upload  (multipart file) → { file_id }
//     2) POST /parse   (JSON { input: reducto://<file_id> }) → chunks[].content
// ─────────────────────────────────────────────────────────────────────────────

import { Buffer } from "node:buffer";

const BASE_URL = (process.env.REDUCTO_BASE_URL ?? "https://platform.reducto.ai").replace(/\/+$/, "");
const API_KEY = process.env.REDUCTO_API_KEY ?? "";

// Reducto is best-effort. Tight timeouts keep the demo snappy: if Reducto is
// slow, we drop it and Qwen Plus reads the image alone rather than making the
// user wait. Users who want fewer skips can raise these via env vars.
const UPLOAD_TIMEOUT_MS = Number(process.env.REDUCTO_UPLOAD_TIMEOUT_MS ?? 10_000);
const PARSE_TIMEOUT_MS = Number(process.env.REDUCTO_PARSE_TIMEOUT_MS ?? 20_000);
const MAX_TEXT_CHARS = 8_000; // more than enough for a full prescription

export interface ReductoResult {
  text: string; // concatenated chunks[].content, trimmed and capped
  pages: number;
  jobId: string | null;
}

/** True when a REDUCTO_API_KEY is present. Called by the extract route to skip
 * Reducto entirely (without a network round-trip) when unconfigured. */
export function reductoConfigured(): boolean {
  return API_KEY.length > 0;
}

// ── Data-URL → Blob helper ──────────────────────────────────────────────────

interface Uploadable {
  blob: Blob;
  filename: string;
  mime: string;
}

function dataUrlToBlob(dataUrl: string): Uploadable {
  const m = /^data:([^;,]+)(?:;charset=[^;,]+)?(?:;base64)?,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("reducto: invalid data URL");
  const mime = m[1] || "application/octet-stream";
  const isBase64 = /;base64,/i.test(dataUrl);
  const payload = m[2];
  const bytes = isBase64 ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf-8");
  const ext = pickExtension(mime);
  return { blob: new Blob([bytes], { type: mime }), filename: `document.${ext}`, mime };
}

function pickExtension(mime: string): string {
  switch (mime) {
    case "application/pdf":
      return "pdf";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    default:
      return "bin";
  }
}

// ── Timeboxed fetch ─────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Defensive coercion of the two Reducto responses ─────────────────────────

function extractFileId(u: unknown): string | null {
  if (typeof u !== "object" || u === null) return null;
  const o = u as Record<string, unknown>;
  // Reducto has iterated on the upload response shape a few times — try the
  // known keys in order of preference.
  if (typeof o.file_id === "string" && o.file_id.trim()) return o.file_id.trim();
  if (typeof o.id === "string" && o.id.trim()) return o.id.trim();
  if (typeof o.url === "string" && o.url.trim()) return o.url.trim();
  if (typeof o.presigned_url === "string" && o.presigned_url.trim()) return o.presigned_url.trim();
  return null;
}

function coerceParseResult(u: unknown): ReductoResult {
  const empty: ReductoResult = { text: "", pages: 0, jobId: null };
  if (typeof u !== "object" || u === null) return empty;
  const o = u as Record<string, unknown>;

  const jobId = typeof o.job_id === "string" ? o.job_id : null;

  const usage =
    typeof o.usage === "object" && o.usage !== null ? (o.usage as Record<string, unknown>) : {};
  const pages = typeof usage.num_pages === "number" ? Math.max(0, Math.round(usage.num_pages)) : 0;

  const result =
    typeof o.result === "object" && o.result !== null ? (o.result as Record<string, unknown>) : {};
  const chunks = Array.isArray(result.chunks) ? result.chunks : [];

  const parts: string[] = [];
  for (const c of chunks) {
    if (typeof c !== "object" || c === null) continue;
    const cc = c as Record<string, unknown>;
    // Prefer the human-readable full text over the embedding-tuned variant.
    if (typeof cc.content === "string" && cc.content.trim()) parts.push(cc.content.trim());
    else if (typeof cc.embed === "string" && cc.embed.trim()) parts.push(cc.embed.trim());
  }
  const text = parts.join("\n\n").slice(0, MAX_TEXT_CHARS).trim();
  return { text, pages, jobId };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse an image or PDF (as a data URL) through Reducto and return the
 * extracted text. Throws on failure — callers should catch and fall back to
 * their non-Reducto path.
 */
export async function parseWithReducto(dataUrl: string): Promise<ReductoResult> {
  if (!API_KEY) throw new Error("reducto: REDUCTO_API_KEY not set");

  // 1) Upload the file.
  const { blob, filename } = dataUrlToBlob(dataUrl);
  const form = new FormData();
  form.append("file", blob, filename);

  const upRes = await fetchWithTimeout(
    `${BASE_URL}/upload`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}` },
      body: form,
    },
    UPLOAD_TIMEOUT_MS,
  );
  if (!upRes.ok) {
    const detail = await upRes.text().catch(() => "");
    throw new Error(`reducto upload ${upRes.status}: ${detail.slice(0, 200)}`);
  }
  const upJson: unknown = await upRes.json().catch(() => null);
  const fileIdOrUrl = extractFileId(upJson);
  if (!fileIdOrUrl) throw new Error("reducto: upload returned no file_id");

  // Accept either a bare id (→ prefix with reducto://) or an already-shaped URL.
  const input =
    /^reducto:\/\//i.test(fileIdOrUrl) || /^https?:\/\//i.test(fileIdOrUrl)
      ? fileIdOrUrl
      : `reducto://${fileIdOrUrl}`;

  // 2) Parse.
  const parseRes = await fetchWithTimeout(
    `${BASE_URL}/parse`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input }),
    },
    PARSE_TIMEOUT_MS,
  );
  if (!parseRes.ok) {
    const detail = await parseRes.text().catch(() => "");
    throw new Error(`reducto parse ${parseRes.status}: ${detail.slice(0, 200)}`);
  }
  const parsedJson: unknown = await parseRes.json().catch(() => null);
  return coerceParseResult(parsedJson);
}

/** Same as parseWithReducto but never throws — returns null instead. Used by
 * the extract route so a Reducto outage does not break the whole flow. */
export async function tryParseWithReducto(dataUrl: string): Promise<ReductoResult | null> {
  if (!API_KEY) return null;
  try {
    const r = await parseWithReducto(dataUrl);
    // A zero-text result is not "success" for our purposes — treat it as null.
    return r.text.length > 0 ? r : null;
  } catch {
    return null;
  }
}
