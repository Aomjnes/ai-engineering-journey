"use client";

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
    throw new ApiError(res.status, err?.code ?? "HTTP_ERROR", err?.message ?? `Request failed (${res.status}).`, err?.details);
  }
  return data as T;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
