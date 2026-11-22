"use client";

import { useId, useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/i18n";
import { usePrefs } from "./prefs";

export type MetricKey = "gai" | "lri" | "cpr" | "rss" | "eri" | "cefr" | "ielts";

/** Hover/focus tooltip that explains a number. Keyboard reachable. */
export function MetricTooltip({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  const { t } = usePrefs();
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className={cn("relative inline-flex", className)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label={fmt(t.tooltip.how, { label })} aria-describedby={open ? id : undefined} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen((o) => !o)} className="rounded text-ink-3 hover:text-ink">
        <Info className="size-3.5" aria-hidden />
      </button>
      {open && (
        <span role="tooltip" id={id} className="animate-in absolute left-1/2 top-6 z-50 w-72 max-w-[80vw] -translate-x-1/2 rounded-md border border-line bg-card p-3 text-left text-[12.5px] font-normal normal-case leading-relaxed tracking-normal text-ink-2 shadow-lift">
          {children}
        </span>
      )}
    </span>
  );
}

/** Plain-language explanation of one metric: what it measures + how to improve it. */
export function MetricInfo({ metric, className }: { metric: MetricKey; className?: string }) {
  const { t } = usePrefs();
  const m = t.metric as Record<string, string>;
  const name = m[`${metric}Name`] ?? metric.toUpperCase();
  return (
    <MetricTooltip label={name} className={className}>
      <span className="block font-semibold text-ink">{name}</span>
      <span className="mt-1.5 block"><span className="font-medium text-ink">{t.metric.whatLabel}: </span>{m[`${metric}What`]}</span>
      <span className="mt-1.5 block"><span className="font-medium text-ink">{t.metric.howLabel}: </span>{m[`${metric}How`]}</span>
    </MetricTooltip>
  );
}
