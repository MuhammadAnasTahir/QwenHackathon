"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  EVT_TRACE,
  SS_CHAT,
  type ChatApiRequest,
  type ChatApiResponse,
  type ExtractApiResponse,
  type PipelineTrace,
} from "@/lib/schema";
import { useLang } from "@/lib/i18n";
import { buildAlarmsFromExtraction, saveAlarm } from "@/lib/alarms";
import { hasUrduCapableVoice, initAudio, speak, stopSpeaking } from "@/lib/speech";
import { fileToDataUrl, pdfFirstPageToDataUrl, preprocess, thumbnail } from "@/lib/image";
import { streamJson } from "@/lib/streamClient";
import { CaptureOrUpload } from "@/components/CaptureOrUpload";
import { ChatMessage } from "@/components/ChatMessage";
import { LanguageToggle } from "@/components/LanguageToggle";
import RedFlagBanner from "@/components/RedFlagBanner";
import { VoiceMessage } from "@/components/VoiceMessage";
import { VoiceRecordButton } from "@/components/VoiceRecordButton";

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
interface AlarmsLinkMsg {
  id: string;
  kind: "alarms_link";
}
/** A "do you want to add these to your alarms?" prompt card. Alarms are only
 * created when the user taps Yes — never automatically. */
interface AlarmOfferMsg {
  id: string;
  kind: "alarm_offer";
  image: string; // full data URL to run extraction on
  status: "pending" | "adding" | "done" | "empty";
  count?: number;
}
interface VoiceMsg {
  id: string;
  kind: "voice";
  role: "user" | "assistant";
  audioUrl?: string | null; // user recording (object URL); null after restore
  text?: string | null; // underlying text — NEVER displayed; used for TTS + history context
  durationMs?: number;
  autoPlay?: boolean;
}
type Msg = ChatMsg | AlarmsLinkMsg | AlarmOfferMsg | VoiceMsg;

interface Attachment {
  full: string; // preprocessed image sent to the API + stored with alarms
  thumb: string; // small preview shown in the transcript / composer
}

let msgCounter = 0;
function nextId(): string {
  msgCounter += 1;
  return `m${Date.now().toString(36)}-${msgCounter}`;
}

// ── Instant greeting ──────────────────────────────────────────────────────────
// A bare "hello" / "salam" gets a fixed, instant intro (no model call). Anything
// with real content ("hello, I have a fever") is NOT a pure greeting and goes to
// Qwen as normal.

const GREETING_INTRO = {
  ur: "السلام علیکم! میں صحت ساتھی ہوں — آپ کا صحت کا دوست۔ میں آپ کی مدد کے لیے حاضر ہوں۔ یاد رکھیں، میں ڈاکٹر نہیں ہوں۔",
  roman:
    "Assalam o alaikum! Main Sehat Saathi hoon — aap ka sehat ka dost. Main aap ki madad ke liye hazir hoon. Yaad rakhein, main doctor nahi hoon.",
  en: "Hello, I am Sehat Saathi — your health companion. How can I help you today? Remember, I am not a doctor.",
};

function isPureGreeting(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 32) return false; // too long to be just a greeting
  // Urdu-script greetings.
  if (/^(السلام|اسلام|سلام|ہیلو|ہائے|آداب)/.test(t)) return true;
  // Normalise Latin: lowercase, letters + spaces only.
  const c = t
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!c) return false;
  const exact = new Set([
    "hello",
    "hi",
    "hey",
    "helo",
    "hiya",
    "hello there",
    "hi there",
    "salam",
    "salaam",
    "asalam",
    "assalam",
    "aoa",
    "adab",
    "adaab",
    "hey there",
  ]);
  if (exact.has(c)) return true;
  // "assalam o alaikum", "salam alaikum", etc.
  if (/^(assalam|asalam|salam|salaam)\b/.test(c)) return true;
  // "hello/hi/hey <one short word>" e.g. "hello there".
  if (/^(hello|hi|hey)\b/.test(c) && c.split(" ").length <= 2) return true;
  return false;
}

/** Does the user want to add medicines to their alarms? (English / Roman /
 * Urdu). Used to offer the gated "add to alarms" card from a typed request. */
function isAddAlarmIntent(text: string): boolean {
  if (/الارم|یاد ?دہانی|شیڈول|ریمائنڈر/.test(text)) return true;
  const c = text.toLowerCase();
  const hasNoun = /\b(alarm|alarms|reminder|reminders|schedule)\b/.test(c);
  const hasVerb = /\b(add|set|create|make|put|save|register)\b/.test(c);
  if (hasNoun && hasVerb) return true;
  if (hasNoun && /\b(my|the|these|to)\b/.test(c)) return true;
  return false;
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
  const [redFlag, setRedFlag] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  // Whether this device can speak Urdu script natively (phone: usually yes;
  // Windows laptop: usually no). Determined once on mount. When false, Urdu
  // voice replies are requested in Roman Urdu and spoken with an English voice.
  const urduVoiceRef = useRef<boolean>(true);

  // The most recent prescription image sent in this chat — lets a typed
  // "add to my alarms" request extract from it without re-uploading.
  const lastRxImageRef = useRef<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void hasUrduCapableVoice().then((has) => {
      if (!cancelled) urduVoiceRef.current = has;
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
      // Trust structurally but filter to known kinds. Restored voice messages
      // never auto-play (autoPlay is stripped on save) and lose their audioUrl
      // (blob URLs don't survive navigation) — they show as static bubbles.
      const restored: Msg[] = parsed.filter(
        (m: unknown): m is Msg =>
          m !== null &&
          typeof m === "object" &&
          "kind" in m &&
          ((m as Msg).kind === "chat" ||
            (m as Msg).kind === "alarms_link" ||
            (m as Msg).kind === "voice" ||
            (m as Msg).kind === "alarm_offer"),
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
        .filter(
          (m) =>
            m.kind === "chat" ||
            m.kind === "alarms_link" ||
            m.kind === "voice" ||
            // Keep only RESOLVED offer cards (the "Yes → added" result). A
            // still-pending offer isn't persisted — its Yes button needs the
            // image, which we strip, so restoring a pending one would break it.
            (m.kind === "alarm_offer" && (m.status === "done" || m.status === "empty")),
        )
        .map((m) => {
          if (m.kind === "chat") {
            // Drop the image data URL — too big for sessionStorage quota.
            return { ...m, image: null };
          }
          if (m.kind === "voice") {
            // Blob object URLs don't survive navigation, and autoPlay must not
            // re-fire on restore — strip both. `text` stays for history context.
            return { ...m, audioUrl: null, autoPlay: false };
          }
          if (m.kind === "alarm_offer") {
            // Strip the heavy image data URL; the resolved card doesn't need it.
            return { ...m, image: "" };
          }
          return m;
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
  const updateOffer = (id: string, patch: Partial<AlarmOfferMsg>) =>
    setMessages((prev) =>
      prev.map((m) => (m.kind === "alarm_offer" && m.id === id ? { ...m, ...patch } : m)),
    );

  /** User tapped "Yes" on an alarm-offer card: extract the prescription and
   * create alarms. This is the ONLY path that creates alarms from chat. */
  const confirmAddAlarms = async (offerId: string, image: string) => {
    if (busy) return;
    updateOffer(offerId, { status: "adding" });
    setBusy(true);
    const holder: { value: ExtractApiResponse | null; failed: boolean } = {
      value: null,
      failed: false,
    };
    await streamJson(
      "/api/extract",
      { image },
      {
        onDone: (payload) => {
          holder.value = payload as unknown as ExtractApiResponse;
        },
        onError: () => {
          holder.failed = true;
        },
      },
    );
    setBusy(false);

    if (holder.failed || !holder.value) {
      updateOffer(offerId, { status: "pending" });
      appendError(false);
      return;
    }
    const res = holder.value;
    dispatchTrace(res.trace, res);
    if (res.result.medicines.length === 0) {
      updateOffer(offerId, { status: "empty" });
      return;
    }
    try {
      const alarms = await buildAlarmsFromExtraction(res.result, image);
      for (const a of alarms) saveAlarm(a);
      updateOffer(offerId, { status: "done", count: alarms.length });
      const text = ur
        ? `${alarms.length > 1 ? `${alarms.length} دواؤں کے` : "دوا کے"} الارم بن گئے ہیں۔ وقت پر گھنٹی بجے گی۔`
        : `${alarms.length > 1 ? `Alarms for ${alarms.length} medicines are set.` : "Your medicine alarm is set."} It will ring on time.`;
      append(
        { id: nextId(), kind: "chat", role: "assistant", text },
        { id: nextId(), kind: "alarms_link" },
      );
    } catch {
      updateOffer(offerId, { status: "pending" });
      appendError(false);
    }
  };

  /**
   * Speak the assistant's reply — but only when the user asked by voice.
   * Rationale: if you can type, you can read; the play-on-every-message UX
   * is noise. Voice reply is opt-in via the mic (a "voice message").
   *
   * `speakLang` may differ from the UI language: on a device with no Urdu
   * voice we reply in Roman Urdu and speak it as "en" (English voice reading
   * phonetic Urdu), which is intelligible and works everywhere.
   */
  const sayReply = (text: string, viaVoice: boolean, speakLang: typeof lang = lang) => {
    if (!viaVoice) return;
    setSpeaking(true);
    void speak(text, speakLang)
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
    // Error strings are UI-language Urdu script; speak() transliterates them
    // on devices without an Urdu voice.
    sayReply(text, viaVoice, lang);
  };

  // Build the model conversation history from the transcript, including BOTH
  // typed chat messages and voice messages (whose hidden `text` is the STT
  // transcript / spoken reply). ExtractReview and alarm-link items are skipped.
  const imagePlaceholder = () => (ur ? "یہ تصویر دیکھیں" : "Please look at this photo");
  const buildHistory = (extra: ChatApiRequest["messages"]): ChatApiRequest["messages"] => {
    const prior: ChatApiRequest["messages"] = [];
    for (const m of messages) {
      if (m.kind === "chat") {
        prior.push({ role: m.role, content: m.text || imagePlaceholder() });
      } else if (m.kind === "voice" && m.text) {
        prior.push({ role: m.role, content: m.text });
      }
    }
    return [...prior, ...extra];
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

    // Image with no typed instruction: send a neutral marker so the model
    // (guided by CHAT_SYSTEM) identifies the document and asks what to do,
    // instead of dumping a full analysis.
    const content =
      text || (ur ? "میں نے یہ دستاویز بھیجی ہے۔" : "I've attached this document.");
    const userMsg: ChatMsg = {
      id: nextId(),
      kind: "chat",
      role: "user",
      text,
      image: img?.thumb ?? null,
      viaVoice,
    };

    const history = buildHistory([{ role: "user", content }]);

    // Roman-Urdu path: only for voice messages, only in Urdu, only when the
    // device has no Urdu-capable voice. Keeps proper Urdu script for phones
    // and for typed messages.
    const useRoman = viaVoice && ur && !urduVoiceRef.current;
    const replySpeakLang: typeof lang = useRoman ? "en" : lang;

    // Instant greeting — deterministic intro, no model latency. Only when the
    // message is a bare greeting and there's no attached image.
    if (!img && isPureGreeting(text)) {
      const shown = ur ? GREETING_INTRO.ur : GREETING_INTRO.en;
      append(userMsg, { id: nextId(), kind: "chat", role: "assistant", text: shown });
      setInput("");
      if (viaVoice) {
        if (useRoman) sayReply(GREETING_INTRO.roman, true, "en");
        else sayReply(shown, true, lang);
      }
      return;
    }

    // "Add to my alarms" typed request — the app creates alarms, not the model.
    // If a prescription was sent earlier, offer to add from it; otherwise ask
    // for a photo.
    if (!img && isAddAlarmIntent(text)) {
      setInput("");
      if (lastRxImageRef.current) {
        append(userMsg, {
          id: nextId(),
          kind: "alarm_offer",
          image: lastRxImageRef.current,
          status: "pending",
        });
      } else {
        const msg = ur
          ? "الارم بنانے کے لیے پہلے اپنے نسخے کی تصویر بھیجیں۔ پھر میں دوائیں پڑھ کر الارم بنا دوں گا۔"
          : "To create alarms, please send a photo of your prescription first. Then I can read the medicines and set the alarms.";
        append(userMsg, { id: nextId(), kind: "chat", role: "assistant", text: msg });
        if (viaVoice) sayReply(msg, true, replySpeakLang);
      }
      return;
    }

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
      romanReply: useRoman,
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
    // Only speak the reply when the user asked by voice. On no-Urdu-voice
    // devices the reply is Roman Urdu, spoken with the English voice.
    sayReply(done.reply, viaVoice, replySpeakLang);

    // If a prescription image was sent, remember it and offer to add alarms —
    // gated behind the user's Yes, never automatic. Skip for red-flag turns.
    if (img && !done.red_flag) {
      lastRxImageRef.current = img.full;
      append({ id: nextId(), kind: "alarm_offer", image: img.full, status: "pending" });
    }
  };

  // ── Voice message: voice in → voice out (no visible text) ─────────────────
  //
  // The recorder gives us the user's audio (for playback) + a transcript. The
  // transcript goes to the text-only model but is NEVER shown; the reply comes
  // back as an auto-playing voice bubble, also with no visible text.

  const sendVoice = async (capture: {
    transcript: string;
    audioUrl: string | null;
    durationMs: number;
  }) => {
    const transcript = capture.transcript.trim();
    if (busy || !transcript) return;
    initAudio();
    cancelSpeaking();

    const userVoice: VoiceMsg = {
      id: nextId(),
      kind: "voice",
      role: "user",
      audioUrl: capture.audioUrl,
      text: transcript,
      durationMs: capture.durationMs,
    };
    const history = buildHistory([{ role: "user", content: transcript }]);
    append(userVoice);
    setBusy(true);
    setBusyLabel(ur ? "جواب تیار ہو رہا ہے…" : "Preparing a reply…");

    const body: ChatApiRequest = { messages: history, language: lang };
    const holder: { value: ChatApiResponse | null; failed: boolean } = {
      value: null,
      failed: false,
    };

    await streamJson(
      "/api/chat",
      body,
      {
        onDone: (payload) => {
          holder.value = payload as unknown as ChatApiResponse;
        },
        onError: () => {
          holder.failed = true;
        },
      },
    );

    setBusy(false);
    setBusyLabel(null);

    if (holder.failed || !holder.value) {
      const errText = ur
        ? "معذرت، جواب نہیں مل سکا۔ دوبارہ کوشش کریں۔"
        : "Sorry, I could not get a reply. Please try again.";
      append({
        id: nextId(),
        kind: "voice",
        role: "assistant",
        text: errText,
        autoPlay: true,
      });
      return;
    }
    const done = holder.value;
    dispatchTrace(done.trace, done);
    setRedFlag(done.red_flag);
    append({
      id: nextId(),
      kind: "voice",
      role: "assistant",
      text: done.reply,
      autoPlay: true,
    });
  };

  // ── UI bits ────────────────────────────────────────────────────────────────

  const urduFont = ur ? "font-urdu leading-loose" : "";

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
        <h1 className={`flex flex-1 items-center gap-2 truncate text-2xl font-extrabold text-stone-900 ${urduFont}`} dir="auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Transparent.png" alt="" className="h-7 w-7 object-contain" />
          {t("home_chat")}
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
          if (m.kind === "voice") {
            return (
              <VoiceMessage
                key={m.id}
                role={m.role}
                audioUrl={m.audioUrl}
                text={m.text}
                lang={lang}
                durationMs={m.durationMs}
                autoPlay={m.autoPlay}
              />
            );
          }
          if (m.kind === "alarm_offer") {
            const offer = m;
            return (
              <div
                key={m.id}
                className="flex justify-start"
              >
                <div className="w-full max-w-[90%] rounded-2xl rounded-ss-md border-2 border-emerald-200 bg-emerald-50/70 p-4 shadow-sm">
                  {offer.status === "pending" ? (
                    <>
                      <p
                        className={`mb-3 text-lg font-bold text-emerald-900 ${urduFont}`}
                        dir="auto"
                      >
                        ⏰ {ur
                          ? "کیا میں ان دواؤں کے الارم بنا دوں؟"
                          : "Do you want me to add these medicines to your alarms?"}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void confirmAddAlarms(offer.id, offer.image)}
                          className={`flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-lg font-extrabold text-white shadow-md active:bg-emerald-700 disabled:opacity-40 ${urduFont}`}
                        >
                          ✅ {ur ? "ہاں، بنائیں" : "Yes, add"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => removeMsg(offer.id)}
                          className={`flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-stone-300 bg-white text-lg font-extrabold text-stone-700 active:bg-stone-50 disabled:opacity-40 ${urduFont}`}
                        >
                          {ur ? "نہیں" : "No"}
                        </button>
                      </div>
                    </>
                  ) : offer.status === "adding" ? (
                    <div className="flex items-center gap-3">
                      <span className="flex gap-1" aria-hidden="true">
                        <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-emerald-500 [animation-delay:0ms]" />
                        <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-emerald-500 [animation-delay:150ms]" />
                        <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-emerald-500 [animation-delay:300ms]" />
                      </span>
                      <span className={`text-base font-bold text-emerald-800 ${urduFont}`} dir="auto">
                        {ur ? "نسخہ پڑھ کر الارم بنائے جا رہے ہیں…" : "Reading the prescription and adding alarms…"}
                      </span>
                    </div>
                  ) : offer.status === "done" ? (
                    <div className="space-y-2">
                      <p className={`text-base font-semibold text-emerald-900/80 ${urduFont}`} dir="auto">
                        ⏰ {ur
                          ? "کیا میں ان دواؤں کے الارم بنا دوں؟"
                          : "Do you want me to add these medicines to your alarms?"}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full bg-emerald-600 px-3 py-1 text-sm font-extrabold text-white ${urduFont}`}>
                          {ur ? "ہاں" : "Yes"}
                        </span>
                        <span className={`text-base font-bold text-emerald-800 ${urduFont}`} dir="auto">
                          ✅ {ur
                            ? `${offer.count ?? 0} الارم بن گئے`
                            : `${offer.count ?? 0} alarm${(offer.count ?? 0) === 1 ? "" : "s"} added`}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className={`text-base font-bold text-stone-600 ${urduFont}`} dir="auto">
                      {ur
                        ? "اس تصویر میں کوئی دوا نہیں ملی۔ صاف تصویر بھیجیں۔"
                        : "No medicines found in this image. Please try a clearer photo."}
                    </p>
                  )}
                </div>
              </div>
            );
          }
          return (
            <Link
              key={m.id}
              href="/"
              className={`flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-xl font-extrabold text-white shadow-md transition-transform active:scale-[0.98] ${urduFont}`}
            >
              {ur ? "الارم دیکھیں" : "See my alarms"}
            </Link>
          );
        })}

        {/* Chat-reply skeleton — only visible for the ~1s before the first
            token lands. */}
        {busy && busyLabel ? (
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
      <footer className="border-t border-stone-200 bg-white px-2 pb-2 pt-1">
        {/* Attached photo preview */}
        {attachment ? (
          <div className="mb-2 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={attachment.thumb}
              alt=""
              className="h-14 w-14 shrink-0 rounded-lg border border-emerald-200 object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className={`truncate text-base font-bold text-emerald-900 ${urduFont}`} dir="auto">
                📎 {ur ? "دستاویز منسلک ہے" : "Document attached"}
              </p>
              <p className={`truncate text-sm text-emerald-700/80 ${urduFont}`} dir="auto">
                {ur ? "بھیجنے کے لیے تیر دبائیں" : "Press send to submit"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAttachment(null)}
              aria-label={t("cancel")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-700 text-sm text-white shadow"
            >
              ✕
            </button>
          </div>
        ) : null}
        {attachBusy ? (
          <p className={`mb-2 animate-pulse text-base text-stone-500 ${urduFont}`} dir="auto">
            ⏳ {ur ? "دستاویز تیار ہو رہی ہے…" : "Preparing the document…"}
          </p>
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

          <VoiceRecordButton
            onRecorded={(capture) => void sendVoice(capture)}
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

      {/* Shared capture-or-upload picker. Close it ourselves once a file is
          picked (CaptureOrUpload no longer auto-closes on select). */}
      <CaptureOrUpload
        open={showPicker}
        onClose={() => setShowPicker(false)}
        onFile={(f) => {
          setShowPicker(false);
          void onFile(f);
        }}
      />
    </div>
  );
}
