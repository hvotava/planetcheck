/**
 * Internal scheduler entry (Railway has no pg_cron). The Node-only implementation lives in
 * instrumentation-node.ts so the edge/client compilations never see `pg` & friends.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const mod = await import("./instrumentation-node");
    await mod.startScheduler();
  }
}
