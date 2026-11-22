import { z } from "zod";
import { generateStructured } from "@/lib/llm/structured";
import type { LlmClient } from "@/lib/llm/client";
import { JSON_ONLY } from "@/lib/llm/prompts";
import { detectCopy } from "@/lib/metrics/similarity";

export const QuestionSchema = z.object({
  id: z.string().regex(/^q[1-9]$/),
  type: z.enum(["inference", "nuance", "paraphrase"]),
  prompt: z.string().min(5).max(400),
  promptVi: z.string().max(400).optional(),
  rubric: z.array(z.string().min(5).max(240)).min(2).max(4),
});
export type ComprehensionQuestion = z.infer<typeof QuestionSchema>;

export const QuestionSetSchema = z.object({
  questions: z.array(QuestionSchema).min(2).max(5),
  productionPrompt: z.string().min(20).max(800),
  productionPromptVi: z.string().min(10).max(800),
});
export type QuestionSet = z.infer<typeof QuestionSetSchema>;

/**
 * Generates open-ended inference/nuance/paraphrase questions with fixed, checkable rubrics.
 * Questions that could be answered by copying one source sentence are rejected (prompt similarity check).
 */
export async function generateQuestionSet(opts: {
  text: string;
  count: number;
  levelLabel: string;
  chunks: string[];
  beginner?: boolean;
  client?: LlmClient;
}): Promise<QuestionSet> {
  const beginnerRules = opts.beginner
    ? `
BEGINNER MODE (Pre-A1/A1): questions use ≤ 10 very common English words and can be answered in 3–10 words; rubric = 2 tiny concrete facts.
The production prompt asks for 2–3 short sentences (8–40 words) about the learner's own life using the chunks.`
    : "";
  const user = `Write ${opts.count} open-ended comprehension questions about the text for a learner at CEFR ${opts.levelLabel}.${beginnerRules}
Give every question a natural Vietnamese translation in "promptVi", and the production prompt in Vietnamese as "productionPromptVi".
Rules:
- Use only types "inference", "nuance", "paraphrase". At least one inference question.
- No question may be answerable by copying a single sentence from the text; require restating or reasoning.
- Each question gets 2–4 rubric criteria: concrete, checkable facts or reasoning steps a correct answer must contain (e.g. "States that sales are expected to fall"). No criterion about grammar or length.
- ids are "q1", "q2", ...
Also write ONE production prompt (60–120 word task) that requires the learner to respond to today's article in a realistic situation (email, opinion post, briefing) and explicitly asks them to use at least 3 of these chunks: ${opts.chunks.map((c) => `"${c}"`).join(", ") || "(no chunks: ask for a 100-word response)"}.

TEXT:
${opts.text.slice(0, 7000)}

OUTPUT SCHEMA: {"questions":[{"id":"q1","type":"inference"|"nuance"|"paraphrase","prompt":string,"promptVi":string,"rubric":[string,...]}],"productionPrompt":string,"productionPromptVi":string}
${JSON_ONLY}`;
  return generateStructured({
    schema: QuestionSetSchema,
    system: "You are an assessment designer for an English-acquisition program. You write precise, unambiguous items with fixed rubrics.",
    user,
    tier: "standard",
    client: opts.client,
    validate: (v) => {
      if (v.questions.length !== opts.count) return `Return exactly ${opts.count} questions.`;
      const ids = new Set(v.questions.map((q) => q.id));
      if (ids.size !== v.questions.length) return "Question ids must be unique.";
      if (!v.questions.some((q) => q.type === "inference")) return "Include at least one inference question.";
      const copyable = v.questions.filter((q) => detectCopy(q.prompt, opts.text).isCopy);
      if (copyable.length) return `Questions ${copyable.map((q) => q.id).join(", ")} copy the source text; rephrase them.`;
      return null;
    },
  });
}
