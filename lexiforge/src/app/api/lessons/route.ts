import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handle } from "@/lib/http";
import { deliveryMode, matchTag, rankArticles, targetDifficulty } from "@/lib/lessons/match";
import { getLocalUser, requireProfile } from "@/lib/profile/service";

export const dynamic = "force-dynamic";

/** Today's i+1-ranked live articles plus the learner's recent lessons. */
export async function GET() {
  return handle(async () => {
    const user = await getLocalUser();
    const profile = await requireProfile(user.id);
    const now = new Date();
    const [articles, lessons] = await Promise.all([
      prisma.dailyArticle.findMany({
        where: { ingestedAt: { gte: new Date(now.getTime() - 3 * 86_400_000) } },
        include: { feed: { select: { name: true } } },
      }),
      prisma.lessonUnit.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 10, include: { article: { select: { title: true, url: true } } } }),
    ]);
    const used = new Set(lessons.map((l) => l.articleId));
    const ranked = rankArticles(articles, profile.abilityLevel, used).slice(0, 8);
    return NextResponse.json({
      level: profile.abilityLevel,
      target: targetDifficulty(profile.abilityLevel),
      articles: ranked.map((a) => ({
        id: a.id,
        title: a.title,
        source: a.feed.name,
        url: a.url,
        publishedAt: a.publishedAt,
        cefrTier: a.cefrTier,
        difficulty: a.difficultyScore,
        fkGrade: a.fleschKincaidGrade,
        wordCount: a.wordCount,
        match: matchTag(profile.abilityLevel, a.difficultyScore),
        delivery: deliveryMode(profile.abilityLevel, a.difficultyScore),
      })),
      lessons: lessons.map((l) => ({ id: l.id, title: l.article.title, stage: l.stage, createdAt: l.createdAt, isGraded: l.isGraded })),
    });
  });
}
