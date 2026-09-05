import { getRepo } from "@/lib/db/server";
import { roundBySlugOrCurrent } from "@/lib/api/rounds";
import { parseFilter } from "@/lib/api/filter";
import { fail, handle, ok } from "@/lib/api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/results/planet?round=&trust=&age_band=&gender=&settlement=&country= (ARCHITECTURE §10) */
export const GET = handle(async (req) => {
  const url = new URL(req.url);
  const round = await roundBySlugOrCurrent(url.searchParams.get("round"));
  const f = parseFilter(url.searchParams);
  if ("error" in f) return fail(400, "invalid_filter", f.error);
  const repo = await getRepo();
  const data = await repo.planetResults(round.id, f.filter);
  return ok({ ...data, round: { id: round.id, slug: round.slug, kind: round.kind, i18n: round.i18n, unlock_threshold: round.unlock_threshold, ends_at: round.ends_at } }, { cache: f.filtered ? 60 : 15 });
});
