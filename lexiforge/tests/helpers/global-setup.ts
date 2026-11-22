import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://lexiforge:lexiforge@127.0.0.1:5432/lexiforge_test";

/** Fresh PostgreSQL schema for the run: drop and recreate `public` in the dedicated test database, then push. */
export default async function setup() {
  if (!/lexiforge_test/.test(TEST_DATABASE_URL)) throw new Error("Refusing to reset a database whose name is not lexiforge_test.");
  const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  await prisma.$executeRawUnsafe("DROP SCHEMA IF EXISTS public CASCADE");
  await prisma.$executeRawUnsafe("CREATE SCHEMA public");
  await prisma.$disconnect();
  execSync("npx prisma db push --skip-generate", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, DIRECT_URL: TEST_DATABASE_URL, PRISMA_HIDE_UPDATE_MESSAGE: "1" },
  });
}
