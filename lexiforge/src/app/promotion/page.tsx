"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, ShieldX } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { countWords } from "@/lib/metrics/text";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EVAL_PHASES, PhasedStatus } from "@/components/lf/states";
import { usePrefs } from "@/components/lf/prefs";
import { useShell } from "@/components/lf/shell-data";

interface Audit {
  assessmentId: string;
  targetBand: string;
  excerpt: string;
  questions: Array<{ id: string; prompt: string }>;
  writingPrompt: string;
}
interface AuditResult {
  passed: boolean;
  targetBand: string;
  currentBand: string;
  auditComposite: number;
  requiredComposite: number;
  criticalErrors: number;
  cpr: number;
  gai: { gai: number };
  lri: { lri: number };
  writing: { verdictEn: string; verdictVi: string };
}

export default function PromotionPage() {
  const { pick } = usePrefs();
  const { refresh } = useShell();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [writing, setWriting] = useState("");
  const [result, setResult] = useState<AuditResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const words = countWords(writing);
  const ready = audit ? audit.questions.every((q) => countWords(answers[q.id] ?? "") >= 5) && words >= 60 && words <= 220 : false;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <p className="eyebrow">Band promotion audit</p>
        <h1 className="mt-1 font-serif text-[30px] font-medium tracking-[-0.015em]">Zero hints. Next-band text.</h1>
        <p className="mt-1 text-[14px] text-ink-2">No explainer, no dictation, no reference. You pass when the audit composite reaches the target band&apos;s threshold with zero critical errors.</p>
      </header>
      {error && <p className="rounded-md bg-critical-wash p-3 text-[13px] text-critical-ink">{error}</p>}
      {!audit && !result && (
        <div className="rounded-lg border border-line bg-card p-6">
          <p className="text-[14px] text-ink-2">The audit takes about 25 minutes. It cannot be paused once started — an unfinished audit stays open until you submit.</p>
          <Button className="mt-4" onClick={() => void run(async () => setAudit(await api<Audit>("/api/diagnostic", { action: "start", kind: "PROMOTION" })))} disabled={busy}>
            {busy ? "Preparing audit…" : "Start audit"}
          </Button>
        </div>
      )}
      {audit && !result && (
        <>
          <article className="rounded-lg border border-line bg-card p-6">
            <p className="eyebrow mb-3">Target {audit.targetBand}</p>
            <div className="reading no-select whitespace-pre-wrap text-ink">{audit.excerpt}</div>
          </article>
          {audit.questions.map((q, i) => (
            <div key={q.id}>
              <label htmlFor={`pa-${q.id}`} className="text-[15px] font-medium"><span className="num mr-2 text-ink-3">{i + 1}.</span>{q.prompt}</label>
              <Textarea id={`pa-${q.id}`} className="mt-2" rows={3} value={answers[q.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} onPaste={(e) => e.preventDefault()} disabled={busy} />
            </div>
          ))}
          <div>
            <label htmlFor="pa-writing" className="text-[15px] font-medium">{audit.writingPrompt}</label>
            <Textarea id="pa-writing" className="mt-2 font-serif text-[17px] leading-[1.8]" rows={9} value={writing} onChange={(e) => setWriting(e.target.value)} onPaste={(e) => e.preventDefault()} spellCheck={false} disabled={busy} />
            <p className={cn("num mt-1.5 text-[12.5px]", words < 60 || words > 220 ? "text-moderate-ink" : "text-ink-3")}>{words} / 60–220 words</p>
          </div>
          <PhasedStatus phases={EVAL_PHASES} active={busy} />
          <div className="flex justify-end">
            <Button
              disabled={busy || !ready}
              onClick={() =>
                void run(async () => {
                  setResult(await api<AuditResult>("/api/diagnostic", { action: "submitPromotion", assessmentId: audit.assessmentId, answers: audit.questions.map((q) => ({ questionId: q.id, text: answers[q.id] ?? "" })), writing }));
                  await refresh();
                })
              }
            >
              {busy ? "Grading…" : "Submit audit"}
            </Button>
          </div>
        </>
      )}
      {result && (
        <div className={cn("animate-in rounded-lg border bg-card p-6", result.passed ? "border-mastered/40" : "border-critical/40")}>
          <div className="flex items-center gap-3">
            {result.passed ? <ShieldCheck className="size-7 text-mastered" aria-hidden /> : <ShieldX className="size-7 text-critical" aria-hidden />}
            <h2 className="font-serif text-[24px] font-medium">{result.passed ? `Promoted to ${result.targetBand}.` : `Not promoted. You remain at ${result.currentBand}.`}</h2>
          </div>
          <dl className="num mt-5 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
            <div><dt className="text-ink-3">Composite</dt><dd className="text-[18px] font-semibold">{result.auditComposite.toFixed(1)}<span className="text-[12px] font-normal text-ink-3"> / {result.requiredComposite}</span></dd></div>
            <div><dt className="text-ink-3">Critical errors</dt><dd className={cn("text-[18px] font-semibold", result.criticalErrors ? "text-critical-ink" : "")}>{result.criticalErrors}</dd></div>
            <div><dt className="text-ink-3">CPR</dt><dd className="text-[18px] font-semibold">{result.cpr.toFixed(1)}</dd></div>
            <div><dt className="text-ink-3">GAI · LRI</dt><dd className="text-[18px] font-semibold">{result.gai.gai.toFixed(0)} · {result.lri.lri.toFixed(0)}</dd></div>
          </dl>
          <p className="mt-5 text-[14px] text-ink">{pick(result.writing.verdictEn, result.writing.verdictVi)}</p>
          {!result.passed && <p className="mt-2 text-[13px] text-ink-3">The qualifying-session counter was reset. Five new consecutive qualifying sessions unlock the next audit.</p>}
          <Link href="/" className={cn(buttonVariants({ variant: "primary" }), "mt-5")}>Back to Today</Link>
        </div>
      )}
    </div>
  );
}
