// POST /api/chat — streaming medical assistant (Qwen Plus, vision-capable).
//
// Response is Server-Sent Events. Frame types:
//   { type: "token", text: "…" }              // one chunk of the reply
//   { type: "done",  reply, red_flag, trace } // final full text + metadata
//   { type: "error", message }
//
// Streaming is the perception win: the user sees text appearing within ~1s
// of send instead of staring at a spinner for 15–30s while the model finishes.

import type OpenAI from "openai";
import { FAST_MODE, qwen, VISION_MODEL, timed } from "@/lib/qwen";
import { CHAT_SYSTEM } from "@/lib/prompts";
import type { ChatApiResponse, Lang, PipelineStep } from "@/lib/schema";
import { sseResponse } from "@/lib/sse";

export const runtime = "nodejs";
export const maxDuration = 180;

type ChatMsg = { role: "user" | "assistant"; content: string };
type OAMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function isChatMsg(u: unknown): u is ChatMsg {
  if (typeof u !== "object" || u === null) return false;
  const m = u as { role?: unknown; content?: unknown };
  return (m.role === "user" || m.role === "assistant") && typeof m.content === "string";
}

export async function POST(req: Request) {
  const raw: unknown = await req.json().catch(() => null);
  const body = (typeof raw === "object" && raw !== null ? raw : {}) as {
    messages?: unknown;
    images?: unknown;
    language?: unknown;
    romanReply?: unknown;
  };

  const history: ChatMsg[] = Array.isArray(body.messages)
    ? body.messages.filter(isChatMsg).slice(-20)
    : [];
  if (history.length === 0) {
    return Response.json({ error: "messages_required" }, { status: 400 });
  }
  const lang: Lang = body.language === "en" ? "en" : "ur";
  const romanReply = body.romanReply === true && lang === "ur";
  const images: string[] = Array.isArray(body.images)
    ? body.images
        .filter((s): s is string => typeof s === "string" && s.startsWith("data:"))
        .slice(0, 4)
    : [];

  let lastUserIdx = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "user") {
      lastUserIdx = i;
      break;
    }
  }

  const oaMessages: OAMessage[] = [
    { role: "system", content: CHAT_SYSTEM(lang, romanReply) },
  ];
  history.forEach((m, i) => {
    if (m.role === "user" && i === lastUserIdx && images.length > 0) {
      const parts: ContentPart[] = [];
      if (m.content.trim() !== "") parts.push({ type: "text", text: m.content });
      for (const img of images) {
        parts.push({ type: "image_url", image_url: { url: img } });
      }
      oaMessages.push({ role: "user", content: parts });
    } else {
      oaMessages.push({ role: m.role, content: m.content });
    }
  });

  return sseResponse(async (send) => {
    const trace: PipelineStep[] = [];
    let full = "";
    // Withhold streamed tokens until we know we haven't started with a
    // [RED_FLAG] marker (the model emits the token as its first output when
    // an emergency is detected — we strip it from the visible reply).
    let redFlagResolved = false;

    await timed(
      "chat reply",
      VISION_MODEL,
      async () => {
        // Cast lets us pass Qwen-specific `enable_thinking` / `reasoning_effort`
        // via the OpenAI SDK's pass-through body without TS whining about unknown keys.
        // We also cast the return so TS knows it's the streaming variant.
        const stream = (await qwen.chat.completions.create({
          model: VISION_MODEL,
          temperature: 0.7,
          stream: true,
          messages: oaMessages,
          ...FAST_MODE,
        } as unknown as Parameters<typeof qwen.chat.completions.create>[0])) as unknown as AsyncIterable<{
          choices?: { delta?: { content?: string } }[];
        }>;
        for await (const chunk of stream) {
          const choice = chunk.choices?.[0];
          if (!choice) continue;
          const delta = choice.delta?.content;
          if (typeof delta !== "string" || delta.length === 0) continue;
          full += delta;

          // Detect the [RED_FLAG] marker before releasing any tokens. Once
          // we're past the resolution point, stream every subsequent chunk
          // straight through (minus the marker itself if it appears).
          if (!redFlagResolved) {
            // Wait until we have at least 10 chars OR the marker to decide.
            if (full.length >= 10 || full.includes("[RED_FLAG]")) {
              redFlagResolved = true;
              const cleaned = full.split("[RED_FLAG]").join("");
              if (cleaned.length > 0) send({ type: "token", text: cleaned });
            }
            continue;
          }

          const cleaned = delta.split("[RED_FLAG]").join("");
          if (cleaned.length > 0) send({ type: "token", text: cleaned });
        }
      },
      trace,
    );

    // If the whole reply was shorter than the resolution threshold, flush now.
    if (!redFlagResolved && full.length > 0) {
      const cleaned = full.split("[RED_FLAG]").join("");
      if (cleaned.length > 0) send({ type: "token", text: cleaned });
    }

    const red_flag = full.includes("[RED_FLAG]");
    const reply = full.split("[RED_FLAG]").join("").trim();
    if (reply === "") {
      send({ type: "error", message: "empty_reply" });
      return;
    }

    const done: ChatApiResponse = { reply, red_flag, trace: { steps: trace } };
    // `done` is typed; SseEvent wants Record<string, unknown> — cast is safe.
    send({ type: "done", ...done } as unknown as import("@/lib/sse").SseEvent);
  });
}
