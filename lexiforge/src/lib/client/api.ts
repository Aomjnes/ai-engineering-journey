"use client";

/** Fired when every AI provider is cooling down; the app shell shows a live countdown. */
export const RATE_LIMIT_EVENT = "lf:ratelimit";

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) {
    super(message);
  }
}

export async function api<T>(url: string, body?: unknown, opts?: { method?: "GET" | "POST" | "PATCH" | "PUT"; body?: unknown }): Promise<T> {
  const payload = opts?.body ?? body;
  const res = await fetch(url, {
    method: opts?.method ?? (payload === undefined ? "GET" : "POST"),
    headers: payload === undefined ? undefined : { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    cache: "no-store",
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => null)) as unknown;
  if (res.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/access")) {
    window.location.assign(`/access?next=${encodeURIComponent(window.location.pathname)}`);
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    if (res.status === 429 && err?.code === "LLM_RATE_LIMIT" && typeof window !== "undefined") {
      const secs = Number((err.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds ?? res.headers.get("retry-after") ?? 60);
      window.dispatchEvent(new CustomEvent(RATE_LIMIT_EVENT, { detail: { until: Date.now() + Math.max(1, secs) * 1000 } }));
    }
    throw new ApiError(res.status, err?.code ?? "HTTP_ERROR", err?.message ?? `Request failed (${res.status}).`, err?.details);
  }
  return data as T;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
