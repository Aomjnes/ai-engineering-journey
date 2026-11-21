import { Badge } from "@/components/ui/badge";

export type SeverityName = "CRITICAL" | "MODERATE" | "MINOR";

const VARIANT = { CRITICAL: "critical", MODERATE: "moderate", MINOR: "minor" } as const;
const LABEL = { CRITICAL: "Critical", MODERATE: "Moderate", MINOR: "Minor" } as const;

export function SeverityBadge({ severity }: { severity: SeverityName }) {
  return (
    <Badge variant={VARIANT[severity]}>
      <span aria-hidden className={severity === "CRITICAL" ? "size-1.5 rounded-full bg-critical" : severity === "MODERATE" ? "size-1.5 rotate-45 bg-moderate" : "size-1.5 rounded-[1px] border border-minor"} />
      {LABEL[severity]}
    </Badge>
  );
}

export const CATEGORY_LABEL: Record<string, string> = {
  GRAMMAR: "Grammar",
  COLLOCATION_NATURALNESS: "Collocation",
  WORD_CHOICE_REGISTER: "Word choice",
  SPELLING_PUNCTUATION: "Spelling",
  LOGIC_COMPREHENSION: "Logic",
};
