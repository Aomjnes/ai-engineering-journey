/**
 * Stateless stream session tokens: base64url(JSON payload) + "." + base64url(HMAC-SHA256).
 * Web Crypto only (no node: imports) so the same code runs in Edge middleware and Node route handlers.
 */

export const STREAM_COOKIE = "lexiforge_stream";
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface SessionPayload {
  sid: string; // StreamAccount.id
  code: string; // access code at issue time (re-checked against ALLOWED_STREAM_CODES)
  exp: number; // unix seconds
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${b64url(await hmac(secret, body))}`;
}

/** Returns the payload only for an untampered, unexpired token. */
export async function verifySession(token: string | null | undefined, secret: string, nowMs = Date.now()): Promise<SessionPayload | null> {
  if (!token || token.length > 1024) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const given = fromB64url(sig);
  if (!given || !constantTimeEqual(given, await hmac(secret, body))) return null;
  const raw = fromB64url(body);
  if (!raw) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(raw)) as Partial<SessionPayload>;
    if (typeof p.sid !== "string" || typeof p.code !== "string" || typeof p.exp !== "number") return null;
    if (p.exp * 1000 <= nowMs) return null;
    return { sid: p.sid, code: p.code, exp: p.exp };
  } catch {
    return null;
  }
}

/** Reads one cookie from a Cookie header. */
export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function sessionCookie(token: string, secure: boolean): string {
  return [`${STREAM_COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${SESSION_TTL_SECONDS}`, secure ? "Secure" : ""].filter(Boolean).join("; ");
}

export function clearSessionCookie(secure: boolean): string {
  return [`${STREAM_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0", secure ? "Secure" : ""].filter(Boolean).join("; ");
}
