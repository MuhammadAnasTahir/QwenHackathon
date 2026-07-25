"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  EVT_TRACE,
  SS_CHAT,
  type Alarm,
  type ChatApiRequest,
  type ChatApiResponse,
  type ExtractApiResponse,
  type PipelineTrace,
  type VerifyApiRequest,
  type VerifyResult,
} from "@/lib/schema";
import { useLang } from "@/lib/i18n";
import { initAudio, speak, stopSpeaking } from "@/lib/speech";
import { loadAlarms, saveAlarm } from "@/lib/alarms";
import { fileToDataUrl, pdfFirstPageToDataUrl, preprocess, thumbnail } from "@/lib/image";
import { streamJson } from "@/lib/streamClient";
import { CaptureOrUpload } from "@/components/CaptureOrUpload";
import { ChatMessage } from "@/components/ChatMessage";
import { ExtractReview } from "@/components/ExtractReview";
import { LanguageToggle } from "@/components/LanguageToggle";
import { MicButton } from "@/components/MicButton";
import { ProgressTimeline, type ProgressStage } from "@/components/ProgressTimeline";
import RedFlagBanner from "@/components/RedFlagBanner";

// ── Message model (transcript items) ─────────────────────────────────────────

interface ChatMsg {
  id: string;
  kind: "chat";
  role: "user" | "assistant";
  text: string;
  image?: string | null;
  /** For user messages: was this sent via the mic? Assistant replies inherit
   * this flag from their preceding user turn — that's how we decide whether
   * the reply should be spoken aloud. */
  viaVoice?: boolean;
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
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [extractStage, setExtractStage] = useState<ProgressStage | null>(null);
  const [redFlag, setRedFlag] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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

  // ── Chat history: sessionStorage (per-tab, cleared when tab closes) ──────
  //
  // - Hydrate on mount so navigating away to /alarms and back keeps the
  //   conversation visible.
  // - Save on every messages change.
  // - Strip image data URLs before saving (they're huge — sessionStorage
  //   quota is small) and drop the ExtractReview messages since they're a
  //   transient UX step (the review is either confirmed → alarms saved, or
  //   discarded → gone; either way there's nothing to restore).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(SS_CHAT);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      // Trust structurally but filter to known kinds.
      const restored: Msg[] = parsed.filter(
        (m: unknown): m is Msg =>
          m !== null &&
          typeof m === "object" &&
          "kind" in m &&
          ((m as Msg).kind === "chat" || (m as Msg).kind === "alarms_link"),
      );
      if (restored.length > 0) setMessages(restored);
    } catch {
      // Corrupt storage — drop it silently.
    }
    // Only hydrate once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const serializable = messages
        .filter((m) => m.kind === "chat" || m.kind === "alarms_link")
        .map((m) => {
          if (m.kind !== "chat") return m;
          // Drop the image data URL — too big for sessionStorage quota and
          // not useful to see in a restored session.
          return { ...m, image: null };
        });
      window.sessionStorage.setItem(SS_CHAT, JSON.stringify(serializable));
    } catch {
      // Quota exceeded / private mode / etc. — best-effort.
    }
  }, [messages]);

  const append = (...items: Msg[]) => setMessages((prev) => [...prev, ...items]);
  const removeMsg = (id: string) => setMessages((prev) => prev.filter((m) => m.id !== id));
  const appendTokenTo = (id: string, chunk: string) =>
    setMessages((prev) =>
      prev.map((m) =>
        m.kind === "chat" && m.id === id ? { ...m, text: m.text + chunk } : m,
      ),
    );

  /**
   * Speak the assistant's reply — but only when the user asked by voice.
   * Rationale: if you can type, you can read; the play-on-every-message UX
   * is noise. Voice reply is opt-in via the mic (a "voice message").
   */
  const sayReply = (text: string, viaVoice: boolean) => {
    if (!viaVoice) return;
    setSpeaking(true);
    void speak(text, lang)
      .catch(() => {})
      .finally(() => setSpeaking(false));
  };

  const cancelSpeaking = () => {
    stopSpeaking();
    setSpeaking(false);
  };

  const appendError = (viaVoice: boolean, offlineCheck = true) => {
    const text =
      offlineCheck && typeof navigator !== "undefined" && !navigator.onLine
        ? t("error_offline")
        : t("error_generic");
    append({ id: nextId(), kind: "chat", role: "assistant", text });
    sayReply(text, viaVoice);
  };

  // ── Attach a photo / PDF ───────────────────────────────────────────────────

  const onFile = async (f: File | undefined | null) => {
    if (!f || attachBusy) return;
    setAttachBusy(true);
    try {
      const raw =
        f.type === "application/pdf" ? await pdfFirstPageToDataUrl(f) : await fileToDataUrl(f);
      const full = await preprocess(raw, { maxDim: 1200 });
      const thumb = await thumbnail(full);
      setAttachment({ full, thumb });
    } catch {
      appendError(false, false);
    } finally {
      setAttachBusy(false);
    }
  };

  // ── Normal chat send (streaming) ──────────────────────────────────────────
  //
  // We create an EMPTY assistant message immediately, then append tokens to
  // it as they stream in. The user sees words appearing within ~1s instead of
  // staring at a spinner for the full model latency.

  const sendChat = async (rawText: string, viaVoice: boolean = false) => {
    const text = rawText.trim();
    const img = attachment;
    if (busy || (!text && !img)) return;
    initAudio();
    cancelSpeaking();

    const content = text || (ur ? "یہ تصویر دیکھیں" : "Please look at this photo");
    const userMsg: ChatMsg = {
      id: nextId(),
      kind: "chat",
      role: "user",
      text,
      image: img?.thumb ?? null,
      viaVoice,
    };

    const history: ChatApiRequest["messages"] = [
      ...messages
        .filter((m): m is ChatMsg => m.kind === "chat")
        .map((m) => ({
          role: m.role,
          content: m.text || (ur ? "یہ تصویر دیکھیں" : "Please look at this photo"),
        })),
      { role: "user" as const, content },
    ];

    const replyId = nextId();
    append(userMsg, { id: replyId, kind: "chat", role: "assistant", text: "" });
    setInput("");
    setAttachment(null);
    setBusy(true);
    setBusyLabel(ur ? "سوچ رہا ہوں…" : "Thinking…");

    const body: ChatApiRequest = {
      messages: history,
      images: img ? [img.full] : undefined,
      language: lang,
    };

    // Closure-mutated holders (TS won't narrow bare `let`s across an await).
    const chatHolder: { value: ChatApiResponse | null; gotAnything: boolean; failed: boolean } = {
      value: null,
      gotAnything: false,
      failed: false,
    };

    await streamJson(
      "/api/chat",
      body,
      {
        onToken: (chunk) => {
          chatHolder.gotAnything = true;
          setBusyLabel(null);
          appendTokenTo(replyId, chunk);
        },
        onDone: (payload) => {
          chatHolder.value = payload as unknown as ChatApiResponse;
        },
        onError: () => {
          chatHolder.failed = true;
        },
      },
    );

    setBusy(false);
    setBusyLabel(null);

    if (chatHolder.failed || !chatHolder.gotAnything || !chatHolder.value) {
      removeMsg(replyId);
      appendError(viaVoice);
      return;
    }
    const done = chatHolder.value;
    dispatchTrace(done.trace, done);
    setRedFlag(done.red_flag);
    // Only speak the reply when the user asked by voice.
    sayReply(done.reply, viaVoice);
  };

  // ── Action chip: read the prescription (streaming with staged timeline) ──

  const doExtract = async () => {
    const img = attachment;
    if (busy || !img) return;
    initAudio();
    cancelSpeaking();
    append({ id: nextId(), kind: "chat", role: "user", text: t("action_read_rx"), image: img.thumb });
    setAttachment(null);
    setBusy(true);
    setBusyLabel(null); // The timeline replaces the single-line label for extract.
    setExtractStage("prep");

    const extractHolder: { value: ExtractApiResponse | null; failed: boolean } = {
      value: null,
      failed: false,
    };

    await streamJson(
      "/api/extract",
      { image: img.full },
      {
        onProgress: (stage) => setExtractStage(stage as ProgressStage),
        onDone: (payload) => {
          extractHolder.value = payload as unknown as ExtractApiResponse;
        },
        onError: () => {
          extractHolder.failed = true;
        },
      },
    );

    setBusy(false);
    setExtractStage(null);

    if (extractHolder.failed || !extractHolder.value) {
      appendError(false);
      return;
    }
    const done = extractHolder.value;
    dispatchTrace(done.trace, done);
    if (done.result.medicines.length === 0) {
      const text = ur
        ? "تصویر سے کوئی دوا نہیں پڑھی جا سکی۔ برائے مہربانی صاف تصویر لیں۔"
        : "Could not read any medicines from the image. Please try a clearer photo.";
      append({ id: nextId(), kind: "chat", role: "assistant", text });
      return;
    }
    append({ id: nextId(), kind: "extract", data: done, photo: img.full });
  };

  // ── Action chip: verify a medicine box ─────────────────────────────────────

  const doVerify = async () => {
    const img = attachment;
    if (busy || !img) return;
    initAudio();
    cancelSpeaking();
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
    } catch {
      appendError(false);
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

  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col">
      {/* Header */}
      <header className="flex items-center gap-2 border-b border-stone-200 bg-white/90 px-3 py-2 backdrop-blur">
        <Link
          href="/"
          aria-label={ur ? "واپس" : "Back"}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl text-stone-600 active:bg-stone-100"
        >
          <span aria-hidden="true">{dir === "rtl" ? "→" : "←"}</span>
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
          <div className="mt-10 flex flex-col items-center gap-3 text-center">
            <span aria-hidden="true" className="text-6xl">
              📸
            </span>
            <p className={`max-w-xs text-xl text-stone-600 ${urduFont}`} dir="auto">
              {t("home_hint")}
            </p>
            <p className={`text-base text-stone-400 ${urduFont}`} dir="auto">
              {t("chat_tap_mic")}
            </p>
          </div>
        ) : null}

        {messages.map((m) => {
          if (m.kind === "chat") {
            return (
              <ChatMessage
                key={m.id}
                role={m.role}
                text={m.text}
                image={m.image}
                viaVoice={m.viaVoice}
              />
            );
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

        {/* Extract timeline — shown while /api/extract is running. Each row
            transitions pending → running → done as SSE progress events land,
            just like Claude's "reading / searching / responding" pill list. */}
        {extractStage !== null ? (
          <div className="flex justify-start">
            <div className="w-full max-w-[85%] rounded-2xl rounded-ss-md border border-stone-100 bg-white p-3 shadow-sm">
              <p className={`mb-2 text-sm font-bold text-stone-500 ${urduFont}`} dir="auto">
                {ur ? "نسخہ پڑھا جا رہا ہے…" : "Reading your prescription…"}
              </p>
              <ProgressTimeline currentStage={extractStage} />
            </div>
          </div>
        ) : null}

        {/* Chat-reply skeleton — only visible for the ~1s before the first
            token lands. Never shown when the extract timeline is up. */}
        {busy && busyLabel && extractStage === null ? (
          <div className="flex justify-start">
            <div className="flex items-center gap-3 rounded-2xl rounded-ss-md border border-stone-100 bg-white px-4 py-3 shadow-sm">
              <span className="flex gap-1" aria-hidden="true">
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:0ms]" />
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:150ms]" />
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:300ms]" />
              </span>
              <span className={`text-lg text-stone-500 ${urduFont}`} dir="auto">
                {busyLabel}
              </span>
            </div>
          </div>
        ) : null}

        {/* Speaking indicator — appears while the phone is reading the voice
            reply aloud. Tap to interrupt. */}
        {speaking ? (
          <div className="flex justify-start">
            <button
              type="button"
              onClick={cancelSpeaking}
              className={`flex items-center gap-3 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-emerald-800 shadow-sm transition-transform active:scale-95 ${urduFont}`}
              dir="auto"
            >
              <span aria-hidden="true" className="animate-pulse text-xl leading-none">
                🔊
              </span>
              <span className="text-sm font-bold">
                {ur ? "بولا جا رہا ہے — روکنے کے لیے دبائیں" : "Speaking — tap to stop"}
              </span>
            </button>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </main>

      {/* Composer */}
      <footer className="border-t border-stone-200 bg-white px-3 pb-3 pt-2">
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
          className="flex items-center gap-2"
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
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-3xl text-emerald-700 transition-colors active:bg-emerald-100 disabled:opacity-40"
          >
            <span aria-hidden="true">📷</span>
          </button>

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("chat_placeholder")}
            dir="auto"
            autoFocus
            enterKeyHint="send"
            autoComplete="off"
            className={`h-16 min-w-0 flex-1 rounded-2xl border-2 border-stone-200 bg-stone-50 px-4 text-lg text-stone-900 placeholder:text-stone-400 focus:border-emerald-500 focus:outline-none ${urduFont}`}
          />

          <MicButton
            onResult={(text) => {
              setInput("");
              // Voice-message flow: mic → send as voice → auto-spoken reply.
              void sendChat(text, true);
            }}
            onInterim={(s) => setInput(s)}
            disabled={busy}
          />

          <button
            type="submit"
            disabled={busy || (!input.trim() && !attachment)}
            aria-label={t("chat_send")}
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-2xl text-white shadow-md transition-colors active:bg-emerald-700 disabled:opacity-40"
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
