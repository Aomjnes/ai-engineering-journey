"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { fmt, ieltsText } from "@/lib/i18n";
import { usePrefs } from "./prefs";

export function ProficiencyPill({ subBand, ielts, className }: { subBand: string | null; ielts: { band: number; low: number; high: number } | null; className?: string }) {
  const { t } = usePrefs();
  if (!subBand || !ielts) {
    return (
      <Link href="/onboarding" className={cn("inline-flex h-8 items-center rounded-full border border-dashed border-line-strong px-3 text-[12.5px] text-ink-3 hover:text-ink", className)}>
        {t.shell.notCalibrated}
      </Link>
    );
  }
  return (
    <Link
      href="/metrics"
      title={fmt(t.shell.pillTitle, { band: ieltsText(ielts.band), low: ielts.low.toFixed(1), high: ielts.high.toFixed(1) })}
      className={cn("group inline-flex h-8 items-center gap-0 overflow-hidden rounded-full border border-line bg-card text-[12.5px] transition-colors hover:border-line-strong", className)}
    >
      <span className="flex h-full items-center gap-1.5 whitespace-nowrap bg-surface px-2.5 text-ink-3">
        <span className="hidden sm:inline">CEFR</span> <span className="num font-semibold text-ink">{subBand}</span>
      </span>
      <span className="flex h-full items-center gap-1.5 whitespace-nowrap px-2.5 text-ink-3">
        <span className="hidden sm:inline">{t.shell.estIelts}</span>
        <span className="sm:hidden">IELTS</span> <span className="num font-semibold text-ink">{ieltsText(ielts.band)}</span>
      </span>
    </Link>
  );
}
