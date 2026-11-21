"use client";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  hint?: string;
}

/** Accessible segmented control (radiogroup semantics). */
export function Segmented<T extends string>({ value, onChange, options, size = "md", label, className }: { value: T; onChange: (v: T) => void; options: SegmentedOption<T>[]; size?: "sm" | "md"; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-md border border-line bg-surface p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.hint}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-[6px] font-medium transition-[background-color,color,box-shadow] duration-200 ease-lf",
            size === "sm" ? "px-2 py-0.5 text-[12px]" : "px-3 py-1 text-[13px]",
            value === o.value ? "bg-card text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]" : "text-ink-3 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
