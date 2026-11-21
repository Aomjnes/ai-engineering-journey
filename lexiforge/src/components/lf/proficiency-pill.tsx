"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export function ProficiencyPill({ subBand, ielts, className }: { subBand: string | null; ielts: { band: number; low: number; high: number } | null; className?: string }) {
  if (!subBand || !ielts) {
    return (
      <Link href="/onboarding" className={cn("inline-flex h-8 items-center rounded-full border border-dashed border-line-strong px-3 text-[12.5px] text-ink-3 hover:text-ink", className)}>
        Not calibrated
      </Link>
    );
  }
  return (
    <Link
      href="/metrics"
      title={`Estimated IELTS ${ielts.band.toFixed(1)} (range ${ielts.low.toFixed(1)}–${ielts.high.toFixed(1)}). View the evidence ledger.`}
      className={cn("group inline-flex h-8 items-center gap-0 overflow-hidden rounded-full border border-line bg-card text-[12.5px] transition-colors hover:border-line-strong", className)}
    >
      <span className="flex h-full items-center gap-1.5 whitespace-nowrap bg-surface px-2.5 text-ink-3">
        <span className="hidden sm:inline">CEFR</span> <span className="num font-semibold text-ink">{subBand}</span>
      </span>
      <span className="flex h-full items-center gap-1.5 whitespace-nowrap px-2.5 text-ink-3">
        <span className="hidden sm:inline">Est. IELTS</span>
        <span className="sm:hidden">IELTS</span> <span className="num font-semibold text-ink">{ielts.band.toFixed(1)}</span>
      </span>
    </Link>
  );
}
