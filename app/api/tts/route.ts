// POST /api/tts — text + lang → synthesized speech (Google Cloud Text-to-Speech).
// Request: { text: string; lang: "ur" | "en" } · Response: audio/mpeg bytes
//
// Alarm announcements need to actually sound like Urdu — the browser's
// built-in speechSynthesis has no reliable Urdu voice on most devices, so
// this proxies to Google Cloud TTS (which has proper ur-IN voices) instead.
// The API key stays server-side; the client never sees it.

import type { Lang } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 30;

const VOICE_FOR_LANG: Record<Lang, { languageCode: string; ssmlGender: "FEMALE" | "MALE" }> = {
  ur: { languageCode: "ur-IN", ssmlGender: "FEMALE" },
  en: { languageCode: "en-US", ssmlGender: "FEMALE" },
};

export async function POST(req: Request) {
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "tts_not_configured" }, { status: 503 });
  }

  const raw: unknown = await req.json().catch(() => null);
  const body = (typeof raw === "object" && raw !== null ? raw : {}) as {
    text?: unknown;
    lang?: unknown;
  };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return Response.json({ error: "text_required" }, { status: 400 });
  }
  const lang: Lang = body.lang === "en" ? "en" : "ur";
  const voice = VOICE_FOR_LANG[lang];

  try {
    const upstream = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text },
          voice,
          audioConfig: { audioEncoding: "MP3" },
        }),
      },
    );
    if (!upstream.ok) {
      return Response.json({ error: "tts_upstream_failed" }, { status: 502 });
    }
    const data = (await upstream.json()) as { audioContent?: string };
    if (!data.audioContent) {
      return Response.json({ error: "tts_empty_response" }, { status: 502 });
    }
    const audio = Buffer.from(data.audioContent, "base64");
    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: "tts_failed" }, { status: 502 });
  }
}
