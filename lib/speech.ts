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

// Generous grace period to start speaking after the mic opens (cold mic +
// slow phones need this), then a tighter cutoff once the user is heard —
// so a single tap doesn't die from Chrome's own aggressive default cutoff.
const INITIAL_GRACE_MS = 6000;
const TRAILING_SILENCE_MS = 1800;
const MAX_DURATION_MS = 20000;

/**
 * Explicitly prompt for (or confirm) microphone access before starting
 * recognition. SpeechRecognition's own built-in permission handling is
 * flaky on some Android/Chrome builds — probing via getUserMedia first
 * gives us a clean, early "mic-permission-denied" instead of a silent
 * failure inside the recognizer.
 */
async function ensureMicPermission(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
  } catch {
    throw new Error("mic-permission-denied");
  }
}

/**
 * Listen once and resolve with the recognised text.
 * Rejects with Error("no-speech") when nothing usable was heard, or with
 * the recognition error code on failure (see MicButton for how codes map
 * to user-facing messages).
 *
 * ur-PK is not a reliably supported recognition locale on every device —
 * if it fails immediately (before anything was heard), we silently retry
 * once in en-US rather than surfacing a dead mic to the user.
 */
export async function listen(lang: Lang, onInterim?: (s: string) => void): Promise<string> {
  await ensureMicPermission();

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

    const fallbackLang = "en-US";

    const attempt = (recLang: string, allowFallback: boolean) => {
      const rec = new Ctor();
      rec.lang = recLang;
      rec.interimResults = true;
      rec.continuous = true;
      rec.maxAlternatives = 1;

      let finalText = "";
      let interimText = "";
      let settled = false;
      let heardAnything = false;
      const startedAt = Date.now();

      let silenceTimer: ReturnType<typeof setTimeout> | null = null;
      let maxTimer: ReturnType<typeof setTimeout> | null = null;

      const clearTimers = () => {
        if (silenceTimer !== null) {
          clearTimeout(silenceTimer);
          silenceTimer = null;
        }
        if (maxTimer !== null) {
          clearTimeout(maxTimer);
          maxTimer = null;
        }
      };

      const armSilenceTimer = (ms: number) => {
        if (silenceTimer !== null) clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
          try {
            rec.stop();
          } catch {
            // ignore
          }
        }, ms);
      };

      const finishOk = (text: string) => {
        if (settled) return;
        settled = true;
        clearTimers();
        activeRecognition = null;
        resolve(text);
      };

      const finishErr = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimers();
        activeRecognition = null;
        reject(err);
      };

      rec.onresult = (e: SREvent) => {
        heardAnything = true;
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
        armSilenceTimer(TRAILING_SILENCE_MS);
      };

      rec.onerror = (e: SRErrorEvent) => {
        const code = e.error || "speech-error";
        const fastFail = !heardAnything && Date.now() - startedAt < 1200;
        const languageIssue = code === "language-not-supported" || code === "network";
        if (allowFallback && fastFail && languageIssue) {
          // The requested locale isn't usable on this device — retry once
          // in en-US instead of leaving the user with a dead mic.
          clearTimers();
          try {
            rec.abort();
          } catch {
            // ignore
          }
          attempt(fallbackLang, false);
          return;
        }
        finishErr(new Error(code));
      };

      rec.onend = () => {
        const text = (finalText || interimText).trim();
        if (text) finishOk(text);
        else finishErr(new Error("no-speech"));
      };

      activeRecognition = rec;
      try {
        rec.start();
        maxTimer = setTimeout(() => {
          try {
            rec.stop();
          } catch {
            // ignore
          }
        }, MAX_DURATION_MS);
        armSilenceTimer(INITIAL_GRACE_MS);
      } catch (err) {
        finishErr(err instanceof Error ? err : new Error("speech-start-failed"));
      }
    };

    attempt(lang === "ur" ? "ur-PK" : "en-US", lang === "ur");
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

function playBeep(ctx: AudioContext): void {
  // A single plain tone — not a repeating pattern that has to run for the
  // whole ring duration, just a short "something needs attention" cue.
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(1000, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.4, t0 + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + 0.37);
}

let beepStopTimer: ReturnType<typeof setTimeout> | null = null;
const BEEP_TONE_DURATION_MS = 4500;
const BEEP_TONE_INTERVAL_MS = 700;

/**
 * Play a simple beep tone for ~4.5s, then stop on its own — it's just an
 * initial attention cue, not a sound meant to run under the whole alarm
 * (a beep looping for the entire ring duration is what made it painful).
 * Safe to call repeatedly; each call restarts the tone from the top.
 */
export function beepPattern(): void {
  if (typeof window === "undefined") return;
  initAudio();
  const ctx = audioCtx;
  if (!ctx) return;
  stopBeeps();
  playBeep(ctx);
  beepTimer = setInterval(() => playBeep(ctx), BEEP_TONE_INTERVAL_MS);
  beepStopTimer = setTimeout(stopBeeps, BEEP_TONE_DURATION_MS);
}

/** Stop the alarm beep tone. Safe to call at any time. */
export function stopBeeps(): void {
  if (beepTimer !== null) {
    clearInterval(beepTimer);
    beepTimer = null;
  }
  if (beepStopTimer !== null) {
    clearTimeout(beepStopTimer);
    beepStopTimer = null;
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
 * Speak `text` through the browser's built-in speechSynthesis; resolves when
 * speech finishes (or immediately if TTS is unavailable). This is the
 * fallback engine — see `speak()` below for the Google-TTS-first version
 * actually used by alarms.
 */
async function speakViaBrowser(text: string, lang: Lang): Promise<void> {
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

// ── Google Cloud TTS (primary engine, via /api/tts) ──────────────────────────
//
// Browser speechSynthesis has no reliable Urdu voice on most devices — the
// Google voice sounds like actual Urdu, so it's the primary path. The
// response audio is cached per (lang, text) since an alarm repeats the same
// announcement several times, and there's no reason to re-fetch (or re-bill)
// identical audio each time.

const ttsAudioCache = new Map<string, Promise<Blob>>();
let currentAudio: HTMLAudioElement | null = null;
let currentAudioSettle: (() => void) | null = null;

function fetchGoogleTtsAudio(text: string, lang: Lang): Promise<Blob> {
  const key = `${lang}:${text}`;
  const cached = ttsAudioCache.get(key);
  if (cached) return cached;

  const pending = fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, lang }),
  }).then((res) => {
    if (!res.ok) throw new Error(`tts-http-${res.status}`);
    return res.blob();
  });
  ttsAudioCache.set(key, pending);
  pending.catch(() => ttsAudioCache.delete(key)); // don't cache failures
  return pending;
}

async function speakViaGoogleTts(text: string, lang: Lang): Promise<void> {
  const blob = await fetchGoogleTtsAudio(text, lang);
  const url = URL.createObjectURL(blob);
  await new Promise<void>((resolve, reject) => {
    const audio = new Audio(url);
    currentAudio = audio;
    let settled = false;
    const finish = (ok: boolean, err?: unknown) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      currentAudioSettle = null;
      if (ok) resolve();
      else reject(err instanceof Error ? err : new Error("tts-playback-failed"));
    };
    currentAudioSettle = () => finish(true);
    audio.onended = () => finish(true);
    audio.onerror = () => finish(false, new Error("tts-playback-failed"));
    audio.play().catch((err) => finish(false, err));
  });
}

/**
 * Speak `text` aloud for `lang`, preferring Google Cloud TTS (proper Urdu
 * voice quality) and falling back to the browser's speechSynthesis if
 * Google TTS is unavailable (no API key configured, offline, upstream
 * error) — using `fallbackText` for that fallback if given, e.g. a Roman
 * Urdu transliteration that reads better through an English voice than
 * Nastaliq Urdu script does. Resolves when speech finishes.
 */
export async function speak(text: string, lang: Lang, fallbackText?: string): Promise<void> {
  if (!text.trim()) return;
  stopSpeaking();
  try {
    await speakViaGoogleTts(text, lang);
    return;
  } catch {
    // Fall through to the browser engine below.
  }
  if (fallbackText) {
    // fallbackText is a Roman Urdu transliteration (Latin script) meant to
    // be read by an English voice — feeding it to an "ur" voice makes the
    // engine try to pronounce Latin letters phonetically in Urdu, which
    // comes out as garbled noise, not speech.
    await speakViaBrowser(fallbackText, "en");
  } else {
    await speakViaBrowser(text, lang);
  }
}

/** Cancel any ongoing speech immediately (either engine). */
export function stopSpeaking(): void {
  if (currentAudio) {
    try {
      currentAudio.pause();
    } catch {
      /* ignore */
    }
    currentAudio = null;
  }
  if (currentAudioSettle) {
    currentAudioSettle();
    currentAudioSettle = null;
  }
  if (!ttsAvailable()) return;
  if (ttsKeepAlive !== null) {
    clearInterval(ttsKeepAlive);
    ttsKeepAlive = null;
  }
  window.speechSynthesis.cancel();
}
