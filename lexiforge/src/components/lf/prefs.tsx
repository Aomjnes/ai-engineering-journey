"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { readStreamValue, setActiveStream, writeStreamValue } from "@/lib/client/storage";
import { ApiError } from "@/lib/client/api";
import { errorText, fmt, getDictionary, LOCALE_COOKIE, type Dict, type Locale } from "@/lib/i18n";
import { useShell } from "./shell-data";

export type Lang = Locale;
export type ThemePref = "light" | "dark";

interface Prefs {
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: ThemePref;
  setTheme: (t: ThemePref) => void;
  /** Picks the explanation in the active language. */
  pick: (en: string, vi: string) => string;
  t: Dict;
  fmt: typeof fmt;
  /** Localized message for any thrown error (API error codes are translated). */
  err: (e: unknown) => string;
}

const PrefsContext = createContext<Prefs | null>(null);

/** Runs before paint (inlined in <head>): applies the last active stream's theme so it never flashes. */
export const THEME_BOOT_SCRIPT = `(function(){try{var s=localStorage.getItem("lexiforge:active-stream");if(!s)return;var t=localStorage.getItem("lexiforge:"+s+":theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

function writeLocaleCookie(l: Lang) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${LOCALE_COOKIE}=${l}; Path=/; SameSite=Lax; Max-Age=${365 * 24 * 3600}${secure}`;
}

/**
 * UI language comes from the `lexiforge_locale` cookie (so /access and /onboarding render in Vietnamese
 * immediately) and is persisted per stream in UserSettings.uiLocale. Theme is per stream in localStorage.
 */
export function PrefsProvider({ children, initialLocale }: { children: React.ReactNode; initialLocale: Lang }) {
  const { status } = useShell();
  const streamId = status?.stream.id ?? null;
  const serverLocale = status?.uiLocale ?? null;
  const [lang, setLangState] = useState<Lang>(initialLocale);
  const [theme, setThemeState] = useState<ThemePref>("light");

  useEffect(() => {
    if (!streamId) return;
    setActiveStream(streamId);
    const t = readStreamValue(streamId, "theme");
    const next: ThemePref = t === "light" || t === "dark" ? t : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setThemeState(next);
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
  }, [streamId]);

  // The stream's saved language wins over this device's cookie (cross-device consistency).
  useEffect(() => {
    if (!streamId || !status) return;
    if (!serverLocale) {
      // First visit of this stream: save the language chosen on /access for every device.
      void fetch("/api/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uiLocale: lang }), credentials: "same-origin" });
      return;
    }
    setLangState(serverLocale);
    writeLocaleCookie(serverLocale);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the server value, not local toggles
  }, [serverLocale, streamId]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback(
    (l: Lang) => {
      setLangState(l);
      writeLocaleCookie(l);
      if (streamId) void fetch("/api/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uiLocale: l }), credentials: "same-origin" });
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
  const value = useMemo<Prefs>(() => {
    const t = getDictionary(lang);
    return {
      lang,
      setLang,
      theme,
      setTheme,
      pick: (en: string, vi: string) => (lang === "vi" && vi ? vi : en),
      t,
      fmt,
      err: (e: unknown) => {
        if (e instanceof ApiError) {
          const wait = (e.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
          if (e.code === "LLM_RATE_LIMIT" && typeof wait === "number") return fmt(t.errors.LLM_RATE_LIMIT_WAIT, { n: wait });
          return errorText(t, e.code, e.message);
        }
        return e instanceof Error ? e.message : String(e);
      },
    };
  }, [lang, setLang, theme, setTheme]);

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Prefs {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs must be used inside PrefsProvider");
  return ctx;
}

/** Dictionary + formatter for the active UI language. */
export const useI18n = usePrefs;
