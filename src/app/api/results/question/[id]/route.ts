import { getRepo } from "@/lib/db/server";
import { fail, handle, ok } from "@/lib/api/respond";
import { isUuid } from "@/lib/trust/fingerprint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/results/question/:id?country=CZ — live shares after each swipe (cache 15 s). */
export const GET = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!isUuid(id)) return fail(400, "invalid_id", "Invalid question id.");
  const country = new URL(req.url).searchParams.get("country");
  const repo = await getRepo();
  const data = await repo.questionShares(id, country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null);
  return ok(data, { cache: 15 });
});
