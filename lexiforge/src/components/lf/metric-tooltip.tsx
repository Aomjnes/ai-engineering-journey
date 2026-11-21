"use client";

import { useId, useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/** Hover/focus tooltip that explains how a number is computed. Keyboard reachable. */
export function MetricTooltip({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className={cn("relative inline-flex", className)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label={`How ${label} is computed`} aria-describedby={open ? id : undefined} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} className="rounded text-ink-3 hover:text-ink">
        <Info className="size-3.5" aria-hidden />
      </button>
      {open && (
        <span role="tooltip" id={id} className="animate-in absolute left-1/2 top-6 z-50 w-72 -translate-x-1/2 rounded-md border border-line bg-card p-3 text-left text-[12.5px] font-normal leading-relaxed text-ink-2 shadow-lift">
          {children}
        </span>
      )}
    </span>
  );
}
