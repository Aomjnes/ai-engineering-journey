import { cn } from "@/lib/utils";

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return <kbd className={cn("num inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface px-1 text-[11px] text-ink-2", className)}>{children}</kbd>;
}
