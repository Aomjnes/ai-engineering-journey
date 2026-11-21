import { describe, expect, it } from "vitest";
import { bridgeAccepted, deliveryMode, matchTag, rankArticles, targetDifficulty } from "@/lib/lessons/match";

const art = (id: string, d: number, hoursAgo = 0) => ({ id, difficultyScore: d, ingestedAt: new Date(Date.UTC(2026, 0, 2) - hoursAgo * 3_600_000) });

describe("i+1 matching", () => {
  it("targets L + 10 and ranks by distance, newest first on ties", () => {
    expect(targetDifficulty(40)).toBe(50);
    const ranked = rankArticles([art("far", 90), art("near-old", 52, 10), art("near-new", 48, 1), art("exact", 50)], 40);
    expect(ranked.map((a) => a.id)).toEqual(["exact", "near-new", "near-old", "far"]);
    expect(rankArticles([art("x", 50)], 40, new Set(["x"]))).toHaveLength(0);
  });

  it("serves graded bridges at ≤ B1.1, authentic text at B2+", () => {
    expect(deliveryMode(20, 30)).toBe("GRADED_BRIDGE"); // A2.2
    expect(deliveryMode(30, 40)).toBe("GRADED_BRIDGE"); // B1.1
    expect(deliveryMode(40, 55)).toBe("AUTHENTIC"); // B1.2, within T+12
    expect(deliveryMode(40, 70)).toBe("GRADED_BRIDGE"); // B1.2, too far above
    expect(deliveryMode(55, 95)).toBe("AUTHENTIC"); // B2+
  });

  it("accepts a bridge only when its measured difficulty is within T + 8", () => {
    expect(bridgeAccepted(20, 38)).toBe(true);
    expect(bridgeAccepted(20, 38.1)).toBe(false);
  });

  it("tags difficulty match", () => {
    expect(matchTag(40, 50)).toBe("i+1 match");
    expect(matchTag(40, 60)).toBe("stretch");
    expect(matchTag(40, 70)).toBe("too hard");
    expect(matchTag(40, 35)).toBe("comfortable");
  });
});
