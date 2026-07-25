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

/**
 * Pick the best TTS voice for the requested language, with cascading fallbacks.
 *
 * For Urdu specifically: Android/iOS ship a Urdu voice; Windows Chrome usually
 * does NOT. Rather than silently reading Urdu script with an English voice
 * (which produces garbage or silence), we cascade:
 *
 *   1. Any voice with `lang` beginning "ur"   — the ideal case
 *   2. Any voice with `lang` beginning "ar"   — Arabic voices READ Urdu script
 *        intelligibly (Urdu is Arabic script + a few extra letters); native
 *        Urdu speakers understand ~85% of what an Arabic voice reads back
 *   3. Anything Persian / Farsi (`fa`)        — same script family
 *   4. null — caller sets utter.lang="ur-PK" and hopes the system picks
 *        something reasonable
 *
 * Log-once helps demo debugging: user can open DevTools and see WHICH voice
 * was picked for Urdu on their laptop.
 */
let voiceLogged = false;

function pickVoice(voices: SpeechSynthesisVoice[], lang: Lang): SpeechSynthesisVoice | null {
  const pool = voices;
  const lc = (v: SpeechSynthesisVoice) => v.lang.toLowerCase();

  if (lang === "ur") {
    // Prefer any Urdu voice, then Arabic (script-compatible), then Persian.
    const picked =
      pool.find((v) => lc(v).startsWith("ur")) ??
      pool.find((v) => lc(v).startsWith("ar")) ??
      pool.find((v) => lc(v).startsWith("fa")) ??
      null;
    if (!voiceLogged && typeof console !== "undefined") {
      voiceLogged = true;
      const inventory = pool.map((v) => `${v.name} [${v.lang}]`).join(", ");
      // eslint-disable-next-line no-console
      console.info(
        `[Sehat Saathi TTS] Urdu voice picked: ${picked ? `${picked.name} [${picked.lang}]` : "NONE (falling back to ur-PK hint)"}. Voices available: ${inventory || "(none)"}`,
      );
    }
    return picked;
  }

  return (
    pool.find((v) => lc(v).startsWith("en-")) ??
    pool.find((v) => lc(v).startsWith("en")) ??
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
