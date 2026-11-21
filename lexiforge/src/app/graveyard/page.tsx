"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Timer } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

interface DueCard {
  id: string;
  state: string;
  overdueDays: number;
  cueVi: string;
  cueEn: string;
  gapped: string;
}

interface GraveRow {
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

interface Status {
  locked: boolean;
  reasons: string[];
  overdueCards: number;
  errorDebt: number;
  top: Array<{ subtype: string; count: number; weight: number }>;
  detox: { startedAt: string; secondsRemaining: number; targets: Array<{ subtype: string; cleared: boolean }> } | null;
}

interface AccountabilityResponse {
  status: Status;
  graveyard: GraveRow[];
  examples: Record<string, Array<{ original: string; correction: string; ruleEn: string; ruleVi: string; severity: string; submission: { text: string } }>>;
}

function SrsStudio({ onReviewed }: { onReviewed: () => void }) {
  const [cards, setCards] = useState<DueCard[] | null>(null);
  const [typed, setTyped] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shownAt = useRef(0);

  const load = useCallback(async () => {
    try {
      const r = await api<{ cards: DueCard[] }>("/api/srs");
      setCards(r.cards);
      shownAt.current = Date.now();
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const card = cards?.[0];
  async function submit() {
    if (!card) return;
    try {
      const r = await api<{ ratingLabel: string; answer: string; nextDueAt: string }>("/api/srs", { cardId: card.id, typed, responseMs: Date.now() - shownAt.current });
      setFeedback(`${r.ratingLabel}. Answer: “${r.answer}”. Next review ${new Date(r.nextDueAt).toLocaleDateString()}.`);
      setTyped("");
      setCards((c) => (c ? c.slice(1) : c));
      shownAt.current = Date.now();
      onReviewed();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>SRS studio</CardTitle>
        <CardDescription>Type the missing chunk from memory. Grading is automatic: exact = Good (Easy if under 6 s), ≤ 2 typos = Hard, otherwise Again.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {cards === null && <p className="text-sm text-muted-foreground">Loading…</p>}
        {cards?.length === 0 && <p className="text-sm text-muted-foreground">No cards due. Retention is measured on your next scheduled reviews.</p>}
        {card && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{cards?.length} due{card.overdueDays > 0 ? ` · this card is ${card.overdueDays} day(s) overdue` : ""}</p>
            <p className="text-sm font-semibold">{card.cueVi}</p>
            <p className="text-xs text-muted-foreground">{card.cueEn}</p>
            <p className="reading">{card.gapped}</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
              className="flex gap-2"
            >
              <input className="flex-1 rounded-md border bg-card px-3 py-2 text-sm" value={typed} onChange={(e) => setTyped(e.target.value)} onPaste={(e) => e.preventDefault()} autoComplete="off" aria-label="Missing chunk" />
              <Button type="submit">Check</Button>
            </form>
          </div>
        )}
        {feedback && <p className="text-sm">{feedback}</p>}
      </CardContent>
    </Card>
  );
}

export default function GraveyardPage() {
  const [data, setData] = useState<AccountabilityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rewrites, setRewrites] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      setData(await api<AccountabilityResponse>("/api/accountability"));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function act(body: Record<string, unknown>, after?: (r: unknown) => void) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<unknown>("/api/accountability", body);
      after?.(r);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const status = data?.status;
  const detox = status?.detox;
  const remaining = detox ? Math.max(0, 300 - Math.floor((now - new Date(detox.startedAt).getTime()) / 1000)) : 0;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Error Graveyard & SRS studio</h1>
      {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      <Card id="detox" className={status?.locked ? "border-destructive/60" : undefined}>
        <CardHeader>
          <CardTitle>Error Detox</CardTitle>
          <CardDescription>
            {status ? `${status.overdueCards} overdue cards · recurring-error debt ${status.errorDebt}. ${status.locked ? "New lessons are LOCKED." : "Lessons unlocked."}` : "Loading…"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {status?.locked && (
            <ul className="list-disc pl-5 text-destructive">
              {status.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          {!detox && (
            <Button variant={status?.locked ? "destructive" : "outline"} disabled={busy || (status?.top.length ?? 0) === 0 && !status?.locked} onClick={() => act({ action: "start" })}>
              Start 5-minute Error Detox
            </Button>
          )}
          {detox && (
            <div className="space-y-4">
              <p className="flex items-center gap-1 tabular-nums">
                <Timer className="h-4 w-4" aria-hidden /> {remaining > 0 ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")} minimum remaining` : "Minimum time served."}
              </p>
              {detox.targets.length === 0 && <p className="text-muted-foreground">No recurring patterns to repair; review overdue cards below, then finish.</p>}
              {detox.targets.map((t) => (
                <div key={t.subtype} className="space-y-2 rounded border p-3">
                  <p className="font-mono text-xs">{t.subtype} {t.cleared && <Badge variant="success">cleared</Badge>}</p>
                  {!t.cleared && (
                    <>
                      <p className="text-muted-foreground">You keep making this mistake. Your own sentences:</p>
                      <ul className="space-y-1">
                        {(data?.examples[t.subtype] ?? []).map((e, i) => (
                          <li key={i} className="reading">
                            “{e.submission.text.slice(0, 220)}” — <span className="text-destructive line-through">{e.original}</span> ({e.ruleVi})
                          </li>
                        ))}
                      </ul>
                      <Textarea rows={3} placeholder="Rewrite these sentences correctly, in your own words." value={rewrites[t.subtype] ?? ""} onChange={(e) => setRewrites((r) => ({ ...r, [t.subtype]: e.target.value }))} onPaste={(e) => e.preventDefault()} />
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          act({ action: "rewrite", subtype: t.subtype, text: rewrites[t.subtype] ?? "" }, (r) => {
                            const res = r as { clean: boolean; verdictEn: string; repeated: Array<{ original: string; correction: string }> };
                            setResults((x) => ({ ...x, [t.subtype]: res.clean ? "Clean." : `Still wrong: ${res.repeated.map((e) => `“${e.original}” → “${e.correction}”`).join("; ") || res.verdictEn}` }));
                          })
                        }
                      >
                        Submit repair
                      </Button>
                      {results[t.subtype] && <p className="text-sm">{results[t.subtype]}</p>}
                    </>
                  )}
                </div>
              ))}
              <Button disabled={busy || remaining > 0 || detox.targets.some((t) => !t.cleared)} onClick={() => act({ action: "complete" })}>Finish detox</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <SrsStudio onReviewed={() => void load()} />

      <Card>
        <CardHeader>
          <CardTitle>Error Graveyard</CardTitle>
          <CardDescription>Every logged mistake, grouped by pattern. Half-life = days for the weighted error rate to halve (fit over sessions).</CardDescription>
        </CardHeader>
        <CardContent>
          {data && data.graveyard.length === 0 && <p className="text-sm text-muted-foreground">No errors logged yet.</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1">Pattern</th>
                  <th className="py-1 text-right">Count</th>
                  <th className="py-1 text-right">Open</th>
                  <th className="py-1">Severity</th>
                  <th className="py-1 text-right">Half-life</th>
                  <th className="py-1">Latest example</th>
                </tr>
              </thead>
              <tbody>
                {data?.graveyard.map((g) => (
                  <tr key={g.subtype} className="border-t align-top">
                    <td className="py-2 pr-2">
                      <p className="font-mono text-xs">{g.subtype}</p>
                      <p className="text-[11px] text-muted-foreground">{g.category}</p>
                    </td>
                    <td className="py-2 text-right tabular-nums">{g.count}</td>
                    <td className="py-2 text-right tabular-nums">{g.unresolved}</td>
                    <td className="py-2">
                      <div className="flex gap-1">
                        {g.severity.CRITICAL > 0 && <Badge variant="critical">{g.severity.CRITICAL} crit</Badge>}
                        {g.severity.MODERATE > 0 && <Badge variant="moderate">{g.severity.MODERATE} mod</Badge>}
                        {g.severity.MINOR > 0 && <Badge variant="minor">{g.severity.MINOR} min</Badge>}
                      </div>
                    </td>
                    <td className="py-2 text-right tabular-nums">{g.halfLifeDays === null ? "—" : typeof g.halfLifeDays === "number" ? `${g.halfLifeDays} d` : g.halfLifeDays}</td>
                    <td className="py-2">
                      {g.examples[0] && (
                        <p>
                          <span className="text-destructive line-through">{g.examples[0].original}</span> → {g.examples[0].correction}
                          <span className="block text-xs text-muted-foreground">{g.examples[0].ruleVi}</span>
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
