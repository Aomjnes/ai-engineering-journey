/** Relative time like "4h ago" (deterministic given `now`). */
export function timeAgo(iso: string | Date | null, now = Date.now()): string {
  if (!iso) return "never";
  const t = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function signed(n: number, digits = 1): string {
  const v = n.toFixed(digits);
  return n > 0 ? `+${v}` : v;
}

/** "ARTICLE_OMISSION" → "Article omission". */
const SPECIAL: Record<string, string> = { SV_AGREEMENT: "Subject–verb agreement", VIETLISH_CALQUE: "Vietlish calque", OFF_PROMPT: "Off-prompt" };

export function humanize(subtype: string): string {
  if (SPECIAL[subtype]) return SPECIAL[subtype];
  const s = subtype.toLowerCase().replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
