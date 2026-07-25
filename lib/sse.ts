// ─────────────────────────────────────────────────────────────────────────────
// Sehat Saathi — Server-Sent Events helpers used by /api/chat and /api/extract.
//
// Both routes stream ndjson-inside-SSE events to the client:
//   data: {"type":"progress","stage":"vision","label":"Reading medicines…"}\n\n
//   data: {"type":"token","text":"سلام"}\n\n
//   data: {"type":"done","...":"..."}\n\n
//   data: {"type":"error","message":"..."}\n\n
// The consumer (lib/streamClient.ts) reads until it sees a "done" or "error".
// ─────────────────────────────────────────────────────────────────────────────

const encoder = new TextEncoder();

export type SseEvent =
  | { type: "progress"; stage: string; label: string }
  | { type: "token"; text: string }
  // "done" carries an arbitrary payload — the exact shape is the individual
  // route's response type (ChatApiResponse, ExtractApiResponse, …). We keep
  // it loose here so each route can spread its typed response inline.
  | ({ type: "done" } & Record<string, unknown>)
  | { type: "error"; message: string };

/** Serialize one event as an SSE frame. */
function frame(evt: SseEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(evt)}\n\n`);
}

export function sseHeaders(): HeadersInit {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    // Nginx/vercel etc: prevent buffering.
    "X-Accel-Buffering": "no",
    Connection: "keep-alive",
  };
}

/** Create a ReadableStream and give the caller a typed `send` helper. */
export function sseResponse(
  producer: (send: (evt: SseEvent) => void) => Promise<void>,
): Response {
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (evt: SseEvent) => {
        if (closed) return;
        try {
          controller.enqueue(frame(evt));
        } catch {
          // Consumer disconnected mid-stream.
          closed = true;
        }
      };
      try {
        await producer(send);
      } catch (err) {
        console.error("[SSE Error]", err);
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: "error", message: msg.slice(0, 200) });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });
  return new Response(stream, { headers: sseHeaders() });
}
