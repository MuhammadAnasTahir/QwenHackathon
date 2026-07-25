// POST /api/translit — Urdu script → Roman Urdu (Latin, phonetic).
//
// Used as a TTS fallback: on devices with no Urdu/Arabic voice installed
// (typical Windows laptops), the client transliterates an Urdu reply to Roman
// Urdu and speaks it with an English voice. "پانی پیئں" → "paani piyein",
// which an English TTS voice reads intelligibly for Urdu speakers.
//
// Request:  { text: string }
// Response: { roman: string }

import { qwen, VISION_MODEL, FAST_MODE, safeErrorMessage } from "@/lib/qwen";

export const runtime = "nodejs";
export const maxDuration = 30;

const PROMPT = `You transliterate Urdu (Urdu script) into ROMAN URDU — the phonetic Latin spelling Pakistanis use when typing Urdu on an English keyboard.

RULES:
- Output ONLY the Roman Urdu text. No quotes, no notes, no Urdu script, no English translation.
- Keep it phonetic and natural, the way people actually type: "آرام کریں" → "aaram karein", "پانی پیئں" → "paani piyein", "ڈاکٹر سے پوچھیں" → "doctor se poochein", "دن میں دو بار" → "din mein do baar".
- Keep English words / medicine names (Panadol, Augmentin, mg) exactly as they are.
- Preserve sentence breaks and numbers.
- Do not add or remove meaning. Transliterate, do not translate.`;

export async function POST(req: Request) {
  try {
    const raw: unknown = await req.json().catch(() => null);
    const body = (typeof raw === "object" && raw !== null ? raw : {}) as { text?: unknown };
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return Response.json({ error: "text_required" }, { status: 400 });

    const completion = await qwen.chat.completions.create({
      model: VISION_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: text },
      ],
      ...FAST_MODE,
    } as unknown as Parameters<typeof qwen.chat.completions.create>[0]);

    const c = completion as unknown as {
      choices?: { message?: { content?: string } }[];
    };
    const roman = (c.choices?.[0]?.message?.content ?? "").trim();
    if (!roman) return Response.json({ error: "empty" }, { status: 502 });
    return Response.json({ roman });
  } catch (err) {
    return Response.json({ error: safeErrorMessage(err) }, { status: 500 });
  }
}
