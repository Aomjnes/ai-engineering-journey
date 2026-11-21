import { z } from "zod";
import { generateStructured } from "@/lib/llm/structured";
import type { LlmClient } from "@/lib/llm/client";
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

/** 4-Mode Universal Understanding Engine for any clicked phrase or sentence. */
export async function explainSelection(selection: string, context: string, client?: LlmClient): Promise<Explanation> {
  return generateStructured({
    schema: ExplanationSchema,
    system: "You are a bilingual (English–Vietnamese) applied linguist. You explain precisely, with no praise or filler. Vietnamese must be natural and accented.",
    user: `Explain the SELECTION as it is used in the CONTEXT, in four modes:
1. coreLogic — plain-English core meaning + a simple mental image.
2. structure — dissect the selection into consecutive parts (each "text" copied verbatim from the selection, in order) with grammatical role (subject, main verb, object, modifier, clause, connector, …).
3. contrastive — the exact natural Vietnamese equivalent, the nuance difference (in Vietnamese), and an explicit warning about the typical Vietlish/L1-interference mistake.
4. usage — a short realistic A/B dialogue using it naturally, a "textbook trap" (the wrong or unnatural version learners produce), the natural version, and why.

SELECTION: ${selection}
CONTEXT: ${context.slice(0, 1500)}

OUTPUT SCHEMA: {"coreLogic":{"plainEnglish","mentalImage"},"structure":{"parts":[{"text","role","note"}],"summary"},"contrastive":{"vietnamese","nuanceVi","interferenceWarning"},"usage":{"dialogue":[{"speaker":"A"|"B","line"}],"textbookTrap","natural","why"}}
${JSON_ONLY}`,
    effort: "low",
    client,
    validate: (v) => {
      const sel = norm(selection);
      const bad = v.structure.parts.filter((p) => !sel.includes(norm(p.text)));
      if (bad.length) return `structure.parts must be copied from the selection; not found: ${bad.map((b) => JSON.stringify(b.text)).join(", ")}`;
      const praise = findBannedPraise(`${v.coreLogic.plainEnglish} ${v.usage.why}`);
      return praise ? `Remove praise ("${praise}").` : null;
    },
  });
}
