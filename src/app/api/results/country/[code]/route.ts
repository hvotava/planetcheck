import { getRepo } from "@/lib/db/server";
import { roundBySlugOrCurrent } from "@/lib/api/rounds";
import { fail, handle, ok } from "@/lib/api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/results/country/:code?round= */
export const GET = handle(async (req, ctx: { params: Promise<{ code: string }> }) => {
  const { code } = await ctx.params;
  if (!/^[A-Za-z]{2}$/.test(code)) return fail(400, "invalid_code", "Invalid country code.");
  const round = await roundBySlugOrCurrent(new URL(req.url).searchParams.get("round"));
  const repo = await getRepo();
  const data = await repo.countryResults(round.id, code.toUpperCase());
  return ok(data, { cache: 30 });
});
