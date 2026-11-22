/** Locale primitives shared by server and client (no React, no Prisma). */
export const LOCALES = ["vi", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "vi";
export const LOCALE_COOKIE = "lexiforge_locale";

export function isLocale(v: unknown): v is Locale {
  return v === "vi" || v === "en";
}

export function localeFromCookieHeader(header: string | null | undefined): Locale {
  const m = /(?:^|;\s*)lexiforge_locale=(vi|en)\b/.exec(header ?? "");
  return m ? (m[1] as Locale) : DEFAULT_LOCALE;
}

/** Non-HttpOnly so the client can switch instantly; 1 year. */
export function localeCookie(locale: Locale, secure: boolean): string {
  return [`${LOCALE_COOKIE}=${locale}`, "Path=/", "SameSite=Lax", `Max-Age=${365 * 24 * 3600}`, secure ? "Secure" : ""].filter(Boolean).join("; ");
}
