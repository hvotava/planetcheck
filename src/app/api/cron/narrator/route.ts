import { requireCron } from "@/lib/api/auth";
import { handle, ok } from "@/lib/api/respond";
import { runNarratorJob } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST /api/cron/narrator — Authorization: Bearer CRON_SECRET. Generates drafts (approved = false). */
export const POST = handle(async (req) => {
  requireCron(req);
  const locales = new URL(req.url).searchParams.get("locales")?.split(",").filter(Boolean);
  return ok(await runNarratorJob(locales));
});
export const GET = POST;
