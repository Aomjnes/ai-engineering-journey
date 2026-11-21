import { z } from "zod";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/http";
import { ratingFromRecall, review, type CardState, type CardStateName } from "@/lib/metrics/srs";
import { chunkPresent } from "@/lib/evaluation/chunks";

const BackSchema = z.object({ meaningVi: z.string(), meaningEn: z.string(), sentence: z.string() });

/** Replaces the chunk inside the learner's own sentence with a gap (deterministic, inflection-aware). */
export function gapSentence(sentence: string, phrase: string): string {
  const words = [...sentence.matchAll(/[A-Za-z0-9'’-]+/g)].map((m) => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
  const n = phrase.trim().split(/\s+/).length;
  // Shortest matching window wins, so surrounding words stay visible.
  for (let len = n; len <= n + 3 * Math.max(1, n - 1); len++) {
    for (let i = 0; i + len <= words.length; i++) {
      const from = words[i]?.start ?? 0;
      const to = words[i + len - 1]?.end ?? 0;
      if (chunkPresent(sentence.slice(from, to), phrase)) return `${sentence.slice(0, from)}_____${sentence.slice(to)}`;
    }
  }
  return "_____";
}

export async function dueCards(userId: string, now: Date, limit = 30) {
  const cards = await prisma.srsCard.findMany({ where: { userId, dueAt: { lte: now } }, orderBy: [{ dueAt: "asc" }], take: limit });
  return cards.map((c) => {
    const back = BackSchema.safeParse(JSON.parse(c.back));
    // Alternate active-production formats: fill-in-your-own-context, then nuance → expression.
    const mode: "context" | "nuance" = c.reps % 2 === 0 ? "context" : "nuance";
    return {
      id: c.id,
      mode,
      state: c.state,
      overdueDays: Math.max(0, Math.floor((now.getTime() - c.dueAt.getTime()) / 86_400_000)),
      cueVi: back.success ? back.data.meaningVi : "",
      cueEn: back.success ? back.data.meaningEn : "",
      gapped: back.success ? gapSentence(back.data.sentence, c.front) : "",
      errorSubtype: c.errorSubtype,
    };
  });
}

export async function reviewCard(userId: string, cardId: string, typed: string, responseMs: number, now: Date) {
  const card = await prisma.srsCard.findUnique({ where: { id: cardId } });
  if (!card || card.userId !== userId) throw new AppError(404, "CARD_NOT_FOUND", "Card not found.");
  if (card.dueAt.getTime() > now.getTime()) throw new AppError(409, "NOT_DUE", "This card is not due yet.");
  const rating = ratingFromRecall(card.front, typed, responseMs);
  const state: CardState = {
    stability: card.stability, difficulty: card.difficulty, reps: card.reps, lapses: card.lapses,
    state: card.state as CardStateName, lastReviewAt: card.lastReviewAt, dueAt: card.dueAt,
  };
  const out = review(state, rating, now);
  await prisma.$transaction([
    prisma.srsCard.update({
      where: { id: card.id },
      data: { stability: out.card.stability, difficulty: out.card.difficulty, reps: out.card.reps, lapses: out.card.lapses, state: out.card.state, lastReviewAt: now, dueAt: out.card.dueAt },
    }),
    prisma.srsReview.create({ data: { cardId: card.id, rating, elapsedDays: out.elapsedDays, retrievability: out.retrievabilityAtReview, recalled: out.recalled, reviewedAt: now } }),
    prisma.userProgress.upsert({ where: { userId }, update: { lastReviewAt: now }, create: { userId, lastReviewAt: now } }),
  ]);
  const intervalDays = Math.max(0, (out.card.dueAt.getTime() - now.getTime()) / 86_400_000);
  return {
    rating,
    ratingLabel: ["", "Again", "Hard", "Good", "Easy"][rating],
    answer: card.front,
    typed,
    nextDueAt: out.card.dueAt,
    intervalDays: Math.round(intervalDays * 10) / 10,
    stability: out.card.stability,
    retrievabilityAtReview: out.retrievabilityAtReview,
  };
}
