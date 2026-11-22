"use client";

import { Badge } from "@/components/ui/badge";
import { usePrefs } from "./prefs";

export type SeverityName = "CRITICAL" | "MODERATE" | "MINOR";

const VARIANT = { CRITICAL: "critical", MODERATE: "moderate", MINOR: "minor" } as const;

export function SeverityBadge({ severity }: { severity: SeverityName }) {
  const { t } = usePrefs();
  return (
    <Badge variant={VARIANT[severity]}>
      <span aria-hidden className={severity === "CRITICAL" ? "size-1.5 rounded-full bg-critical" : severity === "MODERATE" ? "size-1.5 rotate-45 bg-moderate" : "size-1.5 rounded-[1px] border border-minor"} />
      {t.severity[severity]}
    </Badge>
  );
}

/** Localized error-category label. */
export function useCategoryLabel(): (c: string) => string {
  const { t } = usePrefs();
  return (c: string) => (t.category as Record<string, string>)[c] ?? c;
}
