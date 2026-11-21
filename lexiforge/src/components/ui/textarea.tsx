import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "block w-full resize-y rounded-md border border-line bg-card px-3.5 py-3 text-[15px] leading-relaxed text-ink transition-[border-color,box-shadow] duration-200 ease-lf placeholder:text-ink-3 focus:border-accent/60 focus:outline-none focus:ring-4 focus:ring-accent/10 disabled:opacity-60",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "block h-10 w-full rounded-md border border-line bg-card px-3 text-[15px] text-ink transition-[border-color,box-shadow] duration-200 ease-lf placeholder:text-ink-3 focus:border-accent/60 focus:outline-none focus:ring-4 focus:ring-accent/10",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
