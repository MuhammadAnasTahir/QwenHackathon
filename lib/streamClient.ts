// ─────────────────────────────────────────────────────────────────────────────
// Sehat Saathi — client-side SSE reader for /api/chat and /api/extract.
// The endpoints send `data: <json>\n\n` frames; we parse them incrementally
// and invoke typed callbacks. Compatible with both the WHATWG fetch stream
// (browser) and Node's fetch (used by eval/run.mjs).
// ─────────────────────────────────────────────────────────────────────────────

export type StreamEvent =
  | { type: "progress"; stage: string; label: string }
  | { type: "token"; text: string }
  | { type: "done"; [k: string]: unknown }
  | { type: "error"; message: string };

export interface StreamCallbacks {
  onProgress?(stage: string, label: string): void;
  onToken?(text: string): void;
  onDone?(payload: Record<string, unknown>): void;
  onError?(err: Error): void;
}

/**
 * POST JSON to `url` and consume the SSE response. Resolves when the stream
 * ends. Rejects only on transport failure — server-reported errors go through
 * `onError` and then the returned promise resolves normally.
 */
export async function streamJson(
  url: string,
  body: unknown,
  cb: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    cb.onError?.(err instanceof Error ? err : new Error(String(err)));
    return;
  }

  if (!res.ok || !res.body) {
    cb.onError?.(new Error(`http ${res.status}`));
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        // Events are separated by a blank line.
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const line = rawEvent.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            const evt = JSON.parse(payload) as StreamEvent;
            if (evt.type === "progress") cb.onProgress?.(evt.stage, evt.label);
            else if (evt.type === "token") cb.onToken?.(evt.text);
            else if (evt.type === "done") cb.onDone?.(evt as Record<string, unknown>);
            else if (evt.type === "error") cb.onError?.(new Error(evt.message));
          } catch {
            /* malformed event — ignore */
          }
        }
      }
      if (done) break;
    }
  } catch (err) {
    cb.onError?.(err instanceof Error ? err : new Error(String(err)));
  }
}
