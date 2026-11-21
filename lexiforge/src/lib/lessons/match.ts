/** Pure i+1 matching rules. See CLAUDE.md § i+1 matching. */

export const STRETCH_OFFSET = 10;
export const BRIDGE_TOLERANCE = 8;
export const B12_AUTHENTIC_TOLERANCE = 12;

export function targetDifficulty(level: number): number {
  return Math.min(100, level + STRETCH_OFFSET);
}

export interface Candidate {
  id: string;
  difficultyScore: number;
  ingestedAt: Date;
}

/** Ranks unused candidates by |D − T| (ties: newest first). */
export function rankArticles<T extends Candidate>(articles: readonly T[], level: number, usedIds: ReadonlySet<string> = new Set()): T[] {
  const t = targetDifficulty(level);
  return articles
    .filter((a) => !usedIds.has(a.id))
    .sort((a, b) => Math.abs(a.difficultyScore - t) - Math.abs(b.difficultyScore - t) || b.ingestedAt.getTime() - a.ingestedAt.getTime());
}

export type DeliveryMode = "GRADED_BRIDGE" | "AUTHENTIC";

export function deliveryMode(level: number, articleDifficulty: number): DeliveryMode {
  if (level < 37.5) return "GRADED_BRIDGE";
  if (level < 50) return articleDifficulty <= targetDifficulty(level) + B12_AUTHENTIC_TOLERANCE ? "AUTHENTIC" : "GRADED_BRIDGE";
  return "AUTHENTIC";
}

export function bridgeAccepted(level: number, measuredDifficulty: number): boolean {
  return measuredDifficulty <= targetDifficulty(level) + BRIDGE_TOLERANCE;
}

/** Difficulty-match tag shown on lesson cards. */
export function matchTag(level: number, d: number): "i+1 match" | "stretch" | "comfortable" | "too hard" {
  const gap = d - level;
  if (gap > STRETCH_OFFSET + 15) return "too hard";
  if (gap > STRETCH_OFFSET + 5) return "stretch";
  if (gap >= STRETCH_OFFSET - 7) return "i+1 match";
  return "comfortable";
}
