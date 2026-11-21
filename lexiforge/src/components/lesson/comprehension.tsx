"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { detectCopy } from "@/lib/metrics/similarity";
import { countWords } from "@/lib/metrics/text";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ErrorCards, type AnnotatedError } from "@/components/lf/error-annotator";
import { COMPREHENSION_PHASES, PhasedStatus } from "@/components/lf/states";
import { usePrefs } from "@/components/lf/prefs";
import { ModEnterHint, submitOnModEnter } from "./common";

interface Question {
  id: string;
  type: string;
  prompt: string;
  passed: boolean;
}

interface Result {
  passed: boolean;
  copyRejected: boolean;
  message?: string;
  similarity?: number;
  rubric?: Array<{ criterion: string; met: boolean; evidence: string }>;
  criteriaMet?: number;
  criteriaTotal?: number;
  verdictEn?: string;
  verdictVi?: string;
  errors?: AnnotatedError[];
  nextStage?: string;
}

export function ReferenceDrawer({ text, title }: { text: string; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-line bg-card">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="min-w-0">
          <span className="eyebrow block">Reference</span>
          <span className="block truncate font-serif text-[15px] text-ink">{title}</span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-ink-3 transition-transform duration-200 ease-lf", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className="animate-in max-h-[45vh] overflow-y-auto border-t border-line px-4 py-4">
          <div className="reading measure whitespace-pre-wrap text-[16.5px]">{text}</div>
        </div>
      )}
    </div>
  );
}

function QuestionCard({ q, index, lessonId, source, onPassed }: { q: Question; index: number; lessonId: string; source: string; onPassed: () => Promise<void> }) {
  const { pick } = usePrefs();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const words = countWords(text);
  const overlap = useMemo(() => (words >= 4 ? detectCopy(text, source).maxJaccard : 0), [text, source, words]);
  const tooClose = overlap > 0.65;
  const tooShort = words > 0 && words < 5;

  async function submit() {
    if (busy || words < 5) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<Result>("/api/evaluate", { stage: "COMPREHENSION", lessonId, questionId: q.id, answer: text });
      setResult(r);
      if (r.passed) await onPassed();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-line bg-card p-5" aria-labelledby={`q-${q.id}`}>
      <div className="flex items-start gap-3">
        <span className="num mt-0.5 text-[12px] text-ink-3">{String(index + 1).padStart(2, "0")}</span>
        <div className="min-w-0 flex-1">
          <Badge variant="outline" className="capitalize">{q.type}</Badge>
          <h3 id={`q-${q.id}`} className="mt-2 text-[16px] font-medium leading-snug text-ink">{q.prompt}</h3>
        </div>
        {q.passed && <Badge variant="mastered"><Check aria-hidden />Passed</Badge>}
      </div>
      {!q.passed && (
        <div className="mt-4 pl-7">
          <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} onPaste={(e) => e.preventDefault()} onKeyDown={submitOnModEnter(() => void submit())} placeholder="Explain in your own words…" aria-describedby={`q-${q.id}-hint`} disabled={busy} />
          <div id={`q-${q.id}-hint`} className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]" aria-live="polite">
            <span className="num text-ink-3">{words} words</span>
            {tooShort && <span className="text-moderate-ink">At least 5 words.</span>}
            {tooClose && <span className="tabular-nums text-critical-ink">Too close to source text ({Math.round(overlap * 100)}% overlap) — explain in your own words.</span>}
            <span className="ml-auto flex items-center gap-2">
              <ModEnterHint />
              <Button size="sm" onClick={() => void submit()} disabled={busy || words < 5}>{busy ? "Checking…" : "Submit"}</Button>
            </span>
          </div>
          <PhasedStatus className="mt-3" phases={COMPREHENSION_PHASES} active={busy} />
          {error && <p className="mt-3 rounded-md bg-critical-wash p-3 text-[13px] text-critical-ink">{error}</p>}
        </div>
      )}
      {result && (
        <div className={cn("animate-in mt-4 rounded-md border p-4 pl-7", result.passed ? "border-mastered/30 bg-mastered-wash/50" : "border-critical/25 bg-critical-wash/50")}>
          {result.copyRejected ? (
            <p className="text-[13.5px] text-critical-ink">{result.message}</p>
          ) : (
            <>
              <p className="text-[13px] font-semibold tabular-nums text-ink">{result.criteriaMet}/{result.criteriaTotal} criteria met {result.passed ? "· passed" : "· not passed — try again"}</p>
              <ul className="mt-2 space-y-1">
                {result.rubric?.map((r) => (
                  <li key={r.criterion} className="flex gap-2 text-[13px] text-ink-2">
                    {r.met ? <Check className="mt-0.5 size-3.5 shrink-0 text-mastered-ink" aria-label="met" /> : <X className="mt-0.5 size-3.5 shrink-0 text-critical-ink" aria-label="not met" />}
                    {r.criterion}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[13.5px] text-ink">{pick(result.verdictEn ?? "", result.verdictVi ?? "")}</p>
              {result.errors && result.errors.length > 0 && (
                <div className="mt-3">
                  <ErrorCards errors={result.errors} active={null} onSelect={() => undefined} />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

export function ComprehensionStage({ lessonId, questions, source, title, onChange }: { lessonId: string; questions: Question[]; source: string; title: string; onChange: () => Promise<void> }) {
  const done = questions.filter((q) => q.passed).length;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <p className="eyebrow">Stage 2 · Deep comprehension</p>
        <h2 className="mt-1 font-serif text-[26px] font-medium tracking-[-0.01em]">Show what the text means, not what it says.</h2>
        <p className="mt-1 text-[13.5px] text-ink-2">Answers are graded against fixed rubrics. Copying more than 65% of a source passage is rejected and scores zero for this question.</p>
        <p className="num mt-2 text-[12.5px] text-ink-3">{done}/{questions.length} passed</p>
      </div>
      <ReferenceDrawer text={source} title={title} />
      {questions.map((q, i) => (
        <QuestionCard key={q.id} q={q} index={i} lessonId={lessonId} source={source} onPassed={onChange} />
      ))}
    </div>
  );
}
