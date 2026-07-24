// POST /api/extract — prescription photo → structured medicines.
// Pipeline: N parallel Qwen Plus reads (self-consistency, temp 0.3)
//           → majority vote → Qwen Max grounding/safety pass (best-effort).
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
import { voteExtractions } from "@/lib/vote";
import type {
  ExtractApiResponse,
  ExtractionResult,
  PipelineStep,
  SafetyResult,
} from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 120;

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
      Math.max(1, typeof body.runs === "number" && Number.isFinite(body.runs) ? Math.round(body.runs) : 3),
    );

    // ── N parallel extraction runs (keep whatever succeeds) ──────────────────
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
                  content: [
                    {
                      type: "text",
                      text: "Read this prescription photo and return ONLY the JSON object.",
                    },
                    { type: "image_url", image_url: { url: image } },
                  ],
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

    // ── Majority vote across runs ────────────────────────────────────────────
    const voteStart = Date.now();
    const voted = voteExtractions(runsRaw);
    trace.push({ model: "server", label: "self-consistency vote", ms: Date.now() - voteStart });

    // ── Max grounding pass (best-effort — null on any failure) ───────────────
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
