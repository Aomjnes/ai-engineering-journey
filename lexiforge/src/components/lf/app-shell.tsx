"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ChevronsLeft, ChevronsRight, Dumbbell, Keyboard, Map as MapIcon, Moon, Settings, Skull, Sun, Sunrise, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt, timeAgoIn, type Dict } from "@/lib/i18n";
import { LangSwitch } from "./lang-switch";
import { RateLimitBanner } from "./rate-limit-banner";
import { Kbd } from "@/components/ui/kbd";
import { usePrefs } from "./prefs";
import { useShell } from "./shell-data";
import { ProficiencyPill } from "./proficiency-pill";
import { StreamPill } from "./stream-pill";
import { readStreamValue, writeStreamValue } from "@/lib/client/storage";

function navItems(t: Dict) {
  return [
    { key: "today", href: "/", label: t.nav.today, short: t.nav.today, icon: Sunrise, match: (p: string) => p === "/" || p.startsWith("/lesson") || p.startsWith("/workspace") },
    { key: "roadmap", href: "/roadmap", label: t.nav.roadmap, short: t.nav.roadmap, icon: MapIcon, match: (p: string) => p.startsWith("/roadmap") },
    { key: "practice", href: "/practice", label: t.nav.practice, short: t.nav.practice, icon: Dumbbell, match: (p: string) => p.startsWith("/practice") },
    { key: "graveyard", href: "/graveyard", label: t.nav.graveyard, short: t.nav.graveyardShort, icon: Skull, match: (p: string) => p.startsWith("/graveyard") },
    { key: "metrics", href: "/metrics", label: t.nav.metrics, short: t.nav.metrics, icon: BarChart3, match: (p: string) => p.startsWith("/metrics") || p.startsWith("/promotion") },
  ];
}


function SyncDot() {
  const { status, syncing, sync, syncError } = useShell();
  const { t } = usePrefs();
  const [note, setNote] = useState<string | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  const last = status?.lastSyncedAt ?? null;
  const stale = !last || Date.now() - new Date(last).getTime() > 26 * 3_600_000;
  const color = syncing ? "bg-accent pulse-dot" : syncError || (status?.failingFeeds ?? 0) > 0 ? "bg-moderate" : stale ? "bg-ink-3" : "bg-mastered";
  const label = syncing ? t.shell.syncing : last ? fmt(t.shell.synced, { ago: timeAgoIn(t, last) }) : t.shell.neverSynced;
  return (
    <span className="relative">
      <button
        type="button"
        onClick={async () => {
          const r = await sync();
          setNote(r ? `${fmt(t.shell.syncResult, { n: r.stored })}${r.failed.length ? ` · ${fmt(t.shell.syncUnreachable, { n: r.failed.length })}` : ""}` : null);
          setTimeout(() => setNote(null), 6000);
        }}
        disabled={syncing}
        title={`${label}${(status?.failingFeeds ?? 0) > 0 ? ` · ${fmt(t.shell.failingSources, { n: status?.failingFeeds ?? 0 })}` : ""} — ${t.shell.syncNow}`}
        aria-label={`${label}. ${t.shell.syncNow}`}
        className="flex h-8 items-center gap-2 rounded-full px-2.5 text-[12.5px] text-ink-2 hover:bg-surface hover:text-ink"
      >
        <span className={cn("size-2 rounded-full", color)} aria-hidden />
        <span className="hidden tabular-nums md:inline">{label}</span>
      </button>
      {(note || syncError) && (
        <span role="status" className="animate-in absolute right-0 top-10 z-50 w-64 rounded-md border border-line bg-card p-2.5 text-[12.5px] text-ink-2 shadow-lift">
          {syncError ?? note}
        </span>
      )}
    </span>
  );
}

function ShortcutLegend({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = usePrefs();
  if (!open) return null;
  const rows: Array<[React.ReactNode, string]> = [
    [<Kbd key="s">Space</Kbd>, t.shell.scSpace],
    [<span key="n" className="flex gap-1"><Kbd>1</Kbd><Kbd>2</Kbd><Kbd>3</Kbd><Kbd>4</Kbd></span>, t.shell.scModes],
    [<span key="e" className="flex gap-1"><Kbd>⌘/Ctrl</Kbd><Kbd>Enter</Kbd></span>, t.shell.scSubmit],
    [<Kbd key="esc">Esc</Kbd>, t.shell.scEsc],
    [<Kbd key="q">?</Kbd>, t.shell.scLegend],
  ];
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/30 p-4" onClick={onClose} role="presentation">
      <div role="dialog" aria-modal="true" aria-label={t.shell.shortcutsTitle} className="animate-in w-full max-w-md rounded-lg border border-line bg-card p-5 shadow-lift" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">{t.shell.shortcutsTitle}</h2>
          <button type="button" onClick={onClose} aria-label={t.common.close} className="rounded p-1 text-ink-3 hover:bg-surface hover:text-ink"><X className="size-4" /></button>
        </div>
        <ul className="space-y-2.5">
          {rows.map(([k, d], i) => (
            <li key={i} className="flex items-center justify-between gap-4 text-[13.5px] text-ink-2">
              <span>{d}</span>
              {k}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { status } = useShell();
  const { theme, setTheme, t } = usePrefs();
  const [collapsed, setCollapsed] = useState(false);
  const [legend, setLegend] = useState(false);
  const nav = navItems(t);

  const streamId = status?.stream.id ?? null;
  useEffect(() => setCollapsed(readStreamValue(streamId, "sidebar") === "collapsed"), [streamId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?" && !isTypingTarget(e.target)) {
        e.preventDefault();
        setLegend(true);
      }
      if (e.key === "Escape") setLegend(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      writeStreamValue(streamId, "sidebar", c ? "open" : "collapsed");
      return !c;
    });
  };

  // The calibration audit is a distraction-free studio: no navigation chrome.
  if (pathname.startsWith("/onboarding") || pathname.startsWith("/access"))
    return (
      <>
        <RateLimitBanner />
        {children}
      </>
    );

  const due = status?.dueCards ?? 0;

  return (
    <div className="min-h-screen" style={{ "--lf-sidebar": collapsed ? "64px" : "var(--sidebar-w)" } as React.CSSProperties}>
      {/* Desktop sidebar */}
      <aside className={cn("fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-canvas transition-[width] duration-200 ease-lf md:flex", collapsed ? "w-[64px]" : "w-[var(--sidebar-w)]")}>
        <div className={cn("flex h-14 items-center gap-2 px-4", collapsed && "justify-center px-0")}>
          <span className="flex size-7 items-center justify-center rounded-md bg-ink font-serif text-[15px] font-semibold text-canvas" aria-hidden>L</span>
          {!collapsed && <span className="text-[15px] font-semibold tracking-[-0.01em]">LexiForge</span>}
        </div>
        <nav aria-label={t.nav.primary} className="mt-2 flex flex-1 flex-col gap-0.5 px-2">
          {nav.map((n) => {
            const active = n.match(pathname);
            const Icon = n.icon;
            return (
              <Link
                key={n.key}
                href={n.href}
                aria-current={active ? "page" : undefined}
                title={collapsed ? n.label : undefined}
                className={cn(
                  "group relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-medium transition-colors duration-200 ease-lf",
                  active ? "bg-surface text-ink" : "text-ink-2 hover:bg-surface/70 hover:text-ink",
                  collapsed && "justify-center px-0",
                )}
              >
                <Icon className="size-[17px] shrink-0" aria-hidden />
                {!collapsed && <span className="flex-1">{n.label}</span>}
                {n.key === "graveyard" && due > 0 && (
                  <span className={cn("num rounded-full bg-critical px-1.5 text-[10.5px] font-semibold leading-[18px] text-white", collapsed && "absolute right-1.5 top-1")} aria-label={fmt(t.nav.reviewsDue, { n: due })}>
                    {due > 99 ? "99+" : due}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className={cn("flex flex-col gap-0.5 border-t border-line p-2", collapsed && "items-center")}>
          <Link href="/settings" title={t.nav.settings} className={cn("flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] text-ink-3 hover:bg-surface hover:text-ink", collapsed && "w-9 justify-center px-0")}>
            <Settings className="size-4" aria-hidden />
            {!collapsed && t.nav.settings}
          </Link>
          <button type="button" onClick={() => setLegend(true)} title={`${t.shell.shortcutsTitle} (?)`} className={cn("flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] text-ink-3 hover:bg-surface hover:text-ink", collapsed && "w-9 justify-center px-0")}>
            <Keyboard className="size-4" aria-hidden />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">{t.nav.shortcuts}</span>
                <Kbd>?</Kbd>
              </>
            )}
          </button>
          <button type="button" onClick={toggleCollapsed} aria-label={collapsed ? t.nav.expandSidebar : t.nav.collapseSidebar} className={cn("flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] text-ink-3 hover:bg-surface hover:text-ink", collapsed && "w-9 justify-center px-0")}>
            {collapsed ? <ChevronsRight className="size-4" aria-hidden /> : <ChevronsLeft className="size-4" aria-hidden />}
            {!collapsed && t.nav.collapse}
          </button>
        </div>
      </aside>

      <div className={cn("transition-[padding] duration-200 ease-lf", collapsed ? "md:pl-[64px]" : "md:pl-[var(--sidebar-w)]")}>
        {/* Top utility strip */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-canvas/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-canvas/75 md:px-6">
          <span className="mr-1 flex size-7 items-center justify-center rounded-md bg-ink font-serif text-[15px] font-semibold text-canvas md:hidden" aria-hidden>L</span>
          <StreamPill />
          <ProficiencyPill className="hidden sm:inline-flex" subBand={status?.subBand ?? null} ielts={status?.ielts ?? null} />
          <div className="ml-auto flex items-center gap-1.5">
            <LangSwitch />
            <SyncDot />
            <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? t.shell.toLight : t.shell.toDark} className="flex size-8 items-center justify-center rounded-full text-ink-2 hover:bg-surface hover:text-ink">
              {theme === "dark" ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1240px] px-4 pb-28 pt-6 md:px-8 md:pb-16 md:pt-8">{children}</main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav aria-label={t.nav.primary} className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {nav.map((n) => {
          const active = n.match(pathname);
          const Icon = n.icon;
          return (
            <Link key={n.key} href={n.href} aria-current={active ? "page" : undefined} className={cn("relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-ink" : "text-ink-3")}>
              <Icon className="size-5" aria-hidden />
              <span className="max-w-full truncate px-0.5">{n.short}</span>
              {n.key === "graveyard" && due > 0 && <span className="num absolute right-[calc(50%-22px)] top-2 rounded-full bg-critical px-1.5 text-[10px] font-semibold leading-4 text-white">{due > 99 ? "99+" : due}</span>}
            </Link>
          );
        })}
      </nav>
      <RateLimitBanner />
      <ShortcutLegend open={legend} onClose={() => setLegend(false)} />
    </div>
  );
}
