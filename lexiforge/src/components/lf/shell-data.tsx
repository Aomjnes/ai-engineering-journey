"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/client/api";

export interface ShellStatus {
  calibrated: boolean;
  subBand: string | null;
  ielts: { band: number; low: number; high: number } | null;
  dueCards: number;
  lastSyncedAt: string | null;
  failingFeeds: number;
  llm: string | null;
  activeLessonId: string | null;
}

interface ShellCtx {
  status: ShellStatus | null;
  refresh: () => Promise<void>;
  syncing: boolean;
  sync: () => Promise<{ stored: number; failed: string[] } | null>;
  syncError: string | null;
}

const Ctx = createContext<ShellCtx | null>(null);

export function ShellDataProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ShellStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await api<ShellStatus>("/api/shell"));
    } catch {
      /* shell status is best-effort; pages surface their own errors */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  const sync = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const r = await api<{ stored: number; feeds: Array<{ feed: string; ok: boolean }> }>("/api/ingest", {});
      await refresh();
      window.dispatchEvent(new CustomEvent("lf:synced"));
      return { stored: r.stored, failed: r.feeds.filter((f) => !f.ok).map((f) => f.feed) };
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  return <Ctx.Provider value={{ status, refresh, syncing, sync, syncError }}>{children}</Ctx.Provider>;
}

export function useShell(): ShellCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useShell must be used inside ShellDataProvider");
  return ctx;
}
