import type { Config } from "tailwindcss";

const c = (v: string) => `rgb(var(--${v}) / <alpha-value>)`;

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: c("canvas"),
        card: c("card"),
        surface: c("surface"),
        ink: { DEFAULT: c("ink"), 2: c("ink-2"), 3: c("ink-3") },
        line: { DEFAULT: c("line"), strong: c("line-strong") },
        accent: { DEFAULT: c("accent"), fg: c("accent-fg"), wash: c("accent-wash") },
        critical: { DEFAULT: c("critical"), ink: c("critical-ink"), wash: c("critical-wash") },
        moderate: { DEFAULT: c("moderate"), ink: c("moderate-ink"), wash: c("moderate-wash") },
        minor: { DEFAULT: c("minor"), ink: c("minor-ink"), wash: c("minor-wash") },
        mastered: { DEFAULT: c("mastered"), ink: c("mastered-ink"), wash: c("mastered-wash") },
        chunk: c("chunk"),
      },
      fontFamily: {
        serif: ["var(--font-serif)", "ui-serif", "Georgia", "serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: { lg: "10px", md: "8px", sm: "6px" },
      transitionTimingFunction: { lf: "cubic-bezier(0.16, 1, 0.3, 1)" },
      transitionDuration: { DEFAULT: "180ms" },
      boxShadow: {
        lift: "0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px -12px rgb(0 0 0 / 0.12)",
        sheet: "0 -8px 32px -12px rgb(0 0 0 / 0.25)",
      },
    },
  },
  plugins: [],
} satisfies Config;
