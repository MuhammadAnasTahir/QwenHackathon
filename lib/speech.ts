// ─────────────────────────────────────────────────────────────────────────────
// Sehat Saathi — browser speech + audio helpers (client only, no React)
//   STT: Web Speech API SpeechRecognition (webkit fallback)
//   TTS: speechSynthesis (Urdu voice if present, ur-PK hint otherwise)
//   Alarm sound: singleton AudioContext + oscillator beep pattern loop
// ─────────────────────────────────────────────────────────────────────────────

import type { Lang } from "@/lib/schema";

// ── Minimal structural types for the (still-prefixed) Web Speech API ─────────

interface SRAlternative {
  transcript: string;
}
interface SRResult {
  isFinal: boolean;
  length: number;
  [index: number]: SRAlternative;
}
interface SRResultList {
  length: number;
  [index: number]: SRResult;
}
interface SREvent {
  resultIndex: number;
  results: SRResultList;
}
interface SRErrorEvent {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SRConstructor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SRConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SRConstructor;
    webkitSpeechRecognition?: SRConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ── Speech-to-text ───────────────────────────────────────────────────────────

let activeRecognition: SpeechRecognitionLike | null = null;

export function sttSupported(): boolean {
  return getRecognitionCtor() !== null;
}

/**
 * Listen once and resolve with the recognised text.
 * Rejects with Error("no-speech") when nothing usable was heard,
 * or with the recognition error name on failure.
 */
export function listen(lang: Lang, onInterim?: (s: string) => void): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      reject(new Error("speech-recognition-unsupported"));
      return;
    }

    // Only one recognition at a time — abort any leftover session.
    if (activeRecognition) {
      try {
        activeRecognition.abort();
      } catch {
        // ignore
      }
      activeRecognition = null;
    }

    const rec = new Ctor();
    rec.lang = lang === "ur" ? "ur-PK" : "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    let finalText = "";
    let interimText = "";
    let settled = false;

    rec.onresult = (e: SREvent) => {
      interimText = "";
      for (let i = 0; i < e.results.length; i++) {
        const result = e.results[i];
        const alt = result[0];
        if (!alt) continue;
        if (result.isFinal) finalText += alt.transcript;
        else interimText += alt.transcript;
      }
      const preview = (finalText + interimText).trim();
      if (preview && onInterim) onInterim(preview);
    };

    rec.onerror = (e: SRErrorEvent) => {
      if (settled) return;
      settled = true;
      activeRecognition = null;
      reject(new Error(e.error || "speech-error"));
    };

    rec.onend = () => {
      if (settled) return;
      settled = true;
      activeRecognition = null;
      const text = (finalText || interimText).trim();
      if (text) resolve(text);
      else reject(new Error("no-speech"));
    };

    activeRecognition = rec;
    try {
      rec.start();
    } catch (err) {
      settled = true;
      activeRecognition = null;
      reject(err instanceof Error ? err : new Error("speech-start-failed"));
    }
  });
}

/** Stop the current recognition; the pending listen() promise settles with whatever was heard. */
export function stopListening(): void {
  if (!activeRecognition) return;
  try {
    activeRecognition.stop();
  } catch {
    // ignore
  }
}

// ── Singleton AudioContext + alarm beeps ─────────────────────────────────────

type AudioContextCtor = new () => AudioContext;

let audioCtx: AudioContext | null = null;
let beepTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Create + resume the singleton AudioContext.
 * Must be called from a user gesture (first tap) so the browser unlocks audio.
 */
export function initAudio(): void {
  if (typeof window === "undefined") return;
  if (!audioCtx) {
    const w = window as unknown as {
      AudioContext?: AudioContextCtor;
      webkitAudioContext?: AudioContextCtor;
    };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return;
    audioCtx = new Ctor();
  }
  if (audioCtx.state === "suspended") {
    void audioCtx.resume().catch(() => {
      // Will resume on the next user gesture.
    });
  }
}

function playBeepGroup(ctx: AudioContext): void {
  // Three short rising beeps — an "attention" pattern.
  const freqs = [880, 1046, 1318];
  freqs.forEach((freq, i) => {
    const t0 = ctx.currentTime + i * 0.28;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.4, t0 + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.26);
  });
}

/**
 * Start the repeating alarm beep pattern (3 rising beeps every ~2s).
 * Safe to call repeatedly; each call restarts the loop.
 */
export function beepPattern(): void {
  if (typeof window === "undefined") return;
  initAudio();
  const ctx = audioCtx;
  if (!ctx) return;
  stopBeeps();
  playBeepGroup(ctx);
  beepTimer = setInterval(() => playBeepGroup(ctx), 2000);
}

/** Stop the alarm beep loop. Safe to call at any time. */
export function stopBeeps(): void {
  if (beepTimer !== null) {
    clearInterval(beepTimer);
    beepTimer = null;
  }
}

// ── Text-to-speech ───────────────────────────────────────────────────────────

let ttsKeepAlive: ReturnType<typeof setInterval> | null = null;

function ttsAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Resolve the voice list, waiting for the async `voiceschanged` event if needed. */
function getVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!ttsAvailable()) return Promise.resolve([]);
  const synth = window.speechSynthesis;
  const immediate = synth.getVoices();
  if (immediate.length > 0) return Promise.resolve(immediate);
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      synth.removeEventListener("voiceschanged", finish);
      resolve(synth.getVoices());
    };
    synth.addEventListener("voiceschanged", finish);
    // Some browsers never fire voiceschanged — don't hang forever.
    setTimeout(finish, 1500);
  });
}

function pickVoice(voices: SpeechSynthesisVoice[], lang: Lang): SpeechSynthesisVoice | null {
  if (lang === "ur") {
    return voices.find((v) => v.lang.toLowerCase().startsWith("ur")) ?? null;
  }
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith("en-")) ??
    voices.find((v) => v.lang.toLowerCase().startsWith("en")) ??
    null
  );
}

/**
 * Speak `text` aloud; resolves when speech finishes (or immediately if TTS
 * is unavailable). Any speech already in progress is cancelled first.
 */
export async function speak(text: string, lang: Lang): Promise<void> {
  if (!ttsAvailable() || !text.trim()) return;
  const synth = window.speechSynthesis;
  synth.cancel();

  const voices = await getVoices();
  const voice = pickVoice(voices, lang);

  const utter = new SpeechSynthesisUtterance(text);
  if (voice) {
    utter.voice = voice;
    utter.lang = voice.lang;
  } else {
    // No matching voice installed — set the lang hint and try anyway.
    utter.lang = lang === "ur" ? "ur-PK" : "en-US";
  }
  utter.rate = 0.95;

  await new Promise<void>((resolve) => {
    const finish = () => {
      if (ttsKeepAlive !== null) {
        clearInterval(ttsKeepAlive);
        ttsKeepAlive = null;
      }
      resolve();
    };
    utter.onend = finish;
    utter.onerror = finish;

    if (ttsKeepAlive !== null) clearInterval(ttsKeepAlive);
    // Chrome silently pauses long utterances after ~15s; nudge it along.
    ttsKeepAlive = setInterval(() => {
      if (synth.speaking && !synth.paused) synth.resume();
      else if (!synth.speaking) finish();
    }, 10000);

    synth.speak(utter);
  });
}

/** Cancel any ongoing speech immediately. */
export function stopSpeaking(): void {
  if (!ttsAvailable()) return;
  if (ttsKeepAlive !== null) {
    clearInterval(ttsKeepAlive);
    ttsKeepAlive = null;
  }
  window.speechSynthesis.cancel();
}

/**
 * Whether an installed TTS voice exists for the language.
 * Async-safe: waits for `voiceschanged` before answering.
 */
export async function hasVoiceFor(lang: Lang): Promise<boolean> {
  const voices = await getVoices();
  const prefix = lang === "ur" ? "ur" : "en";
  return voices.some((v) => v.lang.toLowerCase().startsWith(prefix));
}
