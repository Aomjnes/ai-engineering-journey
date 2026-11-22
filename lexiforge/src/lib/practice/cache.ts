/**
 * Shared PracticePromptCache: validated practice item sets keyed by mode + sub-band + topic + variant.
 * Content comes from public headlines only (no learner data), so every stream at the same level reuses it.
 */
import { createHash } from "node:crypto";
import type { z } from "zod";
import { prisma } from "@/lib/db";

export const topicHash = (topic: string) => createHash("sha256").update(topic.trim().toLowerCase()).digest("hex").slice(0, 24);

export function practiceCacheKey(mode: string, level: string, topic: string, variant: number): string {
  return createHash("sha256").update(`${mode}|${level}|${topicHash(topic)}|${variant}`).digest("hex");
}

/** Returns the cached set (validated) or generates, validates and stores a new one. */
export async function cachedPracticeSet<S extends z.ZodTypeAny>(
  opts: { mode: string; level: string; topic: string; variant: number; schema: S; generate: () => Promise<z.infer<S>>; source?: () => { provider: string; model: string } },
): Promise<{ set: z.infer<S>; cached: boolean }> {
  const key = practiceCacheKey(opts.mode, opts.level, opts.topic, opts.variant);
  const hit = await prisma.practicePromptCache.findUnique({ where: { key } });
  if (hit) {
    const parsed = opts.schema.safeParse(hit.payload);
    if (parsed.success) {
      await prisma.practicePromptCache.update({ where: { key }, data: { hits: { increment: 1 } } });
      return { set: parsed.data, cached: true };
    }
    await prisma.practicePromptCache.delete({ where: { key } });
  }
  const set = await opts.generate();
  const src = opts.source?.() ?? { provider: "llm", model: "" };
  await prisma.practicePromptCache.upsert({
    where: { key },
    update: { payload: set as object },
    create: { key, mode: opts.mode, level: opts.level, topicHash: topicHash(opts.topic), variant: opts.variant, payload: set as object, provider: src.provider, model: src.model },
  });
  return { set, cached: false };
}
