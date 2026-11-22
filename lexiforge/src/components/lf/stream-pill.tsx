"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, Check, ChevronDown, RefreshCw, RotateCcw } from "lucide-react";
import { fmt, timeAgoIn } from "@/lib/i18n";
import { usePrefs } from "./prefs";
import { cn } from "@/lib/utils";
import { useShell } from "./shell-data";

/** Current stream (label + code) with last cross-device pull time and a Switch Stream action. */
export function StreamPill() {
  const { status, lastPulledAt, refresh, switchStream } = useShell();
  const { t } = usePrefs();
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 15_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!status) return <span className="h-8 w-24 rounded-full bg-surface" aria-hidden />;
  const { stream } = status;
  const pulled = lastPulledAt ? timeAgoIn(t, new Date(lastPulledAt)) : "—";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title={`${stream.label} · ${fmt(t.shell.syncedDevice, { ago: pulled })}`}
        className="flex h-8 max-w-[11rem] items-center gap-1.5 rounded-full border border-line bg-card px-2.5 text-[12.5px] text-ink-2 hover:border-line-strong hover:text-ink"
      >
        <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
        <span className="truncate font-medium text-ink">{stream.label}</span>
        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform duration-200 ease-lf", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="animate-in absolute left-0 top-10 z-50 w-64 rounded-lg border border-line bg-card p-1.5 shadow-lift">
          <div className="px-2.5 pb-2 pt-1.5">
            <p className="text-[13.5px] font-semibold text-ink">{stream.label}</p>
            <p className="text-[12px] text-ink-3">
              {t.shell.accessCode} <span className="num text-ink-2">{stream.code}</span> · <span className="tabular-nums">{fmt(t.shell.syncedDevice, { ago: pulled })}</span>
            </p>
          </div>
          <button type="button" role="menuitem" onClick={() => void refresh().then(() => window.dispatchEvent(new CustomEvent("lf:resync")))} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-ink-2 hover:bg-surface hover:text-ink">
            <RefreshCw className="size-3.5" aria-hidden /> {t.shell.syncDevice}
          </button>
          <Link role="menuitem" href="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] text-ink-2 hover:bg-surface hover:text-ink">
            <Check className="size-3.5" aria-hidden /> {t.shell.renameStream}
          </Link>
          <button type="button" role="menuitem" onClick={() => void switchStream()} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-ink-2 hover:bg-surface hover:text-ink">
            <ArrowLeftRight className="size-3.5" aria-hidden /> {t.shell.switchStream}
          </button>
          <Link role="menuitem" href="/settings#reset" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-md border-t border-line px-2.5 py-2 text-[12.5px] text-ink-3 hover:bg-surface hover:text-critical-ink">
            <RotateCcw className="size-3.5" aria-hidden /> {t.reset.menu}
          </Link>
        </div>
      )}
    </div>
  );
}
