// POST /api/verify — medicine-box photo vs saved list + expiry read (Qwen Plus).
// Request: VerifyApiRequest · Response: VerifyResult & { trace: PipelineTrace }

import { qwen, VISION_MODEL, parseJsonLoose, timed, coerceVerify } from "@/lib/qwen";
import { VERIFY_PROMPT } from "@/lib/prompts";
import type { PipelineStep, VerifyResult } from "@/lib/schema";

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
      image?: unknown;
      medicines?: unknown;
    };

    const image =
      typeof body.image === "string" && body.image.startsWith("data:") ? body.image : null;
    if (!image) {
      return Response.json({ error: "image_required" }, { status: 400 });
    }
    // An empty list is allowed: the prompt then just identifies the medicine
    // and reads the expiry, with match = null.
    const medicines = toMedRefs(body.medicines);

    const result: VerifyResult = await timed(
      "verify medicine box",
      VISION_MODEL,
      async () => {
        const completion = await qwen.chat.completions.create({
          model: VISION_MODEL,
          temperature: 0.2,
          messages: [
            { role: "system", content: VERIFY_PROMPT(medicines) },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Here is the photo of the medicine. Return ONLY the JSON object.",
                },
                { type: "image_url", image_url: { url: image } },
              ],
            },
          ],
        });
        return coerceVerify(parseJsonLoose(completion.choices?.[0]?.message?.content ?? ""));
      },
      trace,
    );

    return Response.json({ ...result, trace: { steps: trace } });
  } catch {
    return Response.json({ error: "verify_failed" }, { status: 502 });
  }
}
