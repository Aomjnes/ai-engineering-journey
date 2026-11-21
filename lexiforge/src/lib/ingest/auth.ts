import { timingSafeEqual } from "node:crypto";

/** Constant-time bearer check for the cron endpoint. Missing secret ⇒ endpoint disabled. */
export function verifyCronSecret(header: string | null, secret: string | undefined): "ok" | "unconfigured" | "denied" {
  if (!secret) return "unconfigured";
  const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b) ? "ok" : "denied";
}

/** Same-origin check for browser-triggered actions (manual sync). */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") === "same-origin";
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}
