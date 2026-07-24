// POST /api/safety — medicine list → duplicate salts / interactions (Qwen Max).
// Request: SafetyApiRequest · Response: SafetyResult & { trace: PipelineTrace }

import { qwen, REASONING_MODEL, parseJsonLoose, timed, coerceSafety } from "@/lib/qwen";
import { SAFETY_PROMPT } from "@/lib/prompts";
import type { Lang, PipelineStep, SafetyResult } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 120;

type MedRef = { brand_name: string; salt: string | null };

function toMedRefs(u: unknown): MedRef[] {
  if (!Array.isArray(u)) return [];
  const out: MedRef[] = [];
  for (const item of u.slice(0, 15)) {
    if (typeof item !== "object" || item === null) continue;
    const m = item as { brand_name?: unknown; salt?: unknown };
    if (typeof m.brand_name !== "string" || m.brand_name.trim() === "") continue;
    out.push({
      brand_name: m.brand_name.trim(),
      salt: typeof m.salt === "string" && m.salt.trim() !== "" ? m.salt.trim() : null,
    });
  }
  return out;
}

export async function POST(req: Request) {
  const trace: PipelineStep[] = [];
  try {
    const raw: unknown = await req.json().catch(() => null);
    const body = (typeof raw === "object" && raw !== null ? raw : {}) as {
      medicines?: unknown;
      language?: unknown;
    };

    const medicines = toMedRefs(body.medicines);
    if (medicines.length === 0) {
      return Response.json({ error: "medicines_required" }, { status: 400 });
    }
    const lang: Lang = body.language === "en" ? "en" : "ur";

    const result: SafetyResult = await timed(
      "safety check",
      REASONING_MODEL,
      async () => {
        const completion = await qwen.chat.completions.create({
          model: REASONING_MODEL,
          temperature: 0.2,
          messages: [{ role: "user", content: SAFETY_PROMPT(medicines, lang) }],
        });
        return coerceSafety(parseJsonLoose(completion.choices?.[0]?.message?.content ?? ""));
      },
      trace,
    );

    return Response.json({ ...result, trace: { steps: trace } });
  } catch {
    return Response.json({ error: "safety_failed" }, { status: 502 });
  }
}
