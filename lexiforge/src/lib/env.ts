import { z } from "zod";

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());

const EnvSchema = z.object({
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "DATABASE_URL must be a PostgreSQL connection string"),
  DIRECT_URL: z.string().regex(/^postgres(ql)?:\/\//, "DIRECT_URL must be a PostgreSQL connection string"),
  /** Signs stream session cookies. Optional at boot so non-auth tooling runs; auth routes refuse to work without it. */
  SESSION_SECRET: z.preprocess(emptyToUndefined, z.string().min(32, "SESSION_SECRET must be at least 32 characters").optional()),
  ALLOWED_STREAM_CODES: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .default("000,001,002,003,004")
      .transform((v) => [...new Set(v.split(",").map((c) => c.trim()).filter(Boolean))])
      .pipe(
        z
          .array(z.string().regex(/^[A-Za-z0-9_-]{3,32}$/, "stream codes are 3–32 chars of letters, digits, _ or -"))
          .min(1, "ALLOWED_STREAM_CODES needs at least one code")
          .max(5, "ALLOWED_STREAM_CODES allows at most 5 codes (hard cap)"),
      ),
  ),
  ANTHROPIC_API_KEY: optionalString,
  OPENAI_API_KEY: optionalString,
  GEMINI_API_KEY: optionalString,
  ANTHROPIC_MODEL: z.preprocess(emptyToUndefined, z.string().default("claude-opus-5-5")),
  OPENAI_MODEL: z.preprocess(emptyToUndefined, z.string().default("gpt-5")),
  GEMINI_MODEL: z.preprocess(emptyToUndefined, z.string().default("gemini-3.5-flash")),
  CRON_SECRET: z.preprocess(emptyToUndefined, z.string().min(16, "CRON_SECRET must be at least 16 characters").optional()),
  ENABLE_INTERNAL_CRON: z.preprocess(emptyToUndefined, z.enum(["true", "false"]).default("false")),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/** Test seam: forget the cached env after tests mutate process.env. */
export function resetEnvCache(): void {
  cached = null;
}

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export type LlmProviderName = "anthropic" | "openai" | "gemini";

/** Auto-detects the LLM provider from whichever API key is present (Anthropic → OpenAI → Gemini). */
export function detectProvider(env: Env = getEnv()): { provider: LlmProviderName; model: string; apiKey: string } | null {
  if (env.ANTHROPIC_API_KEY) return { provider: "anthropic", model: env.ANTHROPIC_MODEL, apiKey: env.ANTHROPIC_API_KEY };
  if (env.OPENAI_API_KEY) return { provider: "openai", model: env.OPENAI_MODEL, apiKey: env.OPENAI_API_KEY };
  if (env.GEMINI_API_KEY) return { provider: "gemini", model: env.GEMINI_MODEL, apiKey: env.GEMINI_API_KEY };
  return null;
}
