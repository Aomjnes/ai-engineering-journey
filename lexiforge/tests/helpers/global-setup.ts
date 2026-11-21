import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Fresh SQLite database for the test run: delete prisma/test.db, then create it from the schema. */
export default function setup() {
  for (const suffix of ["", "-journal"]) rmSync(fileURLToPath(new URL(`../../prisma/test.db${suffix}`, import.meta.url)), { force: true });
  execSync("npx prisma db push --skip-generate", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: "file:./test.db", PRISMA_HIDE_UPDATE_MESSAGE: "1" },
  });
}
