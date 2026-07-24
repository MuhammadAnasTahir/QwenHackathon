"use client";

import { useEffect, useState } from "react";
import { EVT_TRACE, type PipelineStep, type PipelineTrace } from "@/lib/schema";
import { useLang } from "@/lib/i18n";

/**
 * Judge-facing developer panel: a collapsible bottom drawer showing the last
 * pipeline trace (which Qwen model did what, and how long it took) plus the
 * raw JSON of the last payload dispatched on EVT_TRACE.
 *
 * The EVT_TRACE detail may be either a bare PipelineTrace ({ steps }) or any
 * larger payload containing a `trace` field (e.g. a full ExtractApiResponse);
 * both shapes are handled, and the full payload is kept for the raw-JSON view.
 */

interface Captured {
  steps: PipelineStep[];
  payload: unknown;
  at: string; // "HH:MM:SS"
}

function extractSteps(detail: unknown): PipelineStep[] | null {
  if (detail === null || typeof detail !== "object") return null;
  const d = detail as { steps?: unknown; trace?: { steps?: unknown } };
  const candidate = Array.isArray(d.steps)
    ? d.steps
    : d.trace && Array.isArray(d.trace.steps)
      ? d.trace.steps
      : null;
  if (!candidate) return null;
  return candidate.filter(
    (s: unknown): s is PipelineStep =>
      s !== null &&
      typeof s === "object" &&
      typeof (s as PipelineStep).model === "string" &&
      typeof (s as PipelineStep).label === "string" &&
      typeof (s as PipelineStep).ms === "number",
  );
}

function badgeStyle(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("plus")) return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (m.includes("max")) return "bg-violet-100 text-violet-800 border-violet-300";
  return "bg-stone-100 text-stone-600 border-stone-300";
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

export function DevPanel() {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [last, setLast] = useState<Captured | null>(null);

  useEffect(() => {
    const onTrace = (e: Event) => {
      const detail = (e as CustomEvent<PipelineTrace | unknown>).detail;
      const steps = extractSteps(detail);
      if (!steps) return;
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      setLast({
        steps,
        payload: detail,
        at: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
      });
    };
    window.addEventListener(EVT_TRACE, onTrace);
    return () => window.removeEventListener(EVT_TRACE, onTrace);
  }, []);

  const totalMs = last ? last.steps.reduce((sum, s) => sum + s.ms, 0) : 0;

  let payloadJson = "";
  if (last && showJson) {
    try {
      payloadJson = JSON.stringify(last.payload, null, 2);
    } catch {
      payloadJson = "(payload could not be serialized)";
    }
  }

  return (
    <div dir="ltr" className="fixed inset-x-0 bottom-0 z-40 select-none">
      {/* Drawer handle */}
      <div className="flex justify-end px-3 pb-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-h-12 items-center gap-2 rounded-full border border-stone-300 bg-white/95 px-4 py-2 text-sm font-bold text-stone-700 shadow-lg backdrop-blur transition-colors active:bg-stone-100"
        >
          <span aria-hidden="true">🔍</span>
          <span>Judge Mode</span>
          {last ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
              {last.steps.length}
            </span>
          ) : null}
          <span aria-hidden="true" className="text-xs">
            {open ? "▼" : "▲"}
          </span>
        </button>
      </div>

      {open ? (
        <div className="max-h-[55vh] overflow-y-auto border-t-2 border-stone-200 bg-white/95 px-4 pb-6 pt-3 shadow-2xl backdrop-blur">
          <div className="mx-auto w-full max-w-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold text-stone-800">
                🔍 {t("dev_panel_title")} — pipeline trace
              </h2>
              {last ? (
                <span className="text-xs font-semibold text-stone-500">
                  {last.at} · total {fmtMs(totalMs)}
                </span>
              ) : null}
            </div>

            {!last ? (
              <p className="rounded-xl bg-stone-50 p-3 text-sm text-stone-500">
                No trace captured yet. Run an extraction or send a chat message and the
                model handoff will appear here.
              </p>
            ) : (
              <>
                {/* Legend */}
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">
                    qwen plus — vision
                  </span>
                  <span className="rounded-full border border-violet-300 bg-violet-100 px-2 py-0.5 font-bold text-violet-800">
                    qwen max — reasoning
                  </span>
                  <span className="rounded-full border border-stone-300 bg-stone-100 px-2 py-0.5 font-bold text-stone-600">
                    browser
                  </span>
                </div>

                {/* Steps */}
                <ol className="space-y-1.5">
                  {last.steps.map((s, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2 rounded-xl border border-stone-100 bg-stone-50 px-3 py-2"
                    >
                      <span className="w-5 shrink-0 text-right text-xs font-bold text-stone-400">
                        {i + 1}
                      </span>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-xs font-bold ${badgeStyle(s.model)}`}
                      >
                        {s.model}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-700">
                        {s.label}
                      </span>
                      <span className="shrink-0 font-mono text-xs font-bold text-stone-500">
                        {fmtMs(s.ms)}
                      </span>
                    </li>
                  ))}
                </ol>

                {/* Raw JSON of the last payload */}
                <button
                  type="button"
                  onClick={() => setShowJson((v) => !v)}
                  aria-expanded={showJson}
                  className="flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-bold text-stone-600 underline decoration-dotted active:text-stone-900"
                >
                  <span aria-hidden="true">{showJson ? "▾" : "▸"}</span>
                  Raw JSON (last payload)
                </button>
                {showJson ? (
                  <pre className="max-h-64 overflow-auto rounded-xl bg-stone-900 p-3 text-xs leading-relaxed text-emerald-300">
                    {payloadJson}
                  </pre>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default DevPanel;
