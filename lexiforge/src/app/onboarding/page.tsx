"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/client/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { SkillRadar } from "@/components/charts";
import { countWords } from "@/lib/metrics/text";

type Item =
  | { part: "READING"; id: string; title: string; text: string; questions: Array<{ id: string; type: string; prompt: string; options: string[] }>; progress: { served: number; total: number } }
  | { part: "ERRORS"; id: string; segments: string[]; progress: { served: number; total: number } }
  | { part: "WRITING"; id: string; prompt: string; minWords: number; maxWords: number };

interface Step {
  assessmentId: string;
  part: "READING" | "ERRORS" | "WRITING" | "DONE";
  item: Item | null;
}

interface Report {
  subBand: string;
  ielts: { band: number; low: number; high: number; halfWidth: number };
  level: number;
  parts: { reading: { accuracy: number }; errorDetection: { accuracy: number; missedTraps: string[] }; writing: { level: number; gai: { gai: number; weightedErrorsPer100W: number }; lri: { lri: number } } };
  metrics: { gai: number; lri: number; cpr: number; composite: number };
  topWeaknesses: string[];
  writingFeedback: { errors: Array<{ original: string; correction: string; subtype: string; severity: string; ruleVi: string }>; verdictEn: string; verdictVi: string };
}

const PART_LABEL = { READING: "Part 1 · Authentic reading & nuance", ERRORS: "Part 2 · Error detection & collocation audit", WRITING: "Part 3 · Unassisted writing sample", DONE: "Done" };

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step | null>(null);
  const [choices, setChoices] = useState<Record<string, number>>({});
  const [writing, setWriting] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    void (async () => {
      try {
        const s = await api<{ calibrated: boolean; placement: Step | null }>("/api/diagnostic");
        if (s.placement) {
          setStep(s.placement);
          setStartedAt(Date.now());
        } else if (s.calibrated) router.replace("/");
      } catch (e) {
        setError(errorMessage(e));
      }
    })();
  }, [router]);

  useEffect(() => {
    if (!startedAt || report) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [startedAt, report]);

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(errorMessage(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  const begin = () =>
    run(async () => {
      setStep(await api<Step>("/api/diagnostic", { action: "start", kind: "PLACEMENT" }));
      setStartedAt(Date.now());
    });

  const answer = (body: Record<string, unknown>) =>
    run(async () => {
      if (!step) return;
      setStep(await api<Step>("/api/diagnostic", { action: "answer", assessmentId: step.assessmentId, ...body }));
      setChoices({});
    });

  const submitWriting = () =>
    run(async () => {
      if (!step) return;
      const r = await api<{ report: Report }>("/api/diagnostic", { action: "write", assessmentId: step.assessmentId, text: writing });
      setReport(r.report);
    });

  const words = useMemo(() => countWords(writing), [writing]);
  const item = step?.item ?? null;
  const mmss = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  if (report) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <h1 className="text-xl font-semibold">Baseline report</h1>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader><CardDescription>CEFR sub-band</CardDescription><CardTitle className="text-3xl">{report.subBand}</CardTitle></CardHeader>
            <CardContent className="text-xs text-muted-foreground">Ability level {report.level.toFixed(1)} / 100</CardContent>
          </Card>
          <Card>
            <CardHeader><CardDescription>Estimated IELTS band (diagnostic equivalent)</CardDescription><CardTitle className="text-3xl">{report.ielts.band.toFixed(1)}</CardTitle></CardHeader>
            <CardContent className="text-xs text-muted-foreground">Interval {report.ielts.low}–{report.ielts.high}. Wide because one audit is limited evidence; it narrows as you work.</CardContent>
          </Card>
          <Card>
            <CardHeader><CardDescription>Part scores</CardDescription></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>Reading accuracy {report.parts.reading.accuracy.toFixed(0)}%</p>
              <p>Error detection {report.parts.errorDetection.accuracy.toFixed(0)}%</p>
              <p>Writing: GAI {report.parts.writing.gai.gai.toFixed(1)}, LRI {report.parts.writing.lri.lri.toFixed(1)}</p>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader><CardTitle>Baseline skill radar</CardTitle><CardDescription>RSS and ERI need review history and repeated sessions; they start without evidence.</CardDescription></CardHeader>
          <CardContent>
            <SkillRadar
              data={[
                { metric: "GAI", value: report.metrics.gai, hasEvidence: true },
                { metric: "LRI", value: report.metrics.lri, hasEvidence: true },
                { metric: "CPR", value: report.metrics.cpr, hasEvidence: true },
                { metric: "RSS", value: 0, hasEvidence: false },
                { metric: "ERI", value: 0, hasEvidence: false },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Top initial weaknesses</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-1.5">{report.topWeaknesses.map((w) => <Badge key={w} variant="moderate">{w}</Badge>)}</div>
            <p>{report.writingFeedback.verdictEn}</p>
            <p className="text-muted-foreground">{report.writingFeedback.verdictVi}</p>
            <ul className="space-y-1">
              {report.writingFeedback.errors.map((e, i) => (
                <li key={i}>
                  <Badge variant={e.severity === "CRITICAL" ? "critical" : e.severity === "MODERATE" ? "moderate" : "minor"}>{e.severity}</Badge>{" "}
                  <span className="line-through decoration-destructive">{e.original}</span> → <span className="font-medium">{e.correction}</span>{" "}
                  <span className="text-muted-foreground">({e.subtype}) {e.ruleVi}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Button onClick={() => router.push("/")}>Go to dashboard</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Placement audit</h1>
        <p className="text-sm text-muted-foreground">Levels are measured, never self-reported. Three parts, about 20 minutes. No dictionaries, no translators.</p>
      </div>
      {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {!step && (
        <Card>
          <CardContent className="space-y-3 pt-4 text-sm">
            <p>1. Short authentic passages, adaptive from A2 to C1. 2. Error detection with Vietnamese-speaker traps. 3. An 80–120 word writing sample graded by the strict engine.</p>
            <Button onClick={begin} disabled={busy}>Begin audit</Button>
          </CardContent>
        </Card>
      )}
      {step && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{PART_LABEL[step.part]}</span>
          <span className="tabular-nums">
            {item && "progress" in item ? `${item.progress.served}/${item.progress.total} · ` : ""}
            {mmss}
          </span>
        </div>
      )}
      {item?.part === "READING" && (
        <Card>
          <CardHeader><CardTitle>{item.title}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="reading">{item.text}</p>
            {item.questions.map((q) => (
              <fieldset key={q.id} className="space-y-1">
                <legend className="text-sm font-medium">{q.prompt}</legend>
                {q.options.map((o, i) => (
                  <label key={o} className="flex items-center gap-2 text-sm">
                    <input type="radio" name={q.id} checked={choices[q.id] === i} onChange={() => setChoices((c) => ({ ...c, [q.id]: i }))} />
                    {o}
                  </label>
                ))}
              </fieldset>
            ))}
            <Button disabled={busy || item.questions.some((q) => choices[q.id] === undefined)} onClick={() => answer({ itemId: item.id, choices: item.questions.map((q) => choices[q.id]) })}>
              Submit answers
            </Button>
          </CardContent>
        </Card>
      )}
      {item?.part === "ERRORS" && (
        <Card>
          <CardHeader><CardDescription>Which segment contains an error? Choose “No error” if the sentence is correct.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <p className="reading text-lg">
              {item.segments.map((s, i) => (
                <span key={i}>
                  <span className="underline decoration-dotted underline-offset-4">{s}</span>
                  <sup className="px-0.5 text-xs text-muted-foreground">{"ABCD"[i]}</sup>{" "}
                </span>
              ))}
            </p>
            <div className="flex flex-wrap gap-2">
              {["A", "B", "C", "D", "No error"].map((label, i) => (
                <Button key={label} variant="outline" disabled={busy} onClick={() => answer({ itemId: item.id, choice: i })}>{label}</Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      {item?.part === "WRITING" && (
        <Card>
          <CardHeader><CardTitle>{item.prompt}</CardTitle><CardDescription>Unassisted. Pasting is disabled.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            <Textarea value={writing} onChange={(e) => setWriting(e.target.value)} onPaste={(e) => e.preventDefault()} rows={10} spellCheck={false} autoCorrect="off" />
            <div className="flex items-center justify-between">
              <span className={`text-xs tabular-nums ${words < item.minWords || words > item.maxWords ? "text-warning" : "text-muted-foreground"}`}>{words} words (80–120 target)</span>
              <Button disabled={busy || words < item.minWords || words > item.maxWords} onClick={submitWriting}>{busy ? "Grading…" : "Submit for grading"}</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
