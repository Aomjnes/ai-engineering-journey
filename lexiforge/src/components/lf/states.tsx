"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({ icon, title, body, action, className }: { icon?: React.ReactNode; title: string; body?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center rounded-lg border border-dashed border-line-strong px-6 py-10 text-center", className)}>
      {icon && <div className="mb-3 text-ink-3 [&_svg]:size-6">{icon}</div>}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {body && <div className="mt-1 max-w-md text-[13.5px] leading-relaxed text-ink-3">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * Progress text shown while an evaluation runs. The phases describe the real pipeline order
 * (evidence extraction → span verification → deterministic metric update); timing is approximate.
 */
export function PhasedStatus({ phases, active, className }: { phases: string[]; active: boolean; className?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active) {
      setI(0);
      return;
    }
    const id = setInterval(() => setI((x) => Math.min(x + 1, phases.length - 1)), 2600);
    return () => clearInterval(id);
  }, [active, phases.length]);
  if (!active) return null;
  return (
    <div role="status" aria-live="polite" className={cn("flex items-center gap-2.5 text-[13px] text-ink-2", className)}>
      <span className="pulse-dot size-1.5 rounded-full bg-accent" aria-hidden />
      <span key={i} className="animate-in">{phases[i]}</span>
      <span className="num ml-auto text-[11px] text-ink-3">{i + 1}/{phases.length}</span>
    </div>
  );
}

export const EVAL_PHASES = ["Parsing syntax…", "Checking collocations and Vietlish calques…", "Verifying error spans against your text…", "Updating GAI / LRI metrics…"];
export const COMPREHENSION_PHASES = ["Reading your answer against the source…", "Checking each rubric criterion…", "Logging language errors…"];
