// POST /api/extract — prescription photo / PDF-page → structured medicines.
//
// Streaming SSE response. Frames:
//   { type: "progress", stage: "prep"|"ocr"|"vision"|"vote"|"safety", label }
//   { type: "done", result, safety, runs_raw, trace }
//   { type: "error", message }
//
// Pipeline:
//   1) Reducto OCR (best-effort, tight timeouts)
//   2) N Qwen 3.7 Plus reads (default N=1 for demo latency; up to 5 for eval).
//      Each read receives BOTH the raw image AND Reducto's OCR text as
//      auxiliary context so Plus has a clean text pass alongside the pixels.
//   3) Self-consistency vote (a no-op when N=1)
//   4) Qwen 3.7 Max grounding + safety (best-effort)
//
// Reducto is best-effort throughout: unconfigured, timed out, or errored →
// we skip it and Plus reads the image alone. The rest is unchanged.

import {
  qwen,
  VISION_MODEL,
  REASONING_MODEL,
  parseJsonLoose,
  timed,
  coerceExtraction,
  coerceSafety,
} from "@/lib/qwen";
import { EXTRACTION_PROMPT, GROUNDING_PROMPT } from "@/lib/prompts";
import { reductoConfigured, tryParseWithReducto } from "@/lib/reducto";
import { voteExtractions } from "@/lib/vote";
import type {
  ExtractApiResponse,
  ExtractionResult,
  PipelineStep,
  SafetyResult,
} from "@/lib/schema";
import { sseResponse } from "@/lib/sse";

export const runtime = "nodejs";
export const maxDuration = 180;

const DEFAULT_RUNS = Number(process.env.EXTRACTION_RUNS ?? 1);

function buildExtractionContent(
  image: string,
  ocrText: string | null,
): Array<
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
> {
  const parts: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [];

  if (ocrText && ocrText.length > 0) {
    parts.push({
      type: "text",
      text: `AUXILIARY OCR CONTEXT — a document-parsing service already ran on the same file and produced the text below. Use it as a strong hint for spellings and layout, but the PHOTO IS THE AUTHORITY: if the OCR conflicts with what you can clearly see in the image, trust the image and lower the confidence for that field. If the OCR is empty or garbled, ignore it and read the image directly.
--- BEGIN OCR TEXT ---
${ocrText}
--- END OCR TEXT ---

Now read the actual prescription photo below and return ONLY the JSON object.`,
    });
  } else {
    parts.push({
      type: "text",
      text: "Read this prescription photo and return ONLY the JSON object.",
    });
  }

  parts.push({ type: "image_url", image_url: { url: image } });
  return parts;
}

export async function POST(req: Request) {
  const raw: unknown = await req.json().catch(() => null);
  const body = (typeof raw === "object" && raw !== null ? raw : {}) as {
    image?: unknown;
    runs?: unknown;
  };

  const image =
    typeof body.image === "string" && body.image.startsWith("data:") ? body.image : null;
  if (!image) {
    return Response.json({ error: "image_required" }, { status: 400 });
  }
  const runs = Math.min(
    5,
    Math.max(
      1,
      typeof body.runs === "number" && Number.isFinite(body.runs) ? Math.round(body.runs) : DEFAULT_RUNS,
    ),
  );

  return sseResponse(async (send) => {
    const trace: PipelineStep[] = [];

    // Stage: prep — client already downscaled, this is just an entry marker.
    send({ type: "progress", stage: "prep", label: "Preparing image…" });

    // Stage: ocr (best-effort)
    let ocrText: string | null = null;
    if (reductoConfigured()) {
      send({ type: "progress", stage: "ocr", label: "Reading document…" });
      const reductoResult = await timed(
        "reducto OCR",
        "reducto",
        () => tryParseWithReducto(image),
        trace,
      );
      if (reductoResult && reductoResult.text) ocrText = reductoResult.text;
    }

    // Stage: vision — N parallel Plus extraction runs.
    send({
      type: "progress",
      stage: "vision",
      label: runs > 1 ? `Extracting medicines (×${runs})…` : "Extracting medicines…",
    });
    const settled = await Promise.allSettled(
      Array.from({ length: runs }, (_, i) =>
        timed(
          `extraction run ${i + 1}/${runs}`,
          VISION_MODEL,
          async (): Promise<ExtractionResult> => {
            const completion = await qwen.chat.completions.create({
              model: VISION_MODEL,
              temperature: 0.3,
              messages: [
                { role: "system", content: EXTRACTION_PROMPT },
                { role: "user", content: buildExtractionContent(image, ocrText) },
              ],
            });
            return coerceExtraction(
              parseJsonLoose(completion.choices?.[0]?.message?.content ?? ""),
            );
          },
          trace,
        ),
      ),
    );

    const runsRaw: ExtractionResult[] = settled
      .filter((s): s is PromiseFulfilledResult<ExtractionResult> => s.status === "fulfilled")
      .map((s) => s.value);
    if (runsRaw.length === 0) {
      send({ type: "error", message: "extraction_failed" });
      return;
    }

    // Stage: vote — a no-op when runs === 1, still emit the frame so the UI
    // can flick through the step. Silent when only one run.
    if (runsRaw.length > 1) {
      send({ type: "progress", stage: "vote", label: "Cross-checking readings…" });
    }
    const voteStart = Date.now();
    const voted = voteExtractions(runsRaw);
    trace.push({ model: "server", label: "self-consistency vote", ms: Date.now() - voteStart });

    // Stage: safety — Max grounding (best-effort).
    let safety: SafetyResult | null = null;
    if (voted.medicines.length > 0) {
      send({ type: "progress", stage: "safety", label: "Checking for safety issues…" });
      try {
        safety = await timed(
          "medical grounding + safety",
          REASONING_MODEL,
          async (): Promise<SafetyResult> => {
            const completion = await qwen.chat.completions.create({
              model: REASONING_MODEL,
              temperature: 0.2,
              messages: [{ role: "user", content: GROUNDING_PROMPT(voted) }],
            });
            return coerceSafety(
              parseJsonLoose(completion.choices?.[0]?.message?.content ?? ""),
            );
          },
          trace,
        );
      } catch {
        safety = null;
      }
    }

    const done: ExtractApiResponse = {
      result: voted,
      safety,
      runs_raw: runsRaw,
      trace: { steps: trace },
    };
    send({ type: "done", ...done } as unknown as import("@/lib/sse").SseEvent);
  });
}
