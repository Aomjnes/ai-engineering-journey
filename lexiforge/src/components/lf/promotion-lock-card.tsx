import Link from "next/link";
import { Check, Circle, Lock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CheckStatus = "PASS" | "PROGRESS" | "BLOCKED" | "LOCKED" | "NO_DATA";
export interface LockCheck {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

const STYLE: Record<CheckStatus, { tag: string; cls: string; icon: React.ReactNode }> = {
  PASS: { tag: "PASS", cls: "text-mastered-ink bg-mastered-wash", icon: <Check aria-hidden /> },
  PROGRESS: { tag: "", cls: "text-ink-2 bg-surface", icon: <Circle aria-hidden /> },
  BLOCKED: { tag: "BLOCKED", cls: "text-critical-ink bg-critical-wash", icon: <X aria-hidden /> },
  LOCKED: { tag: "LOCKED", cls: "text-ink-3 bg-surface", icon: <Lock aria-hidden /> },
  NO_DATA: { tag: "NO DATA", cls: "text-ink-3 bg-surface", icon: <Circle aria-hidden /> },
};

/** The exact list of what stands between the learner and the next band. */
export function PromotionLockList({ checks, compact = false }: { checks: LockCheck[]; compact?: boolean }) {
  return (
    <ul className="space-y-1.5">
      {checks.map((c) => {
        const st = STYLE[c.status];
        const progressTag = c.key === "sessions" ? c.detail.split(" ")[0] : "";
        return (
          <li key={c.key} className="flex items-start gap-2.5">
            <span className={cn("num mt-[1px] inline-flex h-5 w-[74px] shrink-0 items-center justify-center gap-1 rounded px-1.5 text-[10.5px] font-semibold [&_svg]:size-3", st.cls)}>
              {st.icon}
              {st.tag || progressTag}
            </span>
            <span className="min-w-0 text-[13px] leading-5">
              <span className="font-medium text-ink">{c.label}</span>
              {!compact && <span className="block text-[12px] text-ink-3">{c.detail}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function PromotionAction({ unlocked, nextBand, metricsLink = true }: { unlocked: boolean; nextBand: string | null; metricsLink?: boolean }) {
  if (!nextBand) return <p className="text-[13px] text-ink-3">C1.2 is the top tracked band.</p>;
  return unlocked ? (
    <Link href="/promotion" className={buttonVariants({ variant: "primary", size: "md" })}>Take Band Audit · {nextBand}</Link>
  ) : (
    <span className="flex flex-col gap-2">
      <button type="button" disabled className={buttonVariants({ variant: "outline", size: "md" })} aria-describedby="audit-locked-why">
        <Lock aria-hidden /> Band Audit locked
      </button>
      <span id="audit-locked-why" className="sr-only">Unlocks when every promotion check passes.</span>
      {metricsLink && <Link href="/metrics" className="text-center text-[12.5px] text-ink-3 hover:text-ink">View full metrics →</Link>}
    </span>
  );
}
