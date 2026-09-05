import { requireCron } from "@/lib/api/auth";
import { handle, ok } from "@/lib/api/respond";
import { runRecomputeJob } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST /api/cron/recompute — Authorization: Bearer CRON_SECRET (CLAUDE.md rule 9). */
export const POST = handle(async (req) => {
  requireCron(req);
  return ok(await runRecomputeJob());
});
export const GET = POST;
