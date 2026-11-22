import { signSession, STREAM_COOKIE } from "@/lib/auth/session";

export const TEST_SECRET = "test-session-secret-0123456789abcdef0123456789";

export async function cookieFor(stream: { id: string; code: string }, ttlSeconds = 3600): Promise<string> {
  const token = await signSession({ sid: stream.id, code: stream.code, exp: Math.floor(Date.now() / 1000) + ttlSeconds }, TEST_SECRET);
  return `${STREAM_COOKIE}=${token}`;
}

export function req(url: string, init: { method?: string; cookie?: string; body?: unknown; headers?: Record<string, string> } = {}): Request {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.cookie) headers.cookie = init.cookie;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://localhost:3000${url}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers,
    body: init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
  });
}
