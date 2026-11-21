import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/helpers/global-setup.ts"],
    env: { DATABASE_URL: "file:./test.db", CRON_SECRET: "test-cron-secret-0123456789", ANTHROPIC_API_KEY: "", OPENAI_API_KEY: "", GEMINI_API_KEY: "" },
    // DB-backed tests share one SQLite file: run files sequentially.
    fileParallelism: false,
    testTimeout: 30000,
  },
});
