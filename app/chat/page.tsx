"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  EVT_TRACE,
  type Alarm,
  type ChatApiRequest,
  type ChatApiResponse,
  type ExtractApiRequest,
  type ExtractApiResponse,
  type PipelineTrace,
  type VerifyApiRequest,
  type VerifyResult,
} from "@/lib/schema";
import { useLang } from "@/lib/i18n";
import { initAudio, speak, stopSpeaking } from "@/lib/speech";
import { loadAlarms, saveAlarm } from "@/lib/alarms";
import { fileToDataUrl, pdfFirstPageToDataUrl, preprocess, thumbnail } from "@/lib/image";
import { CaptureOrUpload } from "@/components/CaptureOrUpload";
import { ChatMessage } from "@/components/ChatMessage";
import { ExtractReview } from "@/components/ExtractReview";
import { LanguageToggle } from "@/components/LanguageToggle";
import { MicButton } from "@/components/MicButton";
import RedFlagBanner from "@/components/RedFlagBanner";

// ── Message model (transcript items) ─────────────────────────────────────────

interface ChatMsg {
  id: string;
  kind: "chat";
  role: "user" | "assistant";
  text: string;
  image?: string | null;
}
interface ExtractMsg {
  id: string;
  kind: "extract";
  data: ExtractApiResponse;
  photo: string | null;
}
interface AlarmsLinkMsg {
  id: string;
  kind: "alarms_link";
}
type Msg = ChatMsg | ExtractMsg | AlarmsLinkMsg;

interface Attachment {
  full: string; // preprocessed image sent to the API + stored with alarms
  thumb: string; // small preview shown in the transcript / composer
}

let msgCounter = 0;
function nextId(): string {
  msgCounter += 1;
  return `m${Date.now().toString(36)}-${msgCounter}`;
}

/** Tell the DevPanel what just happened (trace steps + raw payload). */
function dispatchTrace(trace: PipelineTrace, payload?: unknown): void {
  if (typeof window === "undefined") return;
  const detail: PipelineTrace & { payload?: unknown } = { steps: trace.steps, payload };
  window.dispatchEvent(new CustomEvent(EVT_TRACE, { detail }));
}

export default function ChatPage() {
  const { lang, t, dir } = useLang();
  const ur = lang === "ur";

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [attachBusy, setAttachBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [redFlag, setRedFlag] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const mutedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    // Re-focus the input once the assistant is done so the user can just
    // keep typing without tapping the box again.
    if (!busy) inputRef.current?.focus();
  }, [messages, busy]);

  useEffect(() => {
    // Leaving the chat should never leave speech running.
    return () => stopSpeaking();
  }, []);

  const append = (...items: Msg[]) => setMessages((prev) => [...prev, ...items]);
  const removeMsg = (id: string) => setMessages((prev) => prev.filter((m) => m.id !== id));

  const sayReply = (text: string) => {
    if (!mutedRef.current) void speak(text, lang).catch(() => {});
  };

  const appendError = (offlineCheck = true) => {
    const text =
      offlineCheck && typeof navigator !== "undefined" && !navigator.onLine
        ? t("error_offline")
        : t("error_generic");
    append({ id: nextId(), kind: "chat", role: "assistant", text });
    sayReply(text);
  };

  // ── Attach a photo / PDF ───────────────────────────────────────────────────

  const onFile = async (f: File | undefined | null) => {
    if (!f || attachBusy) return;
    setAttachBusy(true);
    try {
      const raw =
        f.type === "application/pdf" ? await pdfFirstPageToDataUrl(f) : await fileToDataUrl(f);
      const full = await preprocess(raw, { maxDim: 1600 });
      const thumb = await thumbnail(full);
      setAttachment({ full, thumb });
    } catch {
      appendError(false);
    } finally {
      setAttachBusy(false);
    }
  };

  // ── Normal chat send ───────────────────────────────────────────────────────

  const sendChat = async (rawText: string) => {
    const text = rawText.trim();
    const img = attachment;
    if (busy || (!text && !img)) return;
    initAudio();
    stopSpeaking();

    const content = text || (ur ? "یہ تصویر دیکھیں" : "Please look at this photo");
    const userMsg: ChatMsg = {
      id: nextId(),
      kind: "chat",
      role: "user",
      text,
      image: img?.thumb ?? null,
    };

    // Full history (chat messages only), with a placeholder for image-only turns.
    const history: ChatApiRequest["messages"] = [
      ...messages
        .filter((m): m is ChatMsg => m.kind === "chat")
        .map((m) => ({
          role: m.role,
          content: m.text || (ur ? "یہ تصویر دیکھیں" : "Please look at this photo"),
        })),
      { role: "user" as const, content },
    ];

    append(userMsg);
    setInput("");
    setAttachment(null);
    setBusy(true);
    try {
      const body: ChatApiRequest = {
        messages: history,
        images: img ? [img.full] : undefined,
        language: lang,
      };
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`chat ${res.status}`);
      const data = (await res.json()) as ChatApiResponse;
      dispatchTrace(data.trace, data);
      setRedFlag(data.red_flag);
      append({ id: nextId(), kind: "chat", role: "assistant", text: data.reply });
      sayReply(data.reply);
    } catch {
      appendError();
    } finally {
      setBusy(false);
    }
  };

  // ── Action chip: read the prescription ─────────────────────────────────────

  const doExtract = async () => {
    const img = attachment;
    if (busy || !img) return;
    initAudio();
    stopSpeaking();
    append({ id: nextId(), kind: "chat", role: "user", text: t("action_read_rx"), image: img.thumb });
    setAttachment(null);
    setBusy(true);
    try {
      const body: ExtractApiRequest = { image: img.full };
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`extract ${res.status}`);
      const data = (await res.json()) as ExtractApiResponse;
      dispatchTrace(data.trace, data);
      append({ id: nextId(), kind: "extract", data, photo: img.full });
    } catch {
      appendError();
    } finally {
      setBusy(false);
    }
  };

  // ── Action chip: verify a medicine box ─────────────────────────────────────

  const doVerify = async () => {
    const img = attachment;
    if (busy || !img) return;
    initAudio();
    stopSpeaking();
    append({ id: nextId(), kind: "chat", role: "user", text: t("action_check_box"), image: img.thumb });
    setAttachment(null);
    setBusy(true);
    try {
      const body: VerifyApiRequest = {
        image: img.full,
        medicines: loadAlarms().map((a) => ({ brand_name: a.medicine_name, salt: a.salt })),
      };
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`verify ${res.status}`);
      const data = (await res.json()) as VerifyResult & { trace: PipelineTrace };
      dispatchTrace(data.trace, data);

      const status =
        data.match === true
          ? `✅ ${t("verify_match")}`
          : data.match === false
            ? `❌ ${t("verify_mismatch")}`
            : `❓ ${t("verify_unsure")}`;
      const lines = [status, ur ? data.explanation_ur : data.explanation_en];
      if (data.expired) lines.push(`⛔ ${t("expired_warning")}`);
      else if (data.expiry_date) {
        lines.push(ur ? `میعاد: ${data.expiry_date}` : `Expiry: ${data.expiry_date}`);
      }
      const text = lines.filter(Boolean).join("\n");
      append({ id: nextId(), kind: "chat", role: "assistant", text });
      sayReply(text);
    } catch {
      appendError();
    } finally {
      setBusy(false);
    }
  };

  // ── ExtractReview outcomes ─────────────────────────────────────────────────

  const onConfirmed = (reviewMsgId: string) => (alarms: Alarm[]) => {
    for (const a of alarms) saveAlarm(a);
    removeMsg(reviewMsgId);
    const text = ur
      ? `بہت خوب! ${alarms.length > 1 ? `${alarms.length} دواؤں کے` : "دوا کے"} الارم بن گئے ہیں۔ وقت پر گھنٹی بجے گی اور دوا کی تصویر نظر آئے گی۔`
      : `Done! ${alarms.length > 1 ? `Alarms for ${alarms.length} medicines are set.` : "Your medicine alarm is set."} It will ring on time and show the medicine photo.`;
    append(
      { id: nextId(), kind: "chat", role: "assistant", text },
      { id: nextId(), kind: "alarms_link" }
    );
    if (!mutedRef.current) void speak(text, lang).catch(() => {});
  };

  const onRetake = (reviewMsgId: string) => () => {
    removeMsg(reviewMsgId);
    setShowPicker(true);
  };

  // ── UI bits ────────────────────────────────────────────────────────────────

  const showChips = attachment !== null && input.trim() === "" && !busy;
  const urduFont = ur ? "font-urdu leading-loose" : "";
  const chipCls =
    "flex min-h-14 items-center gap-2 rounded-full border-2 border-emerald-200 bg-white px-5 text-lg font-bold text-emerald-800 shadow-sm transition-transform active:scale-95";

  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      if (next) stopSpeaking();
      return next;
    });
  };

  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col">
      {/* Header */}
      <header className="flex items-center gap-2 border-b border-stone-200 bg-white/90 px-2 py-1 backdrop-blur">
        <Link
          href="/"
          aria-label={ur ? "واپس" : "Back"}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-2xl text-stone-600 active:bg-stone-100"
        >
          <span aria-hidden="true">{dir === "rtl" ? "❯" : "❮"}</span>
        </Link>
        <h1 className={`flex-1 truncate text-2xl font-extrabold text-stone-900 ${urduFont}`} dir="auto">
          💬 {t("home_chat")}
        </h1>
        <LanguageToggle />
      </header>

      {redFlag ? <RedFlagBanner onDismiss={() => setRedFlag(false)} /> : null}

      {/* Transcript */}
      <main className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 pb-10 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/Transparent.png" alt="" className="h-32 w-32 object-contain drop-shadow-md" />
            <p className={`max-w-xs text-xl font-semibold text-stone-700 ${urduFont}`} dir="auto">
              {ur
                ? "آپ کیا جاننا چاہیں گے؟"
                : "What would you like to know?"}
            </p>
          </div>
        ) : null}

        {messages.map((m) => {
          if (m.kind === "chat") {
            return <ChatMessage key={m.id} role={m.role} text={m.text} image={m.image} />;
          }
          if (m.kind === "extract") {
            return (
              <ExtractReview
                key={m.id}
                data={m.data}
                photo={m.photo}
                onConfirmed={onConfirmed(m.id)}
                onRetake={onRetake(m.id)}
              />
            );
          }
          return (
            <Link
              key={m.id}
              href="/alarms"
              className={`flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-xl font-extrabold text-white shadow-md transition-transform active:scale-[0.98] ${urduFont}`}
            >
              ⏰ {ur ? "الارم دیکھیں" : "See my alarms"}
            </Link>
          );
        })}

        {/* Thinking skeleton */}
        {busy ? (
          <div className="flex justify-start">
            <div className="flex items-center gap-3 rounded-2xl rounded-ss-md border border-stone-100 bg-white px-4 py-3 shadow-sm">
              <span className="flex gap-1" aria-hidden="true">
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:0ms]" />
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:150ms]" />
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:300ms]" />
              </span>
              <span className={`text-lg text-stone-500 ${urduFont}`} dir="auto">
                {t("chat_thinking")}
              </span>
            </div>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </main>

      {/* Composer */}
      <footer className="border-t border-stone-200 bg-white px-2 pb-2 pt-1">
        {/* Attached photo preview */}
        {attachment ? (
          <div className="mb-2 flex items-center gap-3">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={attachment.thumb}
                alt=""
                className="h-20 w-20 rounded-xl border-2 border-emerald-200 object-cover"
              />
              <button
                type="button"
                onClick={() => setAttachment(null)}
                aria-label={t("cancel")}
                className="absolute -top-2 -end-2 flex h-8 w-8 items-center justify-center rounded-full bg-stone-700 text-sm text-white shadow"
              >
                ✕
              </button>
            </div>
            {showChips ? (
              <p className={`flex-1 text-base text-stone-500 ${urduFont}`} dir="auto">
                {ur ? "اب نیچے سے کام چنیں" : "Now pick an action below"}
              </p>
            ) : null}
          </div>
        ) : null}
        {attachBusy ? (
          <p className={`mb-2 animate-pulse text-base text-stone-500 ${urduFont}`} dir="auto">
            ⏳ {ur ? "تصویر تیار ہو رہی ہے…" : "Preparing the photo…"}
          </p>
        ) : null}

        {/* Action chips — shown when an image is attached and nothing typed yet */}
        {showChips ? (
          <div className="mb-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => void doExtract()} className={`${chipCls} ${urduFont}`}>
              📋 {t("action_read_rx")}
            </button>
            <button type="button" onClick={() => void doVerify()} className={`${chipCls} ${urduFont}`}>
              📦 {t("action_check_box")}
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.focus()}
              className={`${chipCls} ${urduFont}`}
            >
              💬 {t("action_just_ask")}
            </button>
          </div>
        ) : null}

        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            void sendChat(input);
          }}
        >
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            disabled={attachBusy}
            aria-label={t("chat_attach")}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-transparent transition-colors active:bg-stone-100 disabled:opacity-40"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/attachment.jpg" alt="" className="h-10 w-10 object-contain mix-blend-multiply" />
          </button>

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={ur ? "چیٹ" : "Chat"}
            dir="auto"
            autoFocus
            enterKeyHint="send"
            autoComplete="off"
            className={`h-12 min-w-0 flex-1 rounded-2xl border-2 border-stone-200 bg-stone-50 px-4 text-base text-stone-900 placeholder:text-stone-400 focus:border-emerald-500 focus:outline-none ${urduFont}`}
          />

          <MicButton
            onResult={(text) => {
              setInput("");
              void sendChat(text);
            }}
            onInterim={(s) => setInput(s)}
            disabled={busy}
          />

          <button
            type="submit"
            disabled={busy || (!input.trim() && !attachment)}
            aria-label={t("chat_send")}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-xl text-white shadow-md transition-colors active:bg-emerald-700 disabled:opacity-40"
          >
            <span aria-hidden="true" className={dir === "rtl" ? "-scale-x-100" : ""}>
              ➤
            </span>
          </button>
        </form>
      </footer>

      {/* Shared capture-or-upload picker */}
      <CaptureOrUpload
        open={showPicker}
        onClose={() => setShowPicker(false)}
        onFile={(f) => void onFile(f)}
      />
    </div>
  );
}
