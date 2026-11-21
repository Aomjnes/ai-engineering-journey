"use client";

import { useState } from "react";
import Link from "next/link";
import { api, errorMessage } from "@/lib/client/api";
import { countWords } from "@/lib/metrics/text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Band Promotion Audit</h1>
        <p className="text-sm text-muted-foreground">Zero hints, no explainer, no dictation. Next-band text. Pass = audit composite at the target threshold with zero critical errors.</p>
      </div>
      {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {!audit && !result && (
        <Button disabled={busy} onClick={() => run(async () => setAudit(await api<Audit>("/api/diagnostic", { action: "start", kind: "PROMOTION" })))}>
          {busy ? "Preparing audit…" : "Start audit"}
        </Button>
      )}
      {audit && !result && (
        <>
          <Card>
            <CardHeader><CardDescription>Target: {audit.targetBand}</CardDescription></CardHeader>
            <CardContent><p className="reading whitespace-pre-wrap no-select">{audit.excerpt}</p></CardContent>
          </Card>
          {audit.questions.map((q) => (
            <div key={q.id} className="space-y-1">
              <p className="text-sm font-medium">{q.prompt}</p>
              <Textarea rows={3} value={answers[q.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} onPaste={(e) => e.preventDefault()} />
            </div>
          ))}
          <div className="space-y-1">
            <p className="text-sm font-medium">{audit.writingPrompt}</p>
            <Textarea rows={8} value={writing} onChange={(e) => setWriting(e.target.value)} onPaste={(e) => e.preventDefault()} spellCheck={false} />
            <p className="text-xs tabular-nums text-muted-foreground">{countWords(writing)} words (60–220)</p>
          </div>
          <Button
            disabled={busy}
            onClick={() =>
              run(async () =>
                setResult(
                  await api<AuditResult>("/api/diagnostic", {
                    action: "submitPromotion",
                    assessmentId: audit.assessmentId,
                    answers: audit.questions.map((q) => ({ questionId: q.id, text: answers[q.id] ?? "" })),
                    writing,
                  }),
                ),
              )
            }
          >
            {busy ? "Grading…" : "Submit audit"}
          </Button>
        </>
      )}
      {result && (
        <Card className={result.passed ? "border-success/60" : "border-destructive/60"}>
          <CardHeader>
            <CardTitle>{result.passed ? `Promoted to ${result.targetBand}.` : `Not promoted. You remain at ${result.currentBand}.`}</CardTitle>
            <CardDescription>
              Audit composite {result.auditComposite.toFixed(1)} (required {result.requiredComposite}) · critical errors {result.criticalErrors} · CPR {result.cpr.toFixed(1)} · GAI {result.gai.gai.toFixed(1)} · LRI {result.lri.lri.toFixed(1)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{result.writing.verdictEn}</p>
            <p className="text-muted-foreground">{result.writing.verdictVi}</p>
            {!result.passed && <p>The qualifying-session counter has been reset to 0. Five new consecutive qualifying sessions are required before the next audit.</p>}
            <Link href="/"><Button>Dashboard</Button></Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
