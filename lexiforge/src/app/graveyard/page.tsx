"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Check, CheckCircle2, ShieldAlert, Timer, X } from "lucide-react";
import { api } from "@/lib/client/api";
import { fmt, subtypeLabel, timeAgoIn, type Dict } from "@/lib/i18n";
import { countWords } from "@/lib/metrics/text";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/textarea";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, EVAL_PHASES, PhasedStatus } from "@/components/lf/states";
import { useCategoryLabel } from "@/components/lf/severity";
import { usePrefs } from "@/components/lf/prefs";
import { useCrossDeviceSync, useShell } from "@/components/lf/shell-data";
import { submitOnModEnter } from "@/components/lesson/common";

interface DueCard {
  id: string;
  mode: "context" | "nuance";
  state: string;
  overdueDays: number;
  cueVi: string;
  cueEn: string;
  gapped: string;
}
interface ReviewResult {
  ratingLabel: string;
  answer: string;
  typed: string;
  intervalDays: number;
  stability: number;
  retrievabilityAtReview: number;
}
interface Pattern {
  subtype: string;
  category: string;
  count: number;
  unresolved: number;
  weight: number;
  severity: { CRITICAL: number; MODERATE: number; MINOR: number };
  lastSeen: string | null;
  halfLifeDays: number | string | null;
  examples: Array<{ original: string; correction: string; ruleEn: string; ruleVi: string }>;
}
interface Example {
  original: string;
  correction: string;
  ruleEn: string;
  ruleVi: string;
  severity: string;
  submission: { text: string };
}
interface Status {
  locked: boolean;
  reasons: string[];
  overdueCards: number;
  errorDebt: number;
  top: Array<{ subtype: string; count: number }>;
  detox: { startedAt: string; secondsRemaining: number; targets: Array<{ subtype: string; cleared: boolean }> } | null;
}
interface AccountabilityResponse {
  status: Status;
  graveyard: Pattern[];
  examples: Record<string, Example[]>;
}

function statusOf(t: Dict, p: Pattern): { label: string; variant: "critical" | "moderate" | "mastered" | "neutral" } {
  if (p.unresolved === 0) return { label: t.graveyard.statusResolved, variant: "mastered" };
  if (p.halfLifeDays === "not decaying") return { label: t.graveyard.statusPersistent, variant: "critical" };
  if (typeof p.halfLifeDays === "number") return { label: t.graveyard.statusDecaying, variant: "moderate" };
  return { label: t.graveyard.statusWatching, variant: "neutral" };
}
const ratingText = (t: Dict, r: string) => (t.graveyard as Record<string, string>)[`rating${r}`] ?? r;

// ───────────────────────────── SRS ─────────────────────────────

function SrsQueue() {
  const { refresh } = useShell();
  const { t, err } = usePrefs();
  const [cards, setCards] = useState<DueCard[] | null>(null);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const shownAt = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ cards: DueCard[] }>("/api/srs");
      setCards(r.cards);
      shownAt.current = Date.now();
    } catch (e) {
      setError(err(e));
    }
  }, [err]);
  useEffect(() => {
    void load();
  }, [load]);
  useCrossDeviceSync(() => {
    if (!result) void load();
  });

  const card = cards?.[0];
  useEffect(() => {
    if (card && !result) inputRef.current?.focus();
  }, [card, result]);

  async function check() {
    if (!card || busy) return;
    setBusy(true);
    try {
      setResult(await api<ReviewResult>("/api/srs", { cardId: card.id, typed, responseMs: Date.now() - shownAt.current }));
      setReviewed((n) => n + 1);
      void refresh();
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  }
  function next() {
    setResult(null);
    setTyped("");
    setCards((c) => (c ? c.slice(1) : c));
    shownAt.current = Date.now();
  }

  if (error) return <p className="rounded-md bg-critical-wash p-3 text-[13px] text-critical-ink">{error}</p>;
  if (!cards) return <Skeleton className="mx-auto h-72 max-w-xl" />;
  if (!card)
    return (
      <EmptyState
        icon={<CheckCircle2 />}
        title={reviewed ? fmt(t.graveyard.queueCleared, { n: reviewed }) : t.graveyard.nothingDue}
        body={t.graveyard.nothingDueBody}
      />
    );

  const passed = result && result.ratingLabel !== "Again";
  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-3 flex items-center justify-between text-[12.5px] text-ink-3">
        <span className="tabular-nums">{fmt(t.graveyard.due, { n: cards.length })}{reviewed ? ` · ${fmt(t.graveyard.doneCount, { n: reviewed })}` : ""}</span>
        {card.overdueDays > 0 && <span className="tabular-nums text-moderate-ink">{fmt(t.graveyard.overdueDays, { n: card.overdueDays })}</span>}
      </div>
      <div className="rounded-lg border border-line bg-card p-6 shadow-lift">
        <p className="eyebrow">{card.mode === "context" ? t.graveyard.cueContext : t.graveyard.cueNuance}</p>
        <p className="mt-3 text-[15px] font-medium text-ink">{card.cueVi}</p>
        <p className="mt-0.5 text-[13px] text-ink-3">{card.cueEn}</p>
        {card.mode === "context" && <p className="mt-4 rounded-md bg-surface p-4 font-serif text-[18px] leading-relaxed text-ink">{card.gapped}</p>}
        {!result ? (
          <form
            className="mt-5 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void check();
            }}
          >
            <Input ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)} onPaste={(e) => e.preventDefault()} autoComplete="off" spellCheck={false} aria-label={t.graveyard.typeMemoryAria} placeholder={t.graveyard.typeMemory} className="font-serif text-[16px]" />
            <Button type="submit" disabled={busy}>{t.common.check}</Button>
          </form>
        ) : (
          <div className="animate-in mt-5 space-y-3">
            <div className={cn("flex items-start gap-2 rounded-md p-3 text-[14px]", passed ? "bg-mastered-wash" : "bg-critical-wash")}>
              {passed ? <Check className="mt-0.5 size-4 shrink-0 text-mastered-ink" aria-hidden /> : <X className="mt-0.5 size-4 shrink-0 text-critical-ink" aria-hidden />}
              <div>
                <p className={cn("font-semibold", passed ? "text-mastered-ink" : "text-critical-ink")}>{ratingText(t, result.ratingLabel)}</p>
                <p className="text-ink">
                  <span className="font-serif text-[16px]">{result.answer}</span>
                  {result.typed && result.typed.trim().toLowerCase() !== result.answer.toLowerCase() && <span className="ml-2 text-[13px] text-ink-3">{fmt(t.graveyard.youTyped, { t: result.typed })}</span>}
                </p>
              </div>
            </div>
            <p className="text-[12.5px] tabular-nums text-ink-3">
              {fmt(t.graveyard.nextReview, { when: result.intervalDays < 1 ? t.graveyard.in10 : fmt(t.graveyard.inDays, { n: result.intervalDays }), s: result.stability.toFixed(1), r: Math.round(result.retrievabilityAtReview * 100) })}
            </p>
            <Button onClick={next} autoFocus>{t.common.next} <ArrowRight aria-hidden /></Button>
          </div>
        )}
      </div>
      <p className="mt-3 text-center text-[12px] text-ink-3">{t.graveyard.ratingRule}</p>
    </div>
  );
}

// ───────────────────────────── Repair drill ─────────────────────────────

function RepairDrill({ pattern, onClose, onDone }: { pattern: Pattern; onClose: () => void; onDone: () => void }) {
  const { pick, t, err } = usePrefs();
  const [examples, setExamples] = useState<Example[] | null>(null);
  const [sentences, setSentences] = useState(["", "", ""]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ clean: boolean; verdictEn: string; verdictVi: string; repeated: Array<{ original: string; correction: string }> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ examples: Example[] }>("/api/accountability", { action: "examples", subtype: pattern.subtype })
      .then((r) => setExamples(r.examples))
      .catch((e) => setError(err(e)));
  }, [pattern.subtype, err]);

  const ready = sentences.every((s) => countWords(s) >= 4);
  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<typeof result & object>("/api/accountability", { action: "drill", subtype: pattern.subtype, sentences });
      setResult(r);
      if (r.clean) onDone();
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-in rounded-lg border border-line bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{t.graveyard.drillTitle}</p>
          <h3 className="mt-1 text-[16px] font-semibold">{subtypeLabel(t, pattern.subtype)}</h3>
          {pattern.examples[0] && <p className="mt-1 text-[13px] text-ink-2">{pick(pattern.examples[0].ruleEn, pattern.examples[0].ruleVi)}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label={t.graveyard.closeDrill} className="rounded p-1 text-ink-3 hover:bg-surface hover:text-ink"><X className="size-4" /></button>
      </div>
      <div className="mt-4">
        <p className="eyebrow mb-2">{t.graveyard.pastSentences}</p>
        {!examples ? (
          <Skeleton className="h-16" />
        ) : examples.length === 0 ? (
          <p className="text-[13px] text-ink-3">{t.graveyard.allResolved}</p>
        ) : (
          <ul className="space-y-1.5">
            {examples.map((e, i) => (
              <li key={i} className="rounded-md bg-surface px-3 py-2 font-serif text-[15px] text-ink-2">
                “{e.submission.text.length > 180 ? `${e.submission.text.slice(0, 180)}…` : e.submission.text}” <span className="font-sans text-[12.5px] text-critical-ink line-through">{e.original}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-4 space-y-2">
        {sentences.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="num w-5 text-[12px] text-ink-3">{i + 1}</span>
            <Input value={s} onChange={(e) => setSentences((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))} onPaste={(e) => e.preventDefault()} onKeyDown={submitOnModEnter(() => void submit())} disabled={busy} className="font-serif" aria-label={fmt(t.graveyard.repairAria, { n: i + 1 })} />
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <PhasedStatus className="flex-1" phases={EVAL_PHASES.slice(0, 3)} active={busy} />
        <Button className="ml-auto" onClick={() => void submit()} disabled={!ready || busy}>{busy ? t.graveyard.verifying : t.graveyard.verifyRepair}</Button>
      </div>
      {error && <p className="mt-3 rounded-md bg-critical-wash p-3 text-[13px] text-critical-ink">{error}</p>}
      {result && (
        <div className={cn("mt-3 rounded-md p-3 text-[13.5px]", result.clean ? "bg-mastered-wash text-mastered-ink" : "bg-critical-wash text-critical-ink")}>
          {result.clean ? t.graveyard.clean : fmt(t.graveyard.stillPresent, { list: result.repeated.map((r) => `“${r.original}” → “${r.correction}”`).join("; ") || pick(result.verdictEn, result.verdictVi) })}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────── Detox ─────────────────────────────

function DetoxPanel({ data, reload }: { data: AccountabilityResponse; reload: () => Promise<void> }) {
  const { pick, t: tr, err, lang } = usePrefs();
  const [now, setNow] = useState(() => Date.now());
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const s = data.status;
  const detox = s.detox;
  const remaining = detox ? Math.max(0, 300 - Math.floor((now - new Date(detox.startedAt).getTime()) / 1000)) : 300;

  async function act(key: string, body: Record<string, unknown>, after?: (r: unknown) => void) {
    setBusy(key);
    setError(null);
    try {
      const r = await api<unknown>("/api/accountability", body);
      after?.(r);
      await reload();
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="detox-title" className="rounded-lg border border-line border-l-[3px] border-l-critical bg-card p-5">
      <div className="flex flex-wrap items-start gap-4">
        <ShieldAlert className="size-5 text-critical" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="detox-title" className="text-[15px] font-semibold">{tr.graveyard.detoxTitle}</h2>
          <p className="mt-0.5 text-[13px] tabular-nums text-ink-2">{fmt(tr.graveyard.detoxLine, { n: s.overdueCards, d: s.errorDebt })}{s.locked ? ` · ${tr.graveyard.detoxLocked}` : ""}</p>
          {lang === "en" && s.reasons.length > 0 && <p className="mt-1 text-[12.5px] text-ink-3">{s.reasons.join(" ")}</p>}
        </div>
        {detox ? (
          <span className="num flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-[13px]">
            <Timer className="size-3.5" aria-hidden />
            {remaining > 0 ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}` : tr.graveyard.timeServed}
          </span>
        ) : (
          <Button variant="danger" onClick={() => void act("start", { action: "start" })} disabled={busy !== null}>{tr.graveyard.startDetox}</Button>
        )}
      </div>
      {detox && (
        <div className="mt-5 space-y-4">
          {detox.targets.length === 0 && <p className="text-[13.5px] text-ink-2">{tr.graveyard.noTargets}</p>}
          {detox.targets.map((t) => (
            <div key={t.subtype} className={cn("rounded-md border p-4", t.cleared ? "border-mastered/30 bg-mastered-wash/40" : "border-line")}>
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold">{subtypeLabel(tr, t.subtype)}</span>
                {t.cleared && <Badge variant="mastered"><Check aria-hidden />{tr.graveyard.cleared}</Badge>}
              </div>
              {!t.cleared && (
                <>
                  <p className="mt-1 text-[13px] text-ink-2">{tr.graveyard.keepMaking}</p>
                  <ul className="mt-2 space-y-1.5">
                    {(data.examples[t.subtype] ?? []).map((e, i) => (
                      <li key={i} className="rounded bg-surface px-3 py-2 font-serif text-[14.5px] text-ink-2">
                        “{e.submission.text.slice(0, 200)}” — <span className="font-sans text-[12.5px] text-critical-ink line-through">{e.original}</span> <span className="font-sans text-[12.5px] text-ink-3">{pick(e.ruleEn, e.ruleVi)}</span>
                      </li>
                    ))}
                  </ul>
                  <Textarea rows={3} className="mt-3 font-serif" placeholder={tr.graveyard.rewritePlaceholder} value={texts[t.subtype] ?? ""} onChange={(e) => setTexts((x) => ({ ...x, [t.subtype]: e.target.value }))} onPaste={(e) => e.preventDefault()} disabled={busy !== null} />
                  <div className="mt-2 flex items-center gap-3">
                    <PhasedStatus className="flex-1" phases={EVAL_PHASES.slice(0, 3)} active={busy === t.subtype} />
                    <Button
                      size="sm"
                      className="ml-auto"
                      disabled={busy !== null || countWords(texts[t.subtype] ?? "") < 8}
                      onClick={() =>
                        void act(t.subtype, { action: "rewrite", subtype: t.subtype, text: texts[t.subtype] ?? "" }, (r) => {
                          const res = r as { clean: boolean; repeated: Array<{ original: string; correction: string }> };
                          setNotes((n) => ({ ...n, [t.subtype]: res.clean ? "" : fmt(tr.graveyard.stillWrong, { list: res.repeated.map((x) => `“${x.original}” → “${x.correction}”`).join("; ") || tr.graveyard.gateBlocked }) }));
                        })
                      }
                    >
                      {tr.graveyard.submitRepair}
                    </Button>
                  </div>
                  {notes[t.subtype] && <p className="mt-2 text-[13px] text-critical-ink">{notes[t.subtype]}</p>}
                </>
              )}
            </div>
          ))}
          <div className="flex items-center justify-end gap-3">
            {remaining > 0 && <span className="text-[12.5px] text-ink-3">{tr.graveyard.minFive}</span>}
            <Button onClick={() => void act("complete", { action: "complete" })} disabled={busy !== null || remaining > 0 || detox.targets.some((t) => !t.cleared)}>{tr.graveyard.finish}</Button>
          </div>
        </div>
      )}
      {error && <p className="mt-3 rounded-md bg-critical-wash p-3 text-[13px] text-critical-ink">{error}</p>}
    </section>
  );
}

// ───────────────────────────── Page ─────────────────────────────

function GraveyardInner() {
  const params = useSearchParams();
  const { status: shell } = useShell();
  const { t, err } = usePrefs();
  const categoryLabel = useCategoryLabel();
  const [tab, setTab] = useState<"srs" | "patterns">(params.get("tab") === "patterns" ? "patterns" : "srs");
  const [data, setData] = useState<AccountabilityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drill, setDrill] = useState<Pattern | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<AccountabilityResponse>("/api/accountability"));
    } catch (e) {
      setError(err(e));
    }
  }, [err]);
  useEffect(() => {
    void load();
  }, [load]);
  useCrossDeviceSync(load);

  const showDetox = data && (data.status.locked || data.status.detox || params.get("tab") === "detox");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{t.graveyard.eyebrow}</p>
          <h1 className="mt-1 font-serif text-[30px] font-medium leading-tight tracking-[-0.015em]">{t.graveyard.title}</h1>
          <p className="mt-1 text-[14px] text-ink-2">{t.graveyard.sub}</p>
        </div>
        <Segmented
          label={t.graveyard.view}
          value={tab}
          onChange={setTab}
          options={[
            { value: "srs", label: <span className="tabular-nums">{t.graveyard.tabSrs}{shell?.dueCards ? ` · ${shell.dueCards}` : ""}</span> },
            { value: "patterns", label: t.graveyard.tabPatterns },
          ]}
        />
      </header>
      {error && <p className="rounded-md bg-critical-wash p-3 text-[13px] text-critical-ink">{error}</p>}
      {showDetox && data && <DetoxPanel data={data} reload={load} />}

      {tab === "srs" && <SrsQueue />}

      {tab === "patterns" && (
        <div className="space-y-4">
          {drill && (
            <RepairDrill
              key={drill.subtype}
              pattern={drill}
              onClose={() => setDrill(null)}
              onDone={() => void load()}
            />
          )}
          {!data ? (
            <Skeleton className="h-64" />
          ) : data.graveyard.length === 0 ? (
            <EmptyState title={t.graveyard.noErrors} body={t.graveyard.noErrorsBody} />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line bg-card">
              <table className="w-full min-w-[720px] text-[13.5px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11.5px] uppercase tracking-wider text-ink-3">
                    <th className="px-4 py-2.5 font-semibold">{t.graveyard.colPattern}</th>
                    <th className="px-3 py-2.5 text-right font-semibold">{t.graveyard.colCount}</th>
                    <th className="px-3 py-2.5 text-right font-semibold">{t.graveyard.colOpen}</th>
                    <th className="px-3 py-2.5 text-right font-semibold">{t.graveyard.colHalfLife}</th>
                    <th className="px-3 py-2.5 font-semibold">{t.graveyard.colStatus}</th>
                    <th className="px-3 py-2.5 font-semibold">{t.graveyard.colLastSeen}</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {data.graveyard.map((p) => {
                    const st = statusOf(t, p);
                    const ex = p.examples[0];
                    return (
                      <tr key={p.subtype} className={cn("border-b border-line last:border-0", drill?.subtype === p.subtype && "bg-surface")}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-ink">
                            {subtypeLabel(t, p.subtype)}
                            {ex && <span className="ml-1.5 font-serif font-normal text-ink-3">(“{ex.original}”)</span>}
                          </p>
                          <p className="text-[12px] text-ink-3">{categoryLabel(p.category)} · {fmt(t.graveyard.severityCounts, { c: p.severity.CRITICAL, m: p.severity.MODERATE, n: p.severity.MINOR })}</p>
                        </td>
                        <td className="num px-3 py-3 text-right">{p.count}</td>
                        <td className="num px-3 py-3 text-right">{p.unresolved}</td>
                        <td className="num px-3 py-3 text-right text-ink-2">{p.halfLifeDays === null ? "—" : typeof p.halfLifeDays === "number" ? fmt(t.graveyard.days, { n: p.halfLifeDays }) : "∞"}</td>
                        <td className="px-3 py-3"><Badge variant={st.variant}>{st.label}</Badge></td>
                        <td className="num px-3 py-3 text-ink-3">{timeAgoIn(t, p.lastSeen)}</td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="outline" onClick={() => { setDrill(p); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{t.graveyard.repair}</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[12.5px] text-ink-3">{t.graveyard.halfLifeNote}</p>
        </div>
      )}
    </div>
  );
}

export default function GraveyardPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <GraveyardInner />
    </Suspense>
  );
}
