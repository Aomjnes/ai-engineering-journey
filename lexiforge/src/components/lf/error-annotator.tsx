"use client";

import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { humanize } from "@/lib/client/format";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_LABEL, SeverityBadge, type SeverityName } from "./severity";
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
        aria-label={`${e.severity.toLowerCase()} error: ${e.original}. Show diagnosis.`}
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

/** Strict-editor diagnostic cards. Deliberately no "copy fix" action. */
export function ErrorCards({ errors, active, onSelect }: { errors: AnnotatedError[]; active: number | null; onSelect: (i: number) => void }) {
  const { pick } = usePrefs();
  return (
    <ol className="space-y-2">
      {errors.map((e, i) => (
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
              <Badge variant="outline">{CATEGORY_LABEL[e.category] ?? e.category}</Badge>
              <SeverityBadge severity={e.severity} />
              <span className="ml-auto font-mono text-[11px] text-ink-3">{humanize(e.subtype)}</span>
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px]">
              <span className="text-critical-ink line-through decoration-critical/70">{e.original}</span>
              <ArrowRight className="size-3.5 text-ink-3" aria-hidden />
              <span className="font-medium text-mastered-ink">{e.correction || "(delete)"}</span>
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{pick(e.ruleEn, e.ruleVi)}</p>
          </button>
        </li>
      ))}
    </ol>
  );
}
