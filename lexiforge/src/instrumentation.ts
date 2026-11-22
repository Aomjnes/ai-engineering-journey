export async function register() {
  // On Vercel ingestion runs via Vercel Cron; never load the scheduler (or jsdom) at cold start.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.VERCEL !== "1") {
    const { startScheduler } = await import("./lib/ingest/scheduler");
    startScheduler();
  }
}
