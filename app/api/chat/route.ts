// POST /api/chat — general medical assistant (Qwen Plus, vision-capable).
// Request: ChatApiRequest · Response: ChatApiResponse

import type OpenAI from "openai";
import { qwen, VISION_MODEL, timed } from "@/lib/qwen";
import { CHAT_SYSTEM } from "@/lib/prompts";
import type { ChatApiResponse, Lang, PipelineStep } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 120;

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
  const trace: PipelineStep[] = [];
  try {
    const raw: unknown = await req.json().catch(() => null);
    const body = (typeof raw === "object" && raw !== null ? raw : {}) as {
      messages?: unknown;
      images?: unknown;
      language?: unknown;
    };

    const history: ChatMsg[] = Array.isArray(body.messages)
      ? body.messages.filter(isChatMsg).slice(-20)
      : [];
    if (history.length === 0) {
      return Response.json({ error: "messages_required" }, { status: 400 });
    }
    const lang: Lang = body.language === "en" ? "en" : "ur";
    const images: string[] = Array.isArray(body.images)
      ? body.images
          .filter((s): s is string => typeof s === "string" && s.startsWith("data:"))
          .slice(0, 4)
      : [];

    // Attach images to the LAST user message as content parts.
    let lastUserIdx = -1;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }

    const oaMessages: OAMessage[] = [{ role: "system", content: CHAT_SYSTEM(lang) }];
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

    const completion = await timed(
      "chat reply",
      VISION_MODEL,
      () =>
        qwen.chat.completions.create({
          model: VISION_MODEL,
          temperature: 0.7,
          messages: oaMessages,
        }),
      trace,
    );

    let reply = completion.choices?.[0]?.message?.content ?? "";
    const red_flag = reply.includes("[RED_FLAG]");
    reply = reply.split("[RED_FLAG]").join("").trim();
    if (reply === "") {
      return Response.json({ error: "empty_reply" }, { status: 502 });
    }

    const res: ChatApiResponse = { reply, red_flag, trace: { steps: trace } };
    return Response.json(res);
  } catch {
    return Response.json({ error: "chat_failed" }, { status: 500 });
  }
}
