"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Mic, Pause, Play, Volume2 } from "lucide-react";
import type { lessonView } from "@/lib/lessons/flow";
import type { Explanation } from "@/lib/explain/service";
import type { DiffSegment } from "@/lib/evaluation/spans";
import { api, errorMessage } from "@/lib/client/api";
import { countWords, splitSentences } from "@/lib/metrics/text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ExplainerDrawer } from "@/components/lesson/explainer";
import { useSpeechToText, useTts } from "@/components/lesson/speech";
import { cn } from "@/lib/utils";

type Lesson = Awaited<ReturnType<typeof lessonView>>;
const STAGES = ["INPUT", "COMPREHENSION", "PRODUCTION", "EXIT_TICKET", "COMPLETED"] as const;
const STAGE_LABEL: Record<(typeof STAGES)[number], string> = { INPUT: "1 · Input & shadowing", COMPREHENSION: "2 · Comprehension", PRODUCTION: "3 · Production", EXIT_TICKET: "4 · Exit ticket", COMPLETED: "Completed" };

interface EvalError {
  original: string;
  correction: string;
  subtype: string;
  severity: "CRITICAL" | "MODERATE" | "MINOR";
  category: string;
  ruleEn: string;
  ruleVi: string;
}

interface ProductionResult {
  blocked: boolean;
  reasons: string[];
  diff: DiffSegment[];
  errors: EvalError[];
  chunks: Array<{ chunk: string; present: boolean; counted: boolean; note: string }>;
  metrics: { gai: { gai: number; weightedErrorsPer100W: number }; lri: { lri: number } };
  verdictEn: string;
  verdictVi: string;
  nativeUpgrade: string;
  nextStage: string;
  session?: { composite: number; qualified: boolean; levelBefore: number; levelAfter: number };
}

function sevVariant(s: string) {
  return s === "CRITICAL" ? "critical" : s === "MODERATE" ? "moderate" : "minor";
}

function DictateButton({ onText }: { onText: (t: string) => void }) {
  const stt = useSpeechToText(onText);
  if (!stt.supported) return null;
  return (
    <Button type="button" variant={stt.listening ? "destructive" : "outline"} size="sm" onClick={stt.listening ? stt.stop : stt.start}>
      <Mic className="h-4 w-4" aria-hidden /> {stt.listening ? "Stop" : "Speak"}
    </Button>
  );
}

function ErrorList({ errors }: { errors: EvalError[] }) {
  if (errors.length === 0) return <p className="text-sm text-muted-foreground">No errors logged.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {errors.map((e, i) => (
        <li key={i} className="rounded border p-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={sevVariant(e.severity)}>{e.severity}</Badge>
            <span className="font-mono text-xs">{e.category} · {e.subtype}</span>
          </div>
          <p className="mt-1">
            <span className="text-destructive line-through">{e.original}</span> → <span className="font-semibold">{e.correction}</span>
          </p>
          <p className="text-xs text-muted-foreground">{e.ruleEn}</p>
          <p className="text-xs text-muted-foreground">{e.ruleVi}</p>
        </li>
      ))}
    </ul>
  );
}

function InlineDiff({ diff }: { diff: DiffSegment[] }) {
  return (
    <p className="reading whitespace-pre-wrap rounded border p-3 text-sm">
      {diff.map((d, i) =>
        d.type === "same" ? (
          <span key={i}>{d.text}</span>
        ) : (
          <span key={i}>
            <span className="bg-destructive/15 text-destructive line-through">{d.text}</span>
            <span className="bg-success/15 text-success"> {d.correction} </span>
          </span>
        ),
      )}
    </p>
  );
}

export default function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rate, setRate] = useState(1);
  const [showAuthentic, setShowAuthentic] = useState(false);
  const [explain, setExplain] = useState<{ selection: string; data: Explanation | null; loading: boolean; error: string | null } | null>(null);
  const [shadow, setShadow] = useState("");
  const [shadowResult, setShadowResult] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, { passed: boolean; text: string; errors?: EvalError[] }>>({});
  const [production, setProduction] = useState("");
  const [result, setResult] = useState<ProductionResult | null>(null);
  const [rewrite, setRewrite] = useState("");
  const [exit, setExit] = useState<Record<string, string>>({});
  const [exitResults, setExitResults] = useState<Array<{ chunkId: string; phrase: string; passed: boolean; reason: string | null }>>([]);
  const tts = useTts();

  const load = useCallback(async () => {
    try {
      setLesson(await api<Lesson>(`/api/lessons/${id}`));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  const text = lesson ? (showAuthentic ? lesson.authenticExcerpt : lesson.readingText) : "";
  const sentences = useMemo(() => splitSentences(text).map((s) => s.text), [text]);

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

  async function openExplainer(selection: string, context: string) {
    const sel = selection.trim();
    if (!sel) return;
    setExplain({ selection: sel, data: null, loading: true, error: null });
    try {
      const data = await api<Explanation>("/api/explain", { selection: sel.slice(0, 500), context });
      setExplain({ selection: sel, data, loading: false, error: null });
    } catch (e) {
      setExplain({ selection: sel, data: null, loading: false, error: errorMessage(e) });
    }
  }

  function onReadingMouseUp(context: string) {
    const sel = window.getSelection()?.toString() ?? "";
    if (sel.trim().split(/\s+/).length >= 1 && sel.trim().length >= 2) void openExplainer(sel, context);
  }

  if (error && !lesson) return <p className="text-destructive">{error}</p>;
  if (!lesson) return <p className="text-sm text-muted-foreground">Loading lesson…</p>;
  const stageIdx = STAGES.indexOf(lesson.stage as (typeof STAGES)[number]);
  const prodWords = countWords(result?.blocked ? rewrite : production);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/" className="text-xs text-muted-foreground hover:underline">← Dashboard</Link>
          <h1 className="text-lg font-semibold leading-snug">{lesson.article.title}</h1>
          <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
            <Badge variant="outline">{lesson.article.source}</Badge>
            <Badge>{lesson.isGraded ? "Graded bridge" : "Authentic text"}</Badge>
            <Badge variant="minor">D {lesson.difficulty.toFixed(1)}</Badge>
            <Badge variant="minor">~{Math.round(lesson.comprehensibility * 100)}% familiar words</Badge>
            <a href={lesson.article.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:underline">source</a>
          </div>
        </div>
        <ol className="flex flex-wrap gap-1 text-xs">
          {STAGES.map((s, i) => (
            <li key={s} className={cn("rounded px-2 py-1", i < stageIdx ? "bg-success/15 text-success" : i === stageIdx ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{STAGE_LABEL[s]}</li>
          ))}
        </ol>
      </div>
      {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr] [&>*]:min-w-0">
        {/* Reading pane */}
        <Card className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {tts.supported && (
                <>
                  <Button size="sm" variant="outline" onClick={() => (tts.speakingIndex === null ? tts.speak(sentences, rate) : tts.stop())}>
                    {tts.speakingIndex === null ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
                    {tts.speakingIndex === null ? "Listen" : "Stop"}
                  </Button>
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    Speed
                    <input type="range" min={0.6} max={1.4} step={0.1} value={rate} onChange={(e) => setRate(Number(e.target.value))} aria-label="Speech rate" />
                    <span className="w-8 tabular-nums">{rate.toFixed(1)}×</span>
                  </label>
                </>
              )}
            </div>
            {lesson.isGraded && (
              <Button size="sm" variant="ghost" onClick={() => setShowAuthentic((v) => !v)}>{showAuthentic ? "Show graded bridge" : "Show authentic original"}</Button>
            )}
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-xs text-muted-foreground">Click any sentence, or select any phrase, for the 4-mode explainer.</p>
            <div className="reading space-y-3 text-[15px]" onMouseUp={() => onReadingMouseUp(text)}>
              {text.split(/\n{2,}/).map((para, pi) => (
                <p key={pi}>
                  {splitSentences(para).map((s) => {
                    const idx = sentences.indexOf(s.text);
                    return (
                      <span
                        key={s.start}
                        className={cn("cursor-pointer rounded-sm hover:bg-muted", tts.speakingIndex === idx && "sentence-active")}
                        onClick={() => {
                          if (!window.getSelection()?.toString()) void openExplainer(s.text, para);
                        }}
                      >
                        {s.text}{" "}
                      </span>
                    );
                  })}
                </p>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Target chunks</h3>
              <ul className="space-y-1 text-sm">
                {lesson.chunks.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-baseline gap-1.5">
                    <button className="font-semibold hover:underline" onClick={() => void openExplainer(c.phrase, c.sourceSentence)}>{c.phrase}</button>
                    {c.isStretch && <Badge variant="moderate">stretch</Badge>}
                    <span className="text-muted-foreground">— {c.meaningVi}</span>
                  </li>
                ))}
              </ul>
              <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Grammar in the wild</h3>
              <ul className="space-y-2 text-sm">
                {(lesson.grammarInWild as Array<{ pattern: string; example: string; explanationEn: string; explanationVi: string }>).map((g) => (
                  <li key={g.pattern}>
                    <p className="font-semibold">{g.pattern}</p>
                    <p className="reading italic">{g.example}</p>
                    <p className="text-xs text-muted-foreground">{g.explanationEn}</p>
                    <p className="text-xs text-muted-foreground">{g.explanationVi}</p>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Stage pane */}
        <div className="flex flex-col gap-4">
          {lesson.stage === "INPUT" && (
            <Card>
              <CardHeader>
                <CardTitle>Shadowing check</CardTitle>
                <CardDescription>Read and listen first. Then play the hidden sentence and repeat it aloud (or type it). ≥ 80% word accuracy unlocks Stage 2.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {tts.supported && lesson.shadowSentence && (
                  <Button size="sm" variant="outline" onClick={() => tts.speak([lesson.shadowSentence as string], rate)}>
                    <Volume2 className="h-4 w-4" aria-hidden /> Play hidden sentence
                  </Button>
                )}
                {!tts.supported && <p className="text-xs text-warning">Your browser has no speech synthesis; shadow this sentence: “{lesson.shadowSentence}”</p>}
                <Textarea rows={3} value={shadow} onChange={(e) => setShadow(e.target.value)} onPaste={(e) => e.preventDefault()} placeholder="What you heard…" />
                <div className="flex gap-2">
                  <DictateButton onText={(t) => setShadow((s) => `${s} ${t}`.trim())} />
                  <Button
                    disabled={busy || countWords(shadow) < 3}
                    onClick={() =>
                      run(async () => {
                        const r = await api<{ passed: boolean; accuracy: number }>("/api/evaluate", { stage: "INPUT", lessonId: lesson.id, transcript: shadow });
                        setShadowResult(r.passed ? `Accuracy ${r.accuracy}%. Stage 2 unlocked.` : `Accuracy ${r.accuracy}% — below 80%. Listen again.`);
                        if (r.passed) await load();
                      })
                    }
                  >
                    Check
                  </Button>
                </div>
                {shadowResult && <p className="text-sm">{shadowResult}</p>}
              </CardContent>
            </Card>
          )}

          {lesson.stage === "COMPREHENSION" && (
            <Card>
              <CardHeader>
                <CardTitle>Deep comprehension</CardTitle>
                <CardDescription>Answer in your own words. Copying ≥ 65% of a source passage is rejected automatically and scores 0.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {lesson.questions.map((q) => (
                  <div key={q.id} className="space-y-1">
                    <p className="text-sm font-medium">
                      <Badge variant="outline" className="mr-1">{q.type}</Badge>
                      {q.prompt}
                    </p>
                    {q.passed ? (
                      <p className="text-sm text-success">Passed.</p>
                    ) : (
                      <>
                        <Textarea rows={3} value={answers[q.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} onPaste={(e) => e.preventDefault()} />
                        <Button
                          size="sm"
                          disabled={busy || countWords(answers[q.id] ?? "") < 5}
                          onClick={() =>
                            run(async () => {
                              const r = await api<{ passed: boolean; copyRejected: boolean; message?: string; verdictEn?: string; verdictVi?: string; errors?: EvalError[]; criteriaMet?: number; criteriaTotal?: number; nextStage?: string }>("/api/evaluate", {
                                stage: "COMPREHENSION",
                                lessonId: lesson.id,
                                questionId: q.id,
                                answer: answers[q.id] ?? "",
                              });
                              setFeedback((f) => ({
                                ...f,
                                [q.id]: { passed: r.passed, text: r.copyRejected ? (r.message ?? "Rejected.") : `${r.criteriaMet}/${r.criteriaTotal} criteria met. ${r.verdictEn ?? ""} ${r.verdictVi ?? ""}`, errors: r.errors },
                              }));
                              if (r.passed) await load();
                            })
                          }
                        >
                          Submit
                        </Button>
                      </>
                    )}
                    {feedback[q.id] && (
                      <div className={cn("rounded border p-2 text-sm", feedback[q.id]?.passed ? "border-success/40" : "border-destructive/40")}>
                        <p>{feedback[q.id]?.text}</p>
                        {(feedback[q.id]?.errors?.length ?? 0) > 0 && <ErrorList errors={feedback[q.id]?.errors ?? []} />}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {lesson.stage === "PRODUCTION" && (
            <Card>
              <CardHeader>
                <CardTitle>Active production</CardTitle>
                <CardDescription>{lesson.productionPrompt}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">Use at least 3 of: {lesson.chunks.map((c) => c.phrase).join(" · ")}</p>
                {!result && lesson.production.length === 0 && (
                  <>
                    <Textarea rows={9} value={production} onChange={(e) => setProduction(e.target.value)} onPaste={(e) => e.preventDefault()} spellCheck={false} />
                    <div className="flex items-center justify-between">
                      <span className="text-xs tabular-nums text-muted-foreground">{prodWords} words (60–220)</span>
                      <div className="flex gap-2">
                        <DictateButton onText={(t) => setProduction((s) => `${s} ${t}`.trim())} />
                        <Button
                          disabled={busy || prodWords < 60}
                          onClick={() =>
                            run(async () => {
                              const r = await api<ProductionResult>("/api/evaluate", { stage: "PRODUCTION", lessonId: lesson.id, text: production });
                              setResult(r);
                              setRewrite(production);
                              if (!r.blocked) await load();
                            })
                          }
                        >
                          {busy ? "Grading…" : "Submit for strict evaluation"}
                        </Button>
                      </div>
                    </div>
                  </>
                )}
                {!result && lesson.production.length > 0 && (
                  <>
                    <p className="text-sm text-destructive">Your last submission was blocked by the Error-Repair Gate. Rewrite it yourself.</p>
                    <Textarea rows={9} value={rewrite || (lesson.production[lesson.production.length - 1]?.text ?? "")} onChange={(e) => setRewrite(e.target.value)} onPaste={(e) => e.preventDefault()} spellCheck={false} />
                    <Button
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          const r = await api<ProductionResult>("/api/evaluate", { stage: "REWRITE", lessonId: lesson.id, text: rewrite || (lesson.production[lesson.production.length - 1]?.text ?? "") });
                          setResult(r);
                          if (!r.blocked) await load();
                        })
                      }
                    >
                      Submit rewrite
                    </Button>
                  </>
                )}
                {result && (
                  <div className="space-y-3">
                    {result.session && (
                      <p className="text-xs text-muted-foreground">
                        Session composite {result.session.composite.toFixed(1)} · {result.session.qualified ? "qualifying session" : "not qualifying"} · level {result.session.levelBefore.toFixed(1)} → {result.session.levelAfter.toFixed(1)}
                      </p>
                    )}
                    <div className={cn("rounded border p-3 text-sm", result.blocked ? "border-destructive/50 bg-destructive/5" : "border-success/50 bg-success/5")}>
                      <p className="font-semibold">{result.blocked ? "Progression blocked." : "Gate passed."}</p>
                      <ul className="list-disc pl-5">
                        {result.reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                      <p className="mt-1">{result.verdictEn}</p>
                      <p className="text-muted-foreground">{result.verdictVi}</p>
                      <p className="mt-1 text-xs tabular-nums text-muted-foreground">GAI {result.metrics.gai.gai.toFixed(1)} · {result.metrics.gai.weightedErrorsPer100W} weighted errors/100w · LRI {result.metrics.lri.lri.toFixed(1)}</p>
                    </div>
                    <InlineDiff diff={result.diff} />
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      {result.chunks.map((c) => (
                        <Badge key={c.chunk} variant={c.counted ? "success" : c.present ? "moderate" : "minor"} title={c.note}>{c.chunk}{c.counted ? " ✓" : c.present ? " (misused)" : ""}</Badge>
                      ))}
                    </div>
                    <ErrorList errors={result.errors} />
                    <details className="rounded border p-2 text-sm">
                      <summary className="cursor-pointer text-xs font-semibold">Native-level upgrade (study only — not copyable)</summary>
                      <p className="no-select reading mt-2" onCopy={(e) => e.preventDefault()}>{result.nativeUpgrade}</p>
                    </details>
                    {result.blocked && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Rewrite your text yourself. Pasting is disabled; pasting the upgrade is rejected.</p>
                        <Textarea rows={9} value={rewrite} onChange={(e) => setRewrite(e.target.value)} onPaste={(e) => e.preventDefault()} spellCheck={false} />
                        <div className="flex justify-end gap-2">
                          <DictateButton onText={(t) => setRewrite((s) => `${s} ${t}`.trim())} />
                          <Button
                            disabled={busy || countWords(rewrite) < 60}
                            onClick={() =>
                              run(async () => {
                                const r = await api<ProductionResult>("/api/evaluate", { stage: "REWRITE", lessonId: lesson.id, text: rewrite });
                                setResult(r);
                                if (!r.blocked) await load();
                              })
                            }
                          >
                            {busy ? "Grading…" : "Submit rewrite"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {lesson.stage === "EXIT_TICKET" && (
            <Card>
              <CardHeader>
                <CardTitle>Exit ticket & SRS lock-in</CardTitle>
                <CardDescription>One original, real-world sentence per chunk (about your life, not the article). Passed chunks enter your review deck.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {lesson.chunks
                  .filter((c) => !c.lockedIn)
                  .map((c) => {
                    const res = exitResults.find((r) => r.chunkId === c.id);
                    return (
                      <div key={c.id} className="space-y-1">
                        <label className="text-sm font-semibold" htmlFor={`exit-${c.id}`}>{c.phrase} <span className="font-normal text-muted-foreground">— {c.meaningVi}</span></label>
                        <input id={`exit-${c.id}`} className="w-full rounded-md border bg-card px-3 py-2 text-sm" value={exit[c.id] ?? ""} onChange={(e) => setExit((x) => ({ ...x, [c.id]: e.target.value }))} onPaste={(e) => e.preventDefault()} />
                        {res && !res.passed && <p className="text-xs text-destructive">{res.reason}</p>}
                      </div>
                    );
                  })}
                {lesson.chunks.some((c) => c.lockedIn) && <p className="text-xs text-success">Locked in: {lesson.chunks.filter((c) => c.lockedIn).map((c) => c.phrase).join(", ")}</p>}
                <Button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const pending = lesson.chunks.filter((c) => !c.lockedIn);
                      const r = await api<{ results: typeof exitResults }>("/api/evaluate", { stage: "EXIT_TICKET", lessonId: lesson.id, sentences: pending.map((c) => ({ chunkId: c.id, text: exit[c.id] ?? "" })) });
                      setExitResults(r.results);
                      await load();
                    })
                  }
                >
                  {busy ? "Grading…" : "Submit exit ticket"}
                </Button>
              </CardContent>
            </Card>
          )}

          {lesson.stage === "COMPLETED" && (
            <Card>
              <CardHeader>
                <CardTitle>Lesson completed</CardTitle>
                <CardDescription>All chunks are in your FSRS deck. Reviews are due from tomorrow.</CardDescription>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Link href="/graveyard"><Button variant="outline">Open SRS studio</Button></Link>
                <Link href="/"><Button>Dashboard</Button></Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      {explain && <ExplainerDrawer selection={explain.selection} data={explain.data} loading={explain.loading} error={explain.error} onClose={() => setExplain(null)} />}
    </div>
  );
}
