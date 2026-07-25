// POST /api/extract — prescription photo → structured medicines.
//
// Pipeline (best-quality path):
//   1) Reducto OCR pass (image or PDF → clean layout-preserved text)
//   2) N parallel Qwen 3.7 Plus reads (self-consistency @ temp 0.3) —
//      each read gets BOTH the raw image AND the Reducto OCR text as
//      auxiliary context. Vision-language models are measurably more
//      accurate when handed a good OCR pass alongside the pixels.
//   3) Majority vote across the N runs
//   4) Qwen 3.7 Max grounding + safety pass (best-effort)
//
// Reducto is treated as best-effort: if it is unconfigured, times out, or
// errors, we skip it and Plus reads the image alone. The rest of the pipeline
// is unchanged. This keeps the app robust while adding real accuracy gains
// on the paths where Reducto helps most (PDFs, printed labels).
//
// Request: ExtractApiRequest · Response: ExtractApiResponse

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

export const runtime = "nodejs";
export const maxDuration = 120;

/** Build the user-message content parts for a single Plus extraction run.
 *  When Reducto text is available, it is embedded above the image with a
 *  clear "auxiliary" framing so Plus knows the pixels are still authoritative
 *  when the two disagree. */
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
      text: `AUXILIARY OCR CONTEXT — a document-parsing service (Reducto) already ran on the same file and produced the text below. Use it as a strong hint for spellings and layout, but the PHOTO IS THE AUTHORITY: if the OCR conflicts with what you can clearly see in the image, trust the image and lower the confidence for that field. If the OCR is empty or garbled, ignore it and read the image directly.
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
  const trace: PipelineStep[] = [];
  try {
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
        typeof body.runs === "number" && Number.isFinite(body.runs) ? Math.round(body.runs) : 3,
      ),
    );

    // ── Step 1: Reducto OCR pass (best-effort) ────────────────────────────────
    let ocrText: string | null = null;
    if (reductoConfigured()) {
      const reductoResult = await timed(
        "reducto OCR",
        "reducto",
        () => tryParseWithReducto(image),
        trace,
      );
      if (reductoResult && reductoResult.text) {
        ocrText = reductoResult.text;
      }
    }

    // ── Step 2: N parallel Plus extraction runs (with OCR context if we have it) ─
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
                {
                  role: "user",
                  content: buildExtractionContent(image, ocrText),
                },
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
      return Response.json({ error: "extraction_failed" }, { status: 502 });
    }

    // ── Step 3: Majority vote across runs ────────────────────────────────────
    const voteStart = Date.now();
    const voted = voteExtractions(runsRaw);
    trace.push({ model: "server", label: "self-consistency vote", ms: Date.now() - voteStart });

    // ── Step 4: Max grounding pass (best-effort) ─────────────────────────────
    let safety: SafetyResult | null = null;
    if (voted.medicines.length > 0) {
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

    const res: ExtractApiResponse = {
      result: voted,
      safety,
      runs_raw: runsRaw,
      trace: { steps: trace },
    };
    return Response.json(res);
  } catch {
    return Response.json({ error: "extraction_failed" }, { status: 500 });
  }
}
