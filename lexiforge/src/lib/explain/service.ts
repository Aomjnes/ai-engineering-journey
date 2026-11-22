import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { generateStructured } from "@/lib/llm/structured";
import type { LlmClient } from "@/lib/llm/client";
import { getLlmClient } from "@/lib/llm/router";
import { JSON_ONLY, findBannedPraise } from "@/lib/llm/prompts";

export const ExplanationSchema = z.object({
  coreLogic: z.object({ plainEnglish: z.string().min(5).max(600), mentalImage: z.string().min(5).max(400) }),
  structure: z.object({
    parts: z.array(z.object({ text: z.string().min(1).max(300), role: z.string().min(2).max(80), note: z.string().max(240) })).min(1).max(14),
    summary: z.string().min(5).max(500),
  }),
  contrastive: z.object({ vietnamese: z.string().min(1).max(500), nuanceVi: z.string().min(5).max(600), interferenceWarning: z.string().min(5).max(500) }),
  usage: z.object({
    dialogue: z.array(z.object({ speaker: z.enum(["A", "B"]), line: z.string().min(2).max(300) })).min(2).max(6),
    textbookTrap: z.string().min(3).max(300),
    natural: z.string().min(3).max(300),
    why: z.string().min(5).max(500),
  }),
});
export type Explanation = z.infer<typeof ExplanationSchema>;

const norm = (s: string) => s.toLowerCase().replace(/[“”"‘’']/g, "").replace(/\s+/g, " ").trim();

/** Output cap sized to the 4-mode schema (≈ 600–1200 tokens incl. Vietnamese); generous enough to avoid truncation retries. */
export const EXPLAIN_MAX_TOKENS = 3000;
export const EXPLAIN_TEMPERATURE = 0.2;
const CONTEXT_KEY_CHARS = 240;

/** Cache key: sha256(normalized selection | first 240 chars of normalized context | CEFR level). */
export function explanationCacheKey(selection: string, context: string, level: string, locale: "en" | "vi" = "en"): string {
  // English keeps the original key shape so existing cache rows stay valid; Vietnamese explanations get their own rows.
  const tail = locale === "vi" ? `${level}|vi` : level;
  return createHash("sha256").update(`${norm(selection)}|${norm(context).slice(0, CONTEXT_KEY_CHARS)}|${tail}`).digest("hex");
}

const SYSTEM = "You are a bilingual English–Vietnamese applied linguist. Be concise and direct: no praise, no filler, no preamble. Vietnamese must be natural and fully accented. Output JSON only.";

function prompt(selection: string, context: string, level: string, locale: "en" | "vi"): string {
  const lang =
    locale === "vi"
      ? `\nLANGUAGE: the learner reads Vietnamese. Write coreLogic.plainEnglish, coreLogic.mentalImage, structure.parts[].note, structure.summary and usage.why in simple, natural Vietnamese${/^(Pre-A1|A1)/.test(level) ? " for an absolute beginner (no grammar jargon, short sentences)" : ""}. Keep structure.parts[].text, dialogue lines, textbookTrap and natural in English.`
      : "";
  return `Learner level: CEFR ${level}.${lang} Explain the SELECTION as used in the CONTEXT in four compact modes (each text field ≤ 35 words):
1 coreLogic: plain-English core meaning + one simple mental image.
2 structure: consecutive parts of the selection (each "text" copied verbatim, in order, ≤ 8 parts) with grammatical role.
3 contrastive: natural Vietnamese equivalent, nuance difference (in Vietnamese), the typical Vietlish/L1 mistake.
4 usage: 2–4 line A/B dialogue, the textbook trap (wrong/unnatural version), the natural version, why.

SELECTION: ${selection}
CONTEXT: ${context.slice(0, 900)}

JSON: {"coreLogic":{"plainEnglish","mentalImage"},"structure":{"parts":[{"text","role","note"}],"summary"},"contrastive":{"vietnamese","nuanceVi","interferenceWarning"},"usage":{"dialogue":[{"speaker":"A"|"B","line"}],"textbookTrap","natural","why"}}
${JSON_ONLY}`;
}

export interface ExplainResult {
  explanation: Explanation;
  cached: boolean;
  ms: number;
}

/**
 * 4-Mode Universal Understanding Engine. Checks the shared ExplanationCache first (any stream, any device),
 * otherwise calls the LLM with the "minimal" thinking tier and stores the validated result.
 */
export async function explainSelection(selection: string, context: string, level = "B1.1", client?: LlmClient, locale: "en" | "vi" = "en"): Promise<ExplainResult> {
  const started = Date.now();
  const key = explanationCacheKey(selection, context, level, locale);
  const hit = await prisma.explanationCache.findUnique({ where: { key } });
  if (hit) {
    const parsed = ExplanationSchema.safeParse(hit.payload);
    if (parsed.success) {
      await prisma.explanationCache.update({ where: { key }, data: { hits: { increment: 1 }, lastHitAt: new Date() } });
      return { explanation: parsed.data, cached: true, ms: Date.now() - started };
    }
    await prisma.explanationCache.delete({ where: { key } });
  }
  const llm = client ?? getLlmClient();
  const explanation = await generateStructured({
    schema: ExplanationSchema,
    system: SYSTEM,
    user: prompt(selection, context, level, locale),
    tier: "minimal",
    temperature: EXPLAIN_TEMPERATURE,
    maxTokens: EXPLAIN_MAX_TOKENS,
    client: llm,
    validate: (v) => {
      const sel = norm(selection);
      const bad = v.structure.parts.filter((p) => !sel.includes(norm(p.text)));
      if (bad.length) return `structure.parts must be copied from the selection; not found: ${bad.map((b) => JSON.stringify(b.text)).join(", ")}`;
      const praise = findBannedPraise(`${v.coreLogic.plainEnglish} ${v.usage.why}`);
      return praise ? `Remove praise ("${praise}").` : null;
    },
  });
  await prisma.explanationCache.upsert({
    where: { key },
    update: { payload: explanation, provider: llm.provider, model: llm.model },
    create: { key, selection: selection.slice(0, 500), level: locale === "vi" ? `${level}|vi` : level, provider: llm.provider, model: llm.model, payload: explanation },
  });
  return { explanation, cached: false, ms: Date.now() - started };
}
