import { getRepo } from "@/lib/db/server";
import { roundBySlugOrCurrent } from "@/lib/api/rounds";
import { handle, ok } from "@/lib/api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/results/board?round= — country leaderboard incl. locked countries. */
export const GET = handle(async (req) => {
  const round = await roundBySlugOrCurrent(new URL(req.url).searchParams.get("round"));
  const repo = await getRepo();
  return ok(await repo.countryBoard(round.id), { cache: 30 });
});
