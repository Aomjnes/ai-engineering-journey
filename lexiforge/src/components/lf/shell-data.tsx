"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { api, ApiError } from "@/lib/client/api";

export interface ShellStatus {
  calibrated: boolean;
  subBand: string | null;
  ielts: { band: number; low: number; high: number } | null;
  dueCards: number;
  lastSyncedAt: string | null;
  failingFeeds: number;
  llm: string | null;
  activeLessonId: string | null;
  stream: { id: string; code: string; label: string };
  /** null until the stream has saved a language (the device cookie is then adopted). */
  uiLocale: "vi" | "en" | null;
  beginner: boolean;
  serverTime: string;
}

interface ShellCtx {
  status: ShellStatus | null;
  refresh: () => Promise<void>;
  /** When this device last pulled fresh stream state from the server. */
  lastPulledAt: number | null;
  syncing: boolean;
  sync: () => Promise<{ stored: number; failed: string[] } | null>;
  syncError: string | null;
  switchStream: () => Promise<void>;
}

const Ctx = createContext<ShellCtx | null>(null);

/** Event fired whenever the device should re-read stream state (focus, tab visible, manual sync). */
export const RESYNC_EVENT = "lf:resync";

export function ShellDataProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const onAccess = pathname.startsWith("/access");
  const [status, setStatus] = useState<ShellStatus | null>(null);
  const [lastPulledAt, setLastPulledAt] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const lastResync = useRef(0);

  const refresh = useCallback(async () => {
    if (onAccess) return;
    try {
      setStatus(await api<ShellStatus>("/api/shell"));
      setLastPulledAt(Date.now());
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) window.location.assign(`/access?next=${encodeURIComponent(window.location.pathname)}`);
    }
  }, [onAccess]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  // Cross-device sync: whenever this tab regains focus or becomes visible, pull fresh state everywhere.
  useEffect(() => {
    if (onAccess) return;
    const trigger = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastResync.current < 2000) return; // focus + visibilitychange fire together
      lastResync.current = now;
      void refresh();
      window.dispatchEvent(new CustomEvent(RESYNC_EVENT));
    };
    document.addEventListener("visibilitychange", trigger);
    window.addEventListener("focus", trigger);
    return () => {
      document.removeEventListener("visibilitychange", trigger);
      window.removeEventListener("focus", trigger);
    };
  }, [refresh, onAccess]);

  const sync = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const r = await api<{ stored: number; feeds: Array<{ feed: string; ok: boolean }> }>("/api/cron/ingest", {});
      await refresh();
      window.dispatchEvent(new CustomEvent(RESYNC_EVENT));
      return { stored: r.stored, failed: r.feeds.filter((f) => !f.ok).map((f) => f.feed) };
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  const switchStream = useCallback(async () => {
    await fetch("/api/stream/logout", { method: "POST" });
    window.location.assign("/access");
  }, []);

  return <Ctx.Provider value={{ status, refresh, lastPulledAt, syncing, sync, syncError, switchStream }}>{children}</Ctx.Provider>;
}

export function useShell(): ShellCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useShell must be used inside ShellDataProvider");
  return ctx;
}

/** Re-runs `load` when the device regains focus / visibility (cross-device sync). */
export function useCrossDeviceSync(load: () => unknown): void {
  const ref = useRef(load);
  ref.current = load;
  useEffect(() => {
    const on = () => void ref.current();
    window.addEventListener(RESYNC_EVENT, on);
    return () => window.removeEventListener(RESYNC_EVENT, on);
  }, []);
}
