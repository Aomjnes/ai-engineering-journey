/** i18n helpers shared by server and client. */
import { en } from "./en";
import { vi } from "./vi";
import type { Dict } from "./types";
import { DEFAULT_LOCALE, type Locale } from "./locale";

export type { Dict } from "./types";
export * from "./locale";

const DICTS: Record<Locale, Dict> = { en, vi };

export function getDictionary(locale: Locale = DEFAULT_LOCALE): Dict {
  return DICTS[locale] ?? DICTS[DEFAULT_LOCALE];
}

/** Fills `{name}` placeholders. Missing values are left visible so they are caught in review. */
export function fmt(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Localized message for an API error code, falling back to the server's message. */
export function errorText(t: Dict, code: string | undefined, fallback: string): string {
  const table = t.errors as Record<string, string>;
  return (code && table[code]) || fallback;
}

/** Relative time in the active locale. */
export function timeAgoIn(t: Dict, iso: string | Date | null, now = Date.now()): string {
  if (!iso) return t.common.never;
  const ts = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return t.common.justNow;
  const m = Math.round(s / 60);
  if (m < 60) return fmt(t.common.minutesAgo, { n: m });
  const h = Math.round(m / 60);
  if (h < 48) return fmt(t.common.hoursAgo, { n: h });
  return fmt(t.common.daysAgo, { n: Math.round(h / 24) });
}

/** Localized label for an error subtype code, e.g. ARTICLE_OMISSION. */
export function subtypeLabel(t: Dict, subtype: string): string {
  const table = t.subtype as Record<string, string>;
  if (table[subtype]) return table[subtype] as string;
  const s = subtype.toLowerCase().replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Localized band label: "B1.2 · Trung cấp 2". */
export function bandName(t: Dict, code: string): string {
  return (t.bands as Record<string, string>)[code] ?? code;
}

/** "B1.2" / "Pre-A1" → "B1_2" / "PRE_A1". */
export function bandKey(label: string): string {
  return label === "Pre-A1" ? "PRE_A1" : label.replace(".", "_");
}

/** "B1_2" → "B1.2", "PRE_A1" → "Pre-A1". */
export function bandShort(code: string): string {
  return code === "PRE_A1" ? "Pre-A1" : code.replace("_", ".");
}

/** IELTS band for display: Pre-A1's floor (2.5) is shown as "< 3.0". */
export function ieltsText(band: number): string {
  return band < 3 ? "< 3.0" : band.toFixed(1);
}
