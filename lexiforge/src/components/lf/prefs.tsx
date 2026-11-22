"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { readStreamValue, setActiveStream, writeStreamValue } from "@/lib/client/storage";
import { useShell } from "./shell-data";

export type Lang = "en" | "vi";
export type ThemePref = "light" | "dark";

interface Prefs {
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: ThemePref;
  setTheme: (t: ThemePref) => void;
  /** Picks the explanation in the active language. */
  pick: (en: string, vi: string) => string;
}

const PrefsContext = createContext<Prefs | null>(null);

/** Runs before paint (inlined in <head>): applies the last active stream's theme so it never flashes. */
export const THEME_BOOT_SCRIPT = `(function(){try{var s=localStorage.getItem("lexiforge:active-stream");if(!s)return;var t=localStorage.getItem("lexiforge:"+s+":theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

/** Preferences are per stream: keys are namespaced `lexiforge:${streamId}:…`. */
export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const streamId = useShell().status?.stream.id ?? null;
  const [lang, setLangState] = useState<Lang>("en");
  const [theme, setThemeState] = useState<ThemePref>("light");

  useEffect(() => {
    if (!streamId) return;
    setActiveStream(streamId);
    const l = readStreamValue(streamId, "lang");
    setLangState(l === "vi" ? "vi" : "en");
    const t = readStreamValue(streamId, "theme");
    const next: ThemePref = t === "light" || t === "dark" ? t : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setThemeState(next);
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
  }, [streamId]);

  const setLang = useCallback(
    (l: Lang) => {
      setLangState(l);
      writeStreamValue(streamId, "lang", l);
    },
    [streamId],
  );
  const setTheme = useCallback(
    (t: ThemePref) => {
      setThemeState(t);
      writeStreamValue(streamId, "theme", t);
      document.documentElement.setAttribute("data-theme", t);
    },
    [streamId],
  );
  const pick = useCallback((en: string, vi: string) => (lang === "vi" && vi ? vi : en), [lang]);

  return <PrefsContext.Provider value={{ lang, setLang, theme, setTheme, pick }}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Prefs {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs must be used inside PrefsProvider");
  return ctx;
}
