import { bootstrapPg } from "@/lib/db/bootstrap-pg";
import { env, internalCronEnabled } from "@/lib/env";
import { runNarratorJob, runRecomputeJob } from "@/lib/jobs";

/**
 * Runs once per server process:
 *  - brings the Postgres schema and content/*.yaml up to date (advisory-locked, so
 *    several replicas starting at once is safe)
 *  - recompute every 10 minutes (weights, country_stats, planet_stats)
 *  - narrator draft once a day at 06:00 UTC
 * Both jobs take a DB lease, so several replicas never double-run. Disable the jobs with
 * PLANETCHECK_INTERNAL_CRON=false and drive /api/cron/* from Railway cron instead.
 */
export async function startScheduler() {
  const e = env();
  if (e.NODE_ENV === "test") return;

  try {
    const r = await bootstrapPg();
    if (r.ran) console.log(`[bootstrap] migrations applied: ${r.applied.length ? r.applied.join(", ") : "none"}; content rounds: ${r.rounds}`);
  } catch (err) {
    // Loud on purpose: a half-migrated database is the one failure that must not pass quietly.
    console.error("[bootstrap] FAILED — the schema or content may be stale:", err);
  }

  if (!internalCronEnabled(e)) return;

  const safe = (name: string, fn: () => Promise<unknown>) => async () => {
    try {
      const r = await fn();
      console.log(`[cron] ${name}:`, JSON.stringify(r).slice(0, 300));
    } catch (err) {
      console.error(`[cron] ${name} failed:`, err);
    }
  };

  setTimeout(safe("recompute", runRecomputeJob), 15_000).unref();
  setInterval(safe("recompute", runRecomputeJob), 10 * 60_000).unref();
  setInterval(() => {
    const now = new Date();
    if (now.getUTCHours() === 6 && now.getUTCMinutes() < 10) void safe("narrator", () => runNarratorJob())();
  }, 10 * 60_000).unref();
}
