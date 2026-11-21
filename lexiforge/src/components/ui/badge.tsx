import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[11.5px] font-medium leading-4 [&_svg]:size-3", {
  variants: {
    variant: {
      neutral: "bg-surface text-ink-2",
      outline: "border border-line text-ink-2",
      accent: "bg-accent-wash text-accent",
      critical: "bg-critical-wash text-critical-ink",
      moderate: "bg-moderate-wash text-moderate-ink",
      minor: "bg-minor-wash text-minor-ink",
      mastered: "bg-mastered-wash text-mastered-ink",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
