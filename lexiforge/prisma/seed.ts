import { PrismaClient } from "@prisma/client";
import { DEFAULT_FEEDS } from "../src/lib/ingest/feeds";

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
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
