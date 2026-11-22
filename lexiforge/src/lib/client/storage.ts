"use client";

/**
 * Stream-namespaced localStorage: every key is `lexiforge:${streamId}:${name}` so switching streams on the
 * same device never leaks drafts or UI state. All access is wrapped (private mode / blocked storage).
 */
const ACTIVE = "lexiforge:active-stream";

export function streamKey(streamId: string, name: string): string {
  return `lexiforge:${streamId}:${name}`;
}

export function readStreamValue(streamId: string | null | undefined, name: string): string | null {
  if (!streamId) return null;
  try {
    return window.localStorage.getItem(streamKey(streamId, name));
  } catch {
    return null;
  }
}

export function writeStreamValue(streamId: string | null | undefined, name: string, value: string): void {
  if (!streamId) return;
  try {
    window.localStorage.setItem(streamKey(streamId, name), value);
  } catch {
    /* storage unavailable: the value lives for this page only */
  }
}

/** Pointer used by the pre-paint theme script (which cannot read the HttpOnly session cookie). */
export function setActiveStream(streamId: string | null): void {
  try {
    if (streamId) window.localStorage.setItem(ACTIVE, streamId);
    else window.localStorage.removeItem(ACTIVE);
  } catch {
    /* ignore */
  }
}
