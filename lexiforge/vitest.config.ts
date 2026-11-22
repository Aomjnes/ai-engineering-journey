import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    // Live-network integration tests run only via `npm run test:live` (LIVE_NETWORK=1).
    include: process.env.LIVE_NETWORK === "1" ? ["tests/integration/**/*.test.ts"] : ["tests/**/*.test.ts"],
    exclude: process.env.LIVE_NETWORK === "1" ? [] : ["tests/integration/**"],
    globalSetup: ["tests/helpers/global-setup.ts"],
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://lexiforge:lexiforge@127.0.0.1:5432/lexiforge_test",
      DIRECT_URL: process.env.TEST_DATABASE_URL ?? "postgresql://lexiforge:lexiforge@127.0.0.1:5432/lexiforge_test",
      SESSION_SECRET: "test-session-secret-0123456789abcdef0123456789",
      ALLOWED_STREAM_CODES: "000,001,002,003,004",
      CRON_SECRET: "test-cron-secret-0123456789",
      ANTHROPIC_API_KEY: "",
      OPENAI_API_KEY: "",
      GEMINI_API_KEY: "",
    },
    // DB-backed tests share one Postgres test database: run files sequentially.
    fileParallelism: false,
    testTimeout: 30000,
  },
});
