"use client";

import { Check, X } from "lucide-react";
import type { Explanation } from "@/lib/explain/service";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Kbd } from "@/components/ui/kbd";
import { usePrefs } from "./prefs";

export const EXPLAIN_TABS = [
  { key: "logic", label: "Logic" },
  { key: "structure", label: "Structure" },
  { key: "trap", label: "EN–VI Trap" },
  { key: "real", label: "Real Life" },
] as const;
export type ExplainTab = (typeof EXPLAIN_TABS)[number]["key"];

function roleClass(role: string): string {
  const r = role.toLowerCase();
  if (r.includes("subject")) return "border-accent/40 bg-accent-wash text-accent";
  if (r.includes("verb") || r.includes("predicate")) return "border-ink/25 bg-ink text-canvas";
  if (r.includes("object") || r.includes("complement")) return "border-line-strong bg-surface text-ink";
  if (r.includes("clause") || r.includes("connector") || r.includes("conjunction")) return "border-dashed border-ink-3 bg-card text-ink-2";
  return "border-line bg-card text-ink-2";
}

export interface ExplainState {
  selection: string;
  data: Explanation | null;
  loading: boolean;
  error: string | null;
}

/** 4-mode dissection inspector: Logic · Structure · EN–VI Trap · Real Life (keys 1–4). */
export function ModeExplainer({ state, tab, onTab }: { state: ExplainState; tab: ExplainTab; onTab: (t: ExplainTab) => void }) {
  const { t: tr } = usePrefs();
  const d = state.data;
  return (
    <div className="flex min-h-0 flex-col">
      <p className="font-serif text-[16px] leading-relaxed text-ink">“{state.selection}”</p>
      <div role="tablist" aria-label={tr.explain.mode} className="mt-3 grid grid-cols-4 gap-0.5 rounded-md border border-line bg-surface p-0.5">
        {EXPLAIN_TABS.map((t, i) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => onTab(t.key)}
            className={cn("flex items-center justify-center gap-1 rounded-[6px] px-1 py-1.5 text-[12px] font-medium transition-colors duration-200 ease-lf", tab === t.key ? "bg-card text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]" : "text-ink-3 hover:text-ink")}
          >
            <span className="num hidden text-[10px] text-ink-3 sm:inline">{i + 1}</span>
            {tr.explain[t.key]}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-4 text-[14px] leading-relaxed">
        {state.loading && (
          <div className="space-y-2.5" aria-label={tr.explain.loading}>
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="mt-4 h-16 w-full" />
          </div>
        )}
        {state.error && <p className="rounded-md bg-critical-wash p-3 text-[13px] text-critical-ink">{state.error}</p>}
        {d && tab === "logic" && (
          <div className="animate-in space-y-3">
            <p className="text-ink">{d.coreLogic.plainEnglish}</p>
            <div className="rounded-md bg-surface p-3">
              <p className="eyebrow mb-1">{tr.explain.mentalImage}</p>
              <p className="text-ink-2">{d.coreLogic.mentalImage}</p>
            </div>
          </div>
        )}
        {d && tab === "structure" && (
          <div className="animate-in space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {d.structure.parts.map((p, i) => (
                <span key={i} className={cn("inline-flex flex-col rounded-md border px-2 py-1", roleClass(p.role))}>
                  <span className="font-serif text-[14.5px]">{p.text}</span>
                  <span className="text-[10.5px] font-semibold uppercase tracking-wider opacity-80">{p.role}</span>
                </span>
              ))}
            </div>
            <ul className="space-y-1 text-[13px] text-ink-2">
              {d.structure.parts
                .filter((p) => p.note)
                .map((p, i) => (
                  <li key={i}>
                    <span className="font-medium text-ink">{p.text}</span> — {p.note}
                  </li>
                ))}
            </ul>
            <p className="text-ink-2">{d.structure.summary}</p>
          </div>
        )}
        {d && tab === "trap" && (
          <div className="animate-in space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-md border border-critical/25 bg-critical-wash p-3">
                <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-critical-ink"><X className="size-3.5" aria-hidden /> {tr.explain.literalTrap}</p>
                <p className="font-serif text-[15px] text-ink">{d.usage.textbookTrap}</p>
                <p className="mt-1.5 text-[12.5px] text-ink-2">{d.contrastive.interferenceWarning}</p>
              </div>
              <div className="rounded-md border border-mastered/25 bg-mastered-wash p-3">
                <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-mastered-ink"><Check className="size-3.5" aria-hidden /> {tr.explain.natural}</p>
                <p className="font-serif text-[15px] text-ink">{d.usage.natural}</p>
                <p className="mt-1.5 text-[12.5px] text-ink-2">≈ {d.contrastive.vietnamese}</p>
              </div>
            </div>
            <p className="text-ink-2">{d.contrastive.nuanceVi}</p>
          </div>
        )}
        {d && tab === "real" && (
          <div className="animate-in space-y-3">
            <div className="space-y-2 rounded-md bg-surface p-3">
              {d.usage.dialogue.map((l, i) => (
                <p key={i} className="flex gap-2">
                  <span className={cn("num mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold", l.speaker === "A" ? "bg-ink text-canvas" : "bg-line-strong text-ink")}>{l.speaker}</span>
                  <span className="font-serif text-[15px] text-ink">{l.line}</span>
                </p>
              ))}
            </div>
            <p className="text-ink-2">{d.usage.why}</p>
          </div>
        )}
      </div>
      <p className="mt-5 hidden items-center gap-1.5 text-[11.5px] text-ink-3 lg:flex">
        <Kbd>1</Kbd>–<Kbd>4</Kbd> {tr.explain.keys} · <Kbd>Esc</Kbd> {tr.explain.close}
      </p>
    </div>
  );
}
