"use client";

import Link from "next/link";
import { Check, Circle, Lock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { fmt, type Dict } from "@/lib/i18n";
import { usePrefs } from "./prefs";

export type CheckStatus = "PASS" | "PROGRESS" | "BLOCKED" | "LOCKED" | "NO_DATA";
export interface LockCheck {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
  params?: Record<string, string | number>;
}

/** Localized label + detail for a promotion check (falls back to the server's English text). */
export function checkText(t: Dict, c: LockCheck): { label: string; detail: string } {
  const p = c.params;
  if (!p) return { label: c.label, detail: c.detail };
  switch (c.key) {
    case "sessions":
      return { label: t.lock.sessions, detail: fmt(t.lock.sessionsDetail, p) };
    case "eri":
      return { label: t.lock.eri, detail: c.status === "PASS" ? fmt(t.lock.eriPass, p) : fmt(t.lock.eriBlocked, p) };
    case "rss":
      return { label: fmt(t.lock.rss, { n: p.floor ?? 60 }), detail: p.evidence ? fmt(t.lock.rssDetail, p) : t.lock.rssNoData };
    case "audit":
      return { label: t.lock.audit, detail: c.status === "PASS" ? fmt(t.lock.auditOpen, p) : t.lock.auditLocked };
    default:
      return { label: c.label, detail: c.detail };
  }
}

const STYLE: Record<CheckStatus, { tag: string; cls: string; icon: React.ReactNode }> = {
  PASS: { tag: "PASS", cls: "text-mastered-ink bg-mastered-wash", icon: <Check aria-hidden /> },
  PROGRESS: { tag: "", cls: "text-ink-2 bg-surface", icon: <Circle aria-hidden /> },
  BLOCKED: { tag: "BLOCKED", cls: "text-critical-ink bg-critical-wash", icon: <X aria-hidden /> },
  LOCKED: { tag: "LOCKED", cls: "text-ink-3 bg-surface", icon: <Lock aria-hidden /> },
  NO_DATA: { tag: "NO DATA", cls: "text-ink-3 bg-surface", icon: <Circle aria-hidden /> },
};

/** The exact list of what stands between the learner and the next band. */
export function PromotionLockList({ checks, compact = false }: { checks: LockCheck[]; compact?: boolean }) {
  const { t } = usePrefs();
  return (
    <ul className="space-y-1.5">
      {checks.map((c) => {
        const st = STYLE[c.status];
        const progressTag = c.key === "sessions" ? (c.params ? `${c.params.n}/${c.params.req}` : c.detail.split(" ")[0]) : "";
        const txt = checkText(t, c);
        const tag = st.tag ? (t.lock as Record<string, string>)[c.status] ?? st.tag : progressTag;
        return (
          <li key={c.key} className="flex items-start gap-2.5">
            <span className={cn("num mt-[1px] inline-flex h-5 w-[74px] shrink-0 items-center justify-center gap-1 rounded px-1.5 text-[10.5px] font-semibold [&_svg]:size-3", st.cls)}>
              {st.icon}
              {tag}
            </span>
            <span className="min-w-0 text-[13px] leading-5">
              <span className="font-medium text-ink">{txt.label}</span>
              {!compact && <span className="block text-[12px] text-ink-3">{txt.detail}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function PromotionAction({ unlocked, nextBand, metricsLink = true }: { unlocked: boolean; nextBand: string | null; metricsLink?: boolean }) {
  const { t } = usePrefs();
  if (!nextBand) return <p className="text-[13px] text-ink-3">{t.lock.ceiling}</p>;
  return unlocked ? (
    <Link href="/promotion" className={buttonVariants({ variant: "primary", size: "md" })}>{fmt(t.lock.takeAudit, { band: nextBand })}</Link>
  ) : (
    <span className="flex flex-col gap-2">
      <button type="button" disabled className={buttonVariants({ variant: "outline", size: "md" })} aria-describedby="audit-locked-why">
        <Lock aria-hidden /> {t.lock.auditLockedBtn}
      </button>
      <span id="audit-locked-why" className="sr-only">{t.lock.auditLocked}</span>
      {metricsLink && <Link href="/metrics" className="text-center text-[12.5px] text-ink-3 hover:text-ink">{t.lock.viewMetrics}</Link>}
    </span>
  );
}
