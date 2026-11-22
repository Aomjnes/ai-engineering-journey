"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt, subtypeLabel } from "@/lib/i18n";
import { useShell } from "./shell-data";
import { Badge } from "@/components/ui/badge";
import { SeverityBadge, useCategoryLabel, type SeverityName } from "./severity";
import { usePrefs } from "./prefs";

export interface AnnotatedError {
  start: number;
  end: number;
  original: string;
  correction: string;
  category: string;
  subtype: string;
  severity: SeverityName;
  ruleEn: string;
  ruleVi: string;
}

const UNDERLINE: Record<SeverityName, string> = { CRITICAL: "err-critical", MODERATE: "err-moderate", MINOR: "err-minor" };

/** The learner's exact text with severity underlines. Spans are buttons that select their diagnostic card. */
export function ErrorSpanAnnotator({ text, errors, active, onSelect, className }: { text: string; errors: AnnotatedError[]; active: number | null; onSelect: (i: number) => void; className?: string }) {
  const { t } = usePrefs();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  errors.forEach((e, i) => {
    if (e.start < cursor || e.end > text.length) return;
    if (e.start > cursor) parts.push(<span key={`t${cursor}`}>{text.slice(cursor, e.start)}</span>);
    parts.push(
      <button
        key={`e${i}`}
        type="button"
        onClick={() => onSelect(i)}
        aria-label={`${t.severity[e.severity]}: ${e.original}`}
        className={cn(UNDERLINE[e.severity], "rounded-[2px] text-left transition-colors duration-200 ease-lf", active === i && (e.severity === "CRITICAL" ? "bg-critical-wash" : e.severity === "MODERATE" ? "bg-moderate-wash" : "bg-minor-wash"))}
      >
        {text.slice(e.start, e.end)}
      </button>,
    );
    cursor = e.end;
  });
  if (cursor < text.length) parts.push(<span key="tail">{text.slice(cursor)}</span>);
  return <p className={cn("whitespace-pre-wrap font-serif text-[17px] leading-[1.85] text-ink", className)}>{parts}</p>;
}

const RANK: Record<SeverityName, number> = { CRITICAL: 0, MODERATE: 1, MINOR: 2 };
/** Beginners (Pre-A1/A1) see the most important fixes first, two at a time, so feedback never overwhelms. */
export const BEGINNER_FIRST_FIXES = 2;

/** Strict-editor diagnostic cards. Deliberately no "copy fix" action. */
export function ErrorCards({ errors, active, onSelect }: { errors: AnnotatedError[]; active: number | null; onSelect: (i: number) => void }) {
  const { pick, t } = usePrefs();
  const beginner = useShell().status?.beginner ?? false;
  const categoryLabel = useCategoryLabel();
  const [expanded, setExpanded] = useState(false);
  const order = errors.map((_, i) => i).sort((a, b) => RANK[errors[a]!.severity] - RANK[errors[b]!.severity] || a - b);
  const limit = beginner && !expanded ? BEGINNER_FIRST_FIXES : order.length;
  const shown = order.slice(0, limit);
  return (
    <>
    {beginner && errors.length > 0 && <p className="mb-2 text-[13px] leading-relaxed text-ink-2">{t.workspace.beginnerFixHint}</p>}
    <ol className="space-y-2">
      {shown.map((i) => { const e = errors[i]!; return (
        <li key={`${e.start}-${e.subtype}`}>
          <button
            type="button"
            id={`err-card-${i}`}
            onClick={() => onSelect(i)}
            className={cn(
              "w-full rounded-md border bg-card p-3.5 text-left transition-[border-color,box-shadow] duration-200 ease-lf",
              active === i ? "border-ink/30 shadow-lift" : "border-line hover:border-line-strong",
            )}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="num text-[11px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
              <Badge variant="outline">{categoryLabel(e.category)}</Badge>
              <SeverityBadge severity={e.severity} />
              <span className="ml-auto font-mono text-[11px] text-ink-3">{subtypeLabel(t, e.subtype)}</span>
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px]">
              <span className="text-critical-ink line-through decoration-critical/70">{e.original}</span>
              <ArrowRight className="size-3.5 text-ink-3" aria-hidden />
              <span className="font-medium text-mastered-ink">{e.correction || t.workspace.deleteIt}</span>
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{pick(e.ruleEn, e.ruleVi)}</p>
          </button>
        </li>
      ); })}
    </ol>
    {order.length > limit && (
      <button type="button" onClick={() => setExpanded(true)} className="mt-2 text-[13px] font-medium text-accent-ink hover:underline">
        {fmt(t.workspace.moreFixes, { n: order.length - limit })}
      </button>
    )}
    </>
  );
}
