"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Lock } from "lucide-react";
import { api } from "@/lib/client/api";
import { fmt, type Dict } from "@/lib/i18n";
import { signed } from "@/lib/client/format";
import { countWords } from "@/lib/metrics/text";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/textarea";
import { EVAL_PHASES, PhasedStatus } from "@/components/lf/states";
import { usePrefs } from "@/components/lf/prefs";
import { ModEnterHint, submitOnModEnter } from "./common";

interface Chunk {
  id: string;
  phrase: string;
  meaningEn: string;
  meaningVi: string;
  lockedIn: boolean;
}

type ResultRow = { chunkId: string; phrase: string; passed: boolean; reason: string | null; reasonCode?: "COPIED" | "MISSING" | "MISUSED" | "FIX" | null; detail?: string | null };

function reasonText(t: Dict, r: ResultRow): string | null {
  if (!r.reasonCode) return r.reason;
  return fmt(t.exit[r.reasonCode], { p: r.phrase, d: r.detail ?? "" });
}

export function ExitTicketStage({ lessonId, chunks, onChange, minWords = 5 }: { lessonId: string; chunks: Chunk[]; onChange: () => Promise<void>; minWords?: number }) {
  const { pick, t, err } = usePrefs();
  const [values, setValues] = useState<Record<string, string>>({});
  const [results, setResults] = useState<ResultRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = chunks.filter((c) => !c.lockedIn);
  const ready = pending.every((c) => countWords(values[c.id] ?? "") >= minWords);

  async function submit() {
    if (busy || !ready) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ results: ResultRow[] }>("/api/evaluate", { stage: "EXIT_TICKET", lessonId, sentences: pending.map((c) => ({ chunkId: c.id, text: values[c.id] ?? "" })) });
      setResults(r.results);
      await onChange();
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <p className="eyebrow">{t.exit.eyebrow}</p>
        <h2 className="mt-1 font-serif text-[26px] font-medium tracking-[-0.01em]">{t.exit.title}</h2>
        <p className="mt-1 text-[13.5px] text-ink-2">{t.exit.sub}</p>
      </div>
      <ol className="space-y-2.5">
        {chunks.map((c, i) => {
          const res = results.find((r) => r.chunkId === c.id);
          return (
            <li key={c.id} className={cn("rounded-lg border bg-card p-4", c.lockedIn ? "border-mastered/30" : res && !res.passed ? "border-critical/30" : "border-line")}>
              <div className="flex items-baseline gap-2">
                <span className="num text-[12px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                <label htmlFor={`exit-${c.id}`} className="font-medium text-ink">{c.phrase}</label>
                <span className="truncate text-[13px] text-ink-3">— {pick(c.meaningEn, c.meaningVi)}</span>
                {c.lockedIn && <span className="ml-auto flex shrink-0 items-center gap-1 text-[12px] font-medium text-mastered-ink"><Lock className="size-3" aria-hidden />{t.exit.lockedIn}</span>}
              </div>
              {!c.lockedIn && (
                <>
                  <Input id={`exit-${c.id}`} className="mt-2.5 font-serif text-[16px]" value={values[c.id] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [c.id]: e.target.value }))} onPaste={(e) => e.preventDefault()} onKeyDown={submitOnModEnter(() => void submit())} disabled={busy} autoComplete="off" />
                  {res && !res.passed && <p className="mt-1.5 text-[12.5px] text-critical-ink">{reasonText(t, res)}</p>}
                </>
              )}
            </li>
          );
        })}
      </ol>
      <PhasedStatus phases={EVAL_PHASES.slice(0, 3)} active={busy} />
      {error && <p className="rounded-md bg-critical-wash p-3 text-[13px] text-critical-ink">{error}</p>}
      <div className="flex items-center justify-end gap-3">
        <ModEnterHint />
        <Button onClick={() => void submit()} disabled={busy || !ready}>{busy ? t.common.checking : fmt(t.exit.submit, { n: pending.length })}</Button>
      </div>
    </div>
  );
}

export interface Receipt {
  chunks: Array<{ phrase: string; meaningVi: string; nextReview: string | Date | null }>;
  firstDraft: { gai: number | null; lri: number | null; errors: number };
  finalDraft: { gai: number | null; lri: number | null; errors: number } | null;
  profileDelta: { gai: number; lri: number; composite: number; level: number } | null;
  errorsLogged: number;
  errorsRepaired: number;
  rewrites: number;
}

function Delta({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-[13px] text-ink-2">{label}</span>
      <span className={cn("num text-[14px] font-medium", value === null || value === undefined ? "text-ink-3" : value >= 0 ? "text-mastered-ink" : "text-critical-ink")}>{value === null || value === undefined ? "—" : signed(value)}</span>
    </div>
  );
}

/** Final "Today's Acquired Arsenal" receipt. */
export function ArsenalReceipt({ receipt }: { receipt: Receipt }) {
  const { t, lang } = usePrefs();
  const locale = lang === "vi" ? "vi-VN" : "en-GB";
  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-lg border border-line bg-card">
        <div className="border-b border-dashed border-line-strong p-6 text-center">
          <p className="eyebrow">{t.exit.complete}</p>
          <h2 className="mt-1 font-serif text-[28px] font-medium tracking-[-0.01em]">{t.exit.arsenal}</h2>
          <p className="num mt-1 text-[12.5px] text-ink-3">{new Date().toLocaleString(locale)}</p>
        </div>
        <div className="p-6">
          <p className="eyebrow mb-2">{t.exit.lockedSrs}</p>
          <ul className="divide-y divide-line">
            {receipt.chunks.map((c) => (
              <li key={c.phrase} className="flex items-baseline gap-3 py-2">
                <Check className="size-3.5 shrink-0 translate-y-0.5 text-mastered" aria-hidden />
                <span className="font-medium">{c.phrase}</span>
                <span className="truncate text-[13px] text-ink-3">{c.meaningVi}</span>
                <span className="num ml-auto shrink-0 text-[12px] text-ink-3">{c.nextReview ? fmt(t.exit.review, { d: new Date(c.nextReview).toLocaleDateString(locale, { month: "short", day: "numeric" }) }) : ""}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 grid gap-6 border-t border-dashed border-line-strong pt-5 sm:grid-cols-2">
            <div>
              <p className="eyebrow mb-1">{t.exit.delta}</p>
              <Delta label="GAI" value={receipt.profileDelta?.gai} />
              <Delta label="LRI" value={receipt.profileDelta?.lri} />
              <Delta label={t.exit.composite} value={receipt.profileDelta?.composite} />
              <Delta label={t.exit.level} value={receipt.profileDelta?.level} />
            </div>
            <div>
              <p className="eyebrow mb-1">{t.exit.repair}</p>
              <div className="num flex justify-between py-1.5 text-[13px]"><span className="text-ink-2">{t.exit.gaiChange}</span><span>{receipt.firstDraft.gai?.toFixed(1) ?? "—"} → {receipt.finalDraft?.gai?.toFixed(1) ?? "—"}</span></div>
              <div className="num flex justify-between py-1.5 text-[13px]"><span className="text-ink-2">{t.exit.logged}</span><span>{receipt.errorsLogged}</span></div>
              <div className="num flex justify-between py-1.5 text-[13px]"><span className="text-ink-2">{t.exit.repaired}</span><span>{receipt.errorsRepaired}</span></div>
              <div className="num flex justify-between py-1.5 text-[13px]"><span className="text-ink-2">{t.exit.rewrites}</span><span>{receipt.rewrites}</span></div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-line p-4">
          <Link href="/graveyard" className={buttonVariants({ variant: "outline" })}>{t.exit.reviewQueue}</Link>
          <Link href="/" className={buttonVariants({ variant: "primary" })}>{t.exit.backToday} <ArrowRight aria-hidden /></Link>
        </div>
      </div>
    </div>
  );
}
