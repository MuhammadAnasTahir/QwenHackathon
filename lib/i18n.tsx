"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Sehat Saathi — language context (Urdu-first, persisted, RTL-aware)
// ─────────────────────────────────────────────────────────────────────────────

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { LS_LANG, type Lang } from "@/lib/schema";
import { translations, type TKey } from "@/lib/translations";

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: TKey) => string;
  dir: "rtl" | "ltr";
}

const LangContext = createContext<LangContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Default is Urdu; the stored preference is applied after mount so that the
  // server-rendered HTML and the first client render always match.
  const [lang, setLangState] = useState<Lang>("ur");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LS_LANG);
      if (stored === "ur" || stored === "en") setLangState(stored);
    } catch {
      // localStorage unavailable (private mode) — keep the default.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ur" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(LS_LANG, l);
    } catch {
      // Persistence is best-effort.
    }
  }, []);

  const t = useCallback((k: TKey): string => translations[k][lang], [lang]);

  const value = useMemo<LangContextValue>(
    () => ({
      lang,
      setLang,
      t,
      dir: lang === "ur" ? "rtl" : "ltr",
    }),
    [lang, setLang, t]
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) {
    throw new Error("useLang must be used inside <LanguageProvider>");
  }
  return ctx;
}
