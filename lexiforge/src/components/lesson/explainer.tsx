"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { Explanation } from "@/lib/explain/service";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "core", label: "Core logic" },
  { key: "structure", label: "Structure" },
  { key: "contrast", label: "EN–VI nuance" },
  { key: "usage", label: "Usage vs trap" },
] as const;

export function ExplainerDrawer({ selection, data, loading, error, onClose }: { selection: string; data: Explanation | null; loading: boolean; error: string | null; onClose: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("core");
  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l bg-card shadow-xl" aria-label="4-mode explainer">
      <div className="flex items-start justify-between gap-2 border-b p-4">
        <p className="reading text-sm">“{selection}”</p>
        <button onClick={onClose} aria-label="Close explainer" className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex border-b text-xs">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={cn("flex-1 px-2 py-2", tab === t.key ? "border-b-2 border-primary font-semibold" : "text-muted-foreground")}>{t.label}</button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4 text-sm">
        {loading && <p className="text-muted-foreground">Analysing…</p>}
        {error && <p className="text-destructive">{error}</p>}
        {data && tab === "core" && (
          <div className="space-y-3">
            <p>{data.coreLogic.plainEnglish}</p>
            <p className="text-muted-foreground">Mental image: {data.coreLogic.mentalImage}</p>
          </div>
        )}
        {data && tab === "structure" && (
          <div className="space-y-2">
            {data.structure.parts.map((p, i) => (
              <div key={i} className="rounded border p-2">
                <p className="reading">{p.text}</p>
                <p className="text-xs font-semibold text-primary">{p.role}</p>
                {p.note && <p className="text-xs text-muted-foreground">{p.note}</p>}
              </div>
            ))}
            <p className="text-muted-foreground">{data.structure.summary}</p>
          </div>
        )}
        {data && tab === "contrast" && (
          <div className="space-y-3">
            <p className="text-base font-semibold">{data.contrastive.vietnamese}</p>
            <p>{data.contrastive.nuanceVi}</p>
            <p className="rounded border border-warning/40 bg-warning/10 p-2">⚠ {data.contrastive.interferenceWarning}</p>
          </div>
        )}
        {data && tab === "usage" && (
          <div className="space-y-3">
            <div className="space-y-1">
              {data.usage.dialogue.map((d, i) => (
                <p key={i}><span className="font-semibold">{d.speaker}:</span> {d.line}</p>
              ))}
            </div>
            <p><span className="text-destructive line-through">{data.usage.textbookTrap}</span> → <span className="font-semibold text-success">{data.usage.natural}</span></p>
            <p className="text-muted-foreground">{data.usage.why}</p>
          </div>
        )}
      </div>
    </aside>
  );
}
