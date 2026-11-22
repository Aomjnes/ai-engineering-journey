"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usePrefs } from "@/components/lf/prefs";
import { speakOnce } from "@/components/lesson/speech";

export interface DeckSummary {
  id: string;
  titleVi: string;
  titleEn: string;
  descVi: string;
  descEn: string;
  total: number;
  mastered: number;
}
type Next =
  | { deckId: string; done: true; mastered: number; total: number }
  | { deckId: string; done: false; mastered: number; total: number; item: { key: string; mode: "listen" | "translate"; cueVi: string; cueEn: string; ipa: string | null; audio: string | null; progress: number } };
interface AnswerResult {
  correct: boolean;
  answer: string;
  ipa: string | null;
  noteVi: string | null;
  progress: number;
  required: number;
  masteredNow: boolean;
}

export function FoundationMode({ decks, onChanged }: { decks: DeckSummary[]; onChanged: () => void }) {
  const { t, fmt, err, pick, lang } = usePrefs();
  const [deck, setDeck] = useState<string | null>(null);
  const [next, setNext] = useState<Next | null>(null);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shownAt = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (id: string) => {
      setError(null);
      setResult(null);
      setTyped("");
      try {
        const n = await api<Next>(`/api/practice/foundation?deck=${encodeURIComponent(id)}`);
        setNext(n);
        shownAt.current = Date.now();
        if (!n.done && n.item.audio) speakOnce(n.item.audio, 0.8);
        setTimeout(() => input.current?.focus(), 50);
      } catch (e) {
        setError(err(e));
      }
    },
    [err],
  );
  useEffect(() => {
    if (deck) void load(deck);
  }, [deck, load]);

  async function answer() {
    if (!next || next.done) return;
    setBusy(true);
    try {
      const r = await api<AnswerResult>("/api/practice/foundation", { deckId: next.deckId, key: next.item.key, typed, responseMs: Date.now() - shownAt.current });
      setResult(r);
      if (r.masteredNow) onChanged();
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  }

  if (!deck) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {decks.map((d) => (
          <button key={d.id} type="button" onClick={() => setDeck(d.id)} className="rounded-lg border border-line bg-card p-4 text-left transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-lift">
            <p className="text-[15px] font-semibold">{pick(d.titleEn, d.titleVi)}</p>
            <p className="mt-1 text-[13px] text-ink-3">{pick(d.descEn, d.descVi)}</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-mastered" style={{ width: `${(100 * d.mastered) / Math.max(d.total, 1)}%` }} /></div>
            <p className="num mt-1.5 text-[12px] text-ink-3">{fmt(t.practice.mastered, { n: d.mastered, total: d.total })}</p>
          </button>
        ))}
      </div>
    );
  }
  const info = decks.find((d) => d.id === deck);
  return (
    <div className="space-y-4">
      <button type="button" onClick={() => { setDeck(null); setNext(null); }} className="text-[13px] text-ink-3 hover:text-ink">← {t.practice.decks}</button>
      {info && <p className="text-[16px] font-semibold">{pick(info.titleEn, info.titleVi)}</p>}
      {next && <p className="num text-[12.5px] text-ink-3">{fmt(t.practice.mastered, { n: next.mastered, total: next.total })}</p>}
      {next?.done ? (
        <p className="rounded-lg border border-mastered/40 bg-mastered-wash p-4 text-[14px] font-medium text-mastered-ink">{t.practice.deckDone}</p>
      ) : next ? (
        <div className="rounded-lg border border-line bg-card p-5">
          <p className="eyebrow">{next.item.mode === "listen" ? t.practice.listenType : t.practice.translateType}</p>
          {next.item.mode === "listen" ? (
            <Button className="mt-3" variant="outline" onClick={() => next.item.audio && speakOnce(next.item.audio, 0.8)}><Volume2 aria-hidden /> {t.common.replay}</Button>
          ) : (
            <p className="mt-2 text-[22px] font-medium">{lang === "vi" ? next.item.cueVi : next.item.cueEn}</p>
          )}
          {next.item.mode === "listen" && lang === "vi" && <p className="mt-2 text-[13px] text-ink-3">{next.item.cueVi}</p>}
          <input
            ref={input}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (result) void load(deck);
                else if (typed.trim()) void answer();
              }
            }}
            onPaste={(e) => e.preventDefault()}
            disabled={busy || !!result}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            aria-label={t.practice.translateType}
            className="mt-4 w-full rounded-md border border-line bg-canvas px-3.5 py-3 font-serif text-[19px] outline-none focus:border-accent/60 focus:ring-4 focus:ring-accent/10"
          />
          {!result ? (
            <div className="mt-3 flex justify-end"><Button onClick={() => void answer()} disabled={busy || !typed.trim()}>{t.common.check}</Button></div>
          ) : (
            <div className={cn("mt-4 rounded-md p-4", result.correct ? "bg-mastered-wash" : "bg-critical-wash")}>
              <p className={cn("text-[14px] font-semibold", result.correct ? "text-mastered-ink" : "text-critical-ink")}>{result.correct ? t.practice.correct : t.practice.incorrect}</p>
              <p className="mt-1 font-serif text-[18px]">{fmt(t.practice.answerWas, { a: result.answer })} {result.ipa && <span className="font-mono text-[14px] text-accent-ink">{result.ipa}</span>}</p>
              {result.noteVi && lang === "vi" && <p className="mt-1 text-[13px] text-ink-2">{result.noteVi}</p>}
              <p className="num mt-2 text-[12px] text-ink-3">{result.masteredNow ? t.practice.masteredNow : fmt(t.practice.progressItem, { n: result.progress, req: result.required })}</p>
              <div className="mt-3 flex justify-end"><Button onClick={() => void load(deck)}>{t.common.next} →</Button></div>
            </div>
          )}
          {error && <p role="alert" className="mt-3 text-[13px] text-critical-ink">{error}</p>}
        </div>
      ) : null}
    </div>
  );
}
