import { getRepo } from "@/lib/db/server";
import { handle, ok } from "@/lib/api/respond";
import { compassVersion, countryClamp } from "@/lib/api/compass";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/compass/shares — what the planet answered, per question.
 * Deliberately says nothing about which answer is right: the deck shows the distribution
 * while you play, and the truth only after you have committed to an answer.
 */
export const GET = handle(async () => {
  const repo = await getRepo();
  return ok(await repo.compassShares({ version: compassVersion(), ...countryClamp() }), { cache: 15 });
});
