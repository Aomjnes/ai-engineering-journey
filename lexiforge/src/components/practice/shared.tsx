"use client";

import { cn } from "@/lib/utils";
import { usePrefs } from "@/components/lf/prefs";
import type { WordOp } from "@/lib/metrics/similarity";

export type Mode = "DICTATION" | "SPEAKING" | "SENTENCE" | "ROLEPLAY" | "FOUNDATION";

export interface SessionBase {
  id: string;
  mode: Exclude<Mode, "FOUNDATION">;
  level: string;
  topic: string;
  status: string;
  score: number | null;
}
export interface DictationItem {
  index: number;
  audio: string;
  vi: string;
  attempts: number;
  firstAccuracy: number | null;
  checked: boolean;
  locked: boolean;
  reveal: string | null;
}
export interface SpeakingItem {
  index: number;
  text: string;
  ipa: string;
  tipVi: string;
  tipEn: string;
  attempts: number;
  best: number;
  passed: boolean;
}
export interface SentenceItem {
  index: number;
  vi: string;
  trapVi: string | null;
  chips: string[];
  answer: string | null;
  attempts: number;
  passed: boolean;
  chipFailures: number;
}
export type DictationSession = SessionBase & { mode: "DICTATION"; items: DictationItem[] };
export type SpeakingSession = SessionBase & { mode: "SPEAKING"; items: SpeakingItem[] };
export type SentenceSession = SessionBase & { mode: "SENTENCE"; chipMode: boolean; items: SentenceItem[] };
export type RoleplaySession = SessionBase & {
  mode: "ROLEPLAY";
  scenario: { id: string; titleVi: string; titleEn: string; setupVi: string; setupEn: string } | null;
  transcript: Array<{ role: "partner" | "learner"; text: string }>;
  finished: boolean;
  userTurns: number;
  maxTurns: number;
};
export type Session = DictationSession | SpeakingSession | SentenceSession | RoleplaySession;

export interface WordDiffView {
  ops: WordOp[];
  accuracy: number;
  perfect: boolean;
}

/** Word-by-word comparison: what you typed/said against the expected sentence. Never color-only. */
export function WordDiffLine({ diff, className }: { diff: WordDiffView; className?: string }) {
  const { t } = usePrefs();
  return (
    <div className={className}>
      <p className="flex flex-wrap gap-x-1.5 gap-y-2 font-serif text-[18px] leading-relaxed">
        {diff.ops.map((op, i) => {
          if (op.type === "ok") return <span key={i} className="text-mastered-ink" title={t.practice.opOk}>{op.typed}</span>;
          if (op.type === "misspelled")
            return (
              <span key={i} className="err-moderate" title={t.practice.opMisspelled}>
                {op.typed} <span className="font-sans text-[12px] text-ink-3">→ {op.expected}</span>
              </span>
            );
          if (op.type === "wrong")
            return (
              <span key={i} className="err-critical" title={t.practice.opWrong}>
                {op.typed} <span className="font-sans text-[12px] text-ink-3">→ {op.expected}</span>
              </span>
            );
          if (op.type === "missing")
            return (
              <span key={i} className="rounded border border-dashed border-critical/60 px-1 text-critical-ink" title={t.practice.opMissing}>
                [{op.expected}]
              </span>
            );
          return <span key={i} className="text-ink-3 line-through" title={t.practice.opExtra}>{op.typed}</span>;
        })}
      </p>
      <p className="mt-2 text-[11.5px] text-ink-3">{t.practice.diffLegend}</p>
    </div>
  );
}

export function ItemDots({ items, current, onPick }: { items: Array<{ done: boolean }>; current: number; onPick: (i: number) => void }) {
  return (
    <div className="flex gap-1.5">
      {items.map((it, i) => (
        <button key={i} type="button" onClick={() => onPick(i)} aria-label={String(i + 1)} aria-current={i === current ? "step" : undefined} className={cn("num flex size-7 items-center justify-center rounded-full text-[11.5px] font-semibold", it.done ? "bg-mastered text-white" : i === current ? "bg-ink text-canvas" : "border border-line-strong text-ink-3")}>
          {i + 1}
        </button>
      ))}
    </div>
  );
}

export function SessionDone({ score, onAgain }: { score: number | null; onAgain: () => void }) {
  const { t, fmt } = usePrefs();
  return (
    <div className="animate-in rounded-lg border border-mastered/40 bg-mastered-wash p-5">
      <p className="text-[15px] font-semibold text-mastered-ink">{t.practice.sessionDone}</p>
      {score !== null && <p className="num mt-1 text-[13.5px] text-ink-2">{fmt(t.practice.score, { n: score.toFixed(0) })}</p>}
      <button type="button" onClick={onAgain} className="mt-3 text-[13.5px] font-medium text-accent-ink hover:underline">{t.practice.again} →</button>
    </div>
  );
}
