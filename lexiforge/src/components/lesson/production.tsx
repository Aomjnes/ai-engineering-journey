"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Lock, ShieldCheck } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { countWords } from "@/lib/metrics/text";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChunkTrackerBar } from "@/components/lf/chunk-tracker";
import { ErrorCards, ErrorSpanAnnotator, type AnnotatedError } from "@/components/lf/error-annotator";
import { EVAL_PHASES, PhasedStatus } from "@/components/lf/states";
import { usePrefs } from "@/components/lf/prefs";
import { ReferenceDrawer } from "./comprehension";
import { DictateButton, ModEnterHint, submitOnModEnter } from "./common";

export interface Attempt {
  text: string;
  blocked: boolean;
  reasons: string[];
  errors: AnnotatedError[];
  chunks: Array<{ chunk: string; present: boolean; counted: boolean; note: string }>;
  gai: number | null;
  lri: number | null;
  verdictEn: string;
  verdictVi: string;
  nativeUpgrade: string | null;
  session?: { composite: number; qualified: boolean; levelBefore: number; levelAfter: number } | null;
}

interface ApiResult {
  blocked: boolean;
  reasons: string[];
  errors: AnnotatedError[];
  chunks: Attempt["chunks"];
  metrics: { gai: { gai: number }; lri: { lri: number } };
  verdictEn: string;
  verdictVi: string;
  nativeUpgrade: string | null;
  session?: Attempt["session"];
}

const REQUIRED = 3;
const MIN_WORDS = 60;
const MAX_WORDS = 220;

function toAttempt(text: string, r: ApiResult): Attempt {
  return { text, blocked: r.blocked, reasons: r.reasons, errors: r.errors, chunks: r.chunks, gai: r.metrics.gai.gai, lri: r.metrics.lri.lri, verdictEn: r.verdictEn, verdictVi: r.verdictVi, nativeUpgrade: r.nativeUpgrade, session: r.session ?? null };
}

function WordCount({ n }: { n: number }) {
  return <span className={cn("num text-[12.5px]", n < MIN_WORDS || n > MAX_WORDS ? "text-moderate-ink" : "text-ink-3")}>{n} / {MIN_WORDS}–{MAX_WORDS} words</span>;
}

/** Stage 3: active production, strict evaluation, mandatory self-repair, native comparison after passing. */
export function ProductionStage({ lessonId, prompt, chunks, source, title, initial, onPassed, onContinue }: { lessonId: string; prompt: string; chunks: string[]; source: string; title: string; initial: Attempt | null; onPassed: () => Promise<void>; onContinue: () => void }) {
  const { pick } = usePrefs();
  const [attempt, setAttempt] = useState<Attempt | null>(initial);
  const [draft, setDraft] = useState("");
  const [revision, setRevision] = useState(initial?.text ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const revisionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (active !== null) document.getElementById(`err-card-${active}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active]);

  const counts = useMemo(() => {
    const e = attempt?.errors ?? [];
    return { critical: e.filter((x) => x.severity === "CRITICAL").length, moderate: e.filter((x) => x.severity === "MODERATE").length, minor: e.filter((x) => x.severity === "MINOR").length };
  }, [attempt]);

  async function submitFirst() {
    const n = countWords(draft);
    if (busy || n < MIN_WORDS || n > MAX_WORDS) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<ApiResult>("/api/evaluate", { stage: "PRODUCTION", lessonId, text: draft });
      setAttempt(toAttempt(draft, r));
      setRevision(draft);
      setActive(null);
      if (!r.blocked) await onPassed();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function reverify() {
    const n = countWords(revision);
    if (busy || n < MIN_WORDS || n > MAX_WORDS) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<ApiResult>("/api/evaluate", { stage: "REWRITE", lessonId, text: revision });
      setAttempt(toAttempt(revision, r));
      setActive(null);
      if (!r.blocked) await onPassed();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // ── First draft ──────────────────────────────────────────────
  if (!attempt) {
    const n = countWords(draft);
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div>
          <p className="eyebrow">Stage 3 · Produce &amp; repair</p>
          <h2 className="mt-1 font-serif text-[26px] font-medium tracking-[-0.01em]">Write it yourself.</h2>
          <p className="mt-2 rounded-md border border-line bg-surface p-3.5 text-[14.5px] leading-relaxed text-ink">{prompt}</p>
        </div>
        <ReferenceDrawer text={source} title={title} />
        <div className="rounded-lg border border-line bg-card">
          <div className="border-b border-line px-4 py-3">
            <ChunkTrackerBar chunks={chunks} text={draft} required={REQUIRED} />
          </div>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={(e) => e.preventDefault()}
            onKeyDown={submitOnModEnter(() => void submitFirst())}
            rows={12}
            spellCheck={false}
            autoCorrect="off"
            disabled={busy}
            aria-label="Your production draft"
            placeholder="Start writing. Pasting is disabled; spell-check is off on purpose."
            className="rounded-none border-0 px-5 py-4 font-serif text-[17.5px] leading-[1.8] focus:ring-0"
          />
          <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
            <WordCount n={n} />
            <DictateButton onText={(t) => setDraft((s) => `${s} ${t}`.trim())} />
            <span className="ml-auto flex items-center gap-2">
              <ModEnterHint />
              <Button onClick={() => void submitFirst()} disabled={busy || n < MIN_WORDS || n > MAX_WORDS}>{busy ? "Evaluating…" : "Submit for strict evaluation"}</Button>
            </span>
          </div>
        </div>
        <PhasedStatus phases={EVAL_PHASES} active={busy} />
        {error && <p className="rounded-md bg-critical-wash p-3 text-[13px] text-critical-ink">{error}</p>}
        <p className="text-[12.5px] text-ink-3">Your first draft is the one that is scored. Rewrites unblock progress but never change the score.</p>
      </div>
    );
  }

  // ── Passed: native comparison ────────────────────────────────
  if (!attempt.blocked) {
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Stage 3 · Verified</p>
            <h2 className="mt-1 flex items-center gap-2 font-serif text-[26px] font-medium tracking-[-0.01em]"><ShieldCheck className="size-6 text-mastered" aria-hidden />Gate passed.</h2>
            <p className="mt-1 text-[13px] tabular-nums text-ink-2">GAI {attempt.gai?.toFixed(1)} · LRI {attempt.lri?.toFixed(1)} · {attempt.errors.length} remaining minor note{attempt.errors.length === 1 ? "" : "s"}</p>
          </div>
          <Button onClick={onContinue}>Continue to Exit Ticket <ArrowRight aria-hidden /></Button>
        </div>
        {attempt.session && (
          <p className="rounded-md border border-line bg-card px-4 py-2.5 text-[13px] tabular-nums text-ink-2">
            Session composite {attempt.session.composite.toFixed(1)} · {attempt.session.qualified ? <span className="text-mastered-ink">qualifying session</span> : "not qualifying"} · level {attempt.session.levelBefore.toFixed(1)} → {attempt.session.levelAfter.toFixed(1)}
          </p>
        )}
        <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          <section className="rounded-lg border border-line bg-card p-5">
            <p className="eyebrow mb-3">Your verified draft</p>
            <ErrorSpanAnnotator text={attempt.text} errors={attempt.errors} active={active} onSelect={setActive} />
          </section>
          <section className="rounded-lg border border-mastered/30 bg-mastered-wash/40 p-5">
            <p className="eyebrow mb-3 !text-mastered-ink">Native C1 upgrade · study, don&apos;t copy</p>
            {attempt.nativeUpgrade ? (
              <p className="no-select whitespace-pre-wrap font-serif text-[17px] leading-[1.85] text-ink" onCopy={(e) => e.preventDefault()}>{attempt.nativeUpgrade}</p>
            ) : (
              <p className="text-[13px] text-ink-3">No upgrade was returned for this draft.</p>
            )}
          </section>
        </div>
        {attempt.errors.length > 0 && <ErrorCards errors={attempt.errors} active={active} onSelect={setActive} />}
      </div>
    );
  }

  // ── Blocked: surgical repair view + rewrite gate ─────────────
  const n = countWords(revision);
  const remaining = [counts.critical ? `${counts.critical} Critical` : null, counts.moderate ? `${counts.moderate} Moderate` : null].filter(Boolean).join(", ");
  const chunkReason = attempt.reasons.find((r) => r.includes("chunk"));
  const offPrompt = attempt.reasons.find((r) => r.includes("prompt"));
  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-24">
      <div>
        <p className="eyebrow">Stage 3 · Repair required</p>
        <h2 className="mt-1 font-serif text-[26px] font-medium tracking-[-0.01em]">Your draft is blocked. Repair it yourself.</h2>
        <p className="mt-1 text-[14px] text-ink-2">{pick(attempt.verdictEn, attempt.verdictVi)}</p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1.15fr_1fr] [&>*]:min-w-0">
        <section aria-label="Annotated submission" className="rounded-lg border border-line bg-card p-5">
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-3">
            <span className="eyebrow mr-auto">Annotated submission</span>
            <span className="flex items-center gap-1.5"><span className="w-4 border-b-2 border-critical" aria-hidden />Critical</span>
            <span className="flex items-center gap-1.5"><span className="w-4 border-b-2 border-moderate" aria-hidden />Moderate</span>
            <span className="flex items-center gap-1.5"><span className="w-4 border-b border-dashed border-minor" aria-hidden />Minor</span>
          </div>
          <ErrorSpanAnnotator text={attempt.text} errors={attempt.errors} active={active} onSelect={setActive} />
          <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-3">
            {attempt.chunks.map((c) => (
              <Badge key={c.chunk} variant={c.counted ? "mastered" : c.present ? "moderate" : "neutral"} title={c.note}>
                {c.counted && <Check aria-hidden />}
                {c.chunk}
                {!c.counted && c.present && " · misused"}
              </Badge>
            ))}
          </div>
        </section>
        <section aria-label="Diagnostic cards" className="min-h-0 lg:max-h-[70vh] lg:overflow-y-auto lg:pr-1">
          {attempt.errors.length ? <ErrorCards errors={attempt.errors} active={active} onSelect={setActive} /> : <p className="rounded-lg border border-line bg-card p-4 text-[13.5px] text-ink-2">No language errors. The gate is blocked for the reasons below.</p>}
          {(chunkReason || offPrompt) && (
            <ul className="mt-2 space-y-2">
              {[chunkReason, offPrompt].filter(Boolean).map((r) => (
                <li key={r} className="rounded-md border border-moderate/30 bg-moderate-wash p-3 text-[13px] text-moderate-ink">{r}</li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-label="Revision" className="rounded-lg border border-line bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <span className="eyebrow">Your revision</span>
          <ChunkTrackerBar chunks={chunks} text={revision} required={REQUIRED} />
        </div>
        <Textarea
          ref={revisionRef}
          value={revision}
          onChange={(e) => setRevision(e.target.value)}
          onPaste={(e) => e.preventDefault()}
          onKeyDown={submitOnModEnter(() => void reverify())}
          rows={10}
          spellCheck={false}
          autoCorrect="off"
          disabled={busy}
          aria-label="Revise your draft"
          className="rounded-none border-0 px-5 py-4 font-serif text-[17.5px] leading-[1.8] focus:ring-0"
        />
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
          <WordCount n={n} />
          <DictateButton onText={(t) => setRevision((s) => `${s} ${t}`.trim())} />
          <PhasedStatus className="flex-1" phases={EVAL_PHASES} active={busy} />
        </div>
      </section>
      {error && <p className="rounded-md bg-critical-wash p-3 text-[13px] text-critical-ink">{error}</p>}

      {/* Mandatory rewrite gate footer */}
      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-line bg-card/95 backdrop-blur md:bottom-0 md:left-[var(--lf-sidebar,0px)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 md:px-8">
          <Lock className="size-4 text-critical" aria-hidden />
          <p className="flex-1 text-[13.5px] tabular-nums text-ink">
            <span className="font-semibold text-critical-ink">Blocked:</span> {remaining ? `${remaining} error${counts.critical + counts.moderate === 1 ? "" : "s"} remaining` : attempt.reasons[0]} — rewrite your draft above to pass.
          </p>
          <ModEnterHint />
          <Button onClick={() => void reverify()} disabled={busy || n < MIN_WORDS || n > MAX_WORDS}>{busy ? "Verifying…" : "Re-Verify Draft"}</Button>
        </div>
      </div>
    </div>
  );
}
