import { getRepo } from "@/lib/db/server";
import { fail, handle, ok } from "@/lib/api/respond";
import { currentRound } from "@/lib/api/rounds";
import { loadWeighting } from "@/lib/content/loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/class/[code] — one class's results for the live round, or a bare count below the privacy floor. */
export const GET = handle(async (req, ctx: { params: Promise<{ code: string }> }) => {
  const { code } = await ctx.params;
  if (!/^[A-Za-z0-9]{6}$/.test(code)) return fail(400, "invalid_code", "A class code is six characters.");
  const round = await currentRound();
  if (!round) return fail(404, "no_round", "There is no live round right now.");
  const repo = await getRepo();
  const res = await repo.classResults(code.toUpperCase(), round.id, loadWeighting().min_class_submissions);
  if (!res) return fail(404, "not_found", "Unknown class code.");
  return ok(res);
});
