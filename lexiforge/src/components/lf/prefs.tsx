"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

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

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: preference lasts for this page only */
  }
}

/** Runs before paint (inlined in <head>) so the stored theme never flashes. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("lf-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  const [theme, setThemeState] = useState<ThemePref>("light");

  useEffect(() => {
    const l = read("lf-lang");
    if (l === "en" || l === "vi") setLangState(l);
    const t = read("lf-theme");
    if (t === "light" || t === "dark") setThemeState(t);
    else setThemeState(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    write("lf-lang", l);
  }, []);
  const setTheme = useCallback((t: ThemePref) => {
    setThemeState(t);
    write("lf-theme", t);
    document.documentElement.setAttribute("data-theme", t);
  }, []);
  const pick = useCallback((en: string, vi: string) => (lang === "vi" && vi ? vi : en), [lang]);

  return <PrefsContext.Provider value={{ lang, setLang, theme, setTheme, pick }}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Prefs {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs must be used inside PrefsProvider");
  return ctx;
}
