import cron from "node-cron";
import { getEnv } from "@/lib/env";
import { runIngestion } from "./pipeline";

const globalForCron = globalThis as unknown as { lexiforgeCron?: boolean };

/** Registers the in-process daily ingestion job (05:30 server time) once per process. */
export function startScheduler(): void {
  if (globalForCron.lexiforgeCron) return;
  // Serverless (Vercel) has no long-lived process: ingestion runs via Vercel Cron → /api/cron/ingest.
  if (process.env.VERCEL === "1") return;
  if (getEnv().ENABLE_INTERNAL_CRON !== "true") return;
  globalForCron.lexiforgeCron = true;
  cron.schedule("30 5 * * *", async () => {
    try {
      const report = await runIngestion();
      console.info(`[cron] ingestion stored ${report.stored} articles from ${report.feeds.length} feeds`);
    } catch (e) {
      console.error("[cron] ingestion failed", e);
    }
  });
  console.info("[cron] daily ingestion scheduled at 05:30");
}
