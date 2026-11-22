import { PrismaClient } from "@prisma/client";
import { DEFAULT_FEEDS } from "../src/lib/ingest/feeds";
import { profileText } from "../src/lib/metrics/readability";

const prisma = new PrismaClient();

async function main() {
  for (const feed of DEFAULT_FEEDS) {
    await prisma.sourceFeed.upsert({
      where: { url: feed.url },
      update: { name: feed.name, homepage: feed.homepage, topic: feed.topic },
      create: { ...feed },
    });
  }
  const count = await prisma.sourceFeed.count();
  console.log(`Seeded ${count} source feeds.`);
  // Keep stored article difficulty on the current level scale (idempotent; cheap for a few hundred rows).
  const articles = await prisma.dailyArticle.findMany({ select: { id: true, content: true, difficultyScore: true } });
  let updated = 0;
  for (const a of articles) {
    const p = profileText(a.content);
    if (Math.abs(p.difficultyScore - a.difficultyScore) > 0.01) {
      await prisma.dailyArticle.update({ where: { id: a.id }, data: { difficultyScore: p.difficultyScore, cefrTier: p.cefrTier, fleschKincaidGrade: p.fleschKincaidGrade, lexicalSophistication: p.lexicalSophistication } });
      updated++;
    }
  }
  console.log(`Re-profiled ${updated} of ${articles.length} articles.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
