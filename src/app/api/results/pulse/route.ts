import { getRepo } from "@/lib/db/server";
import { roundBySlugOrCurrent } from "@/lib/api/rounds";
import { handle, ok } from "@/lib/api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/results/pulse?round=&minutes=60 — planet_stats (refreshed ≤10 s) + per-minute series. Polling fallback for SSE. */
export const GET = handle(async (req) => {
  const url = new URL(req.url);
  const round = await roundBySlugOrCurrent(url.searchParams.get("round"));
  const minutes = Math.min(1440, Math.max(5, Number(url.searchParams.get("minutes") ?? 60) || 60));
  const repo = await getRepo();
  const [stats, series] = await Promise.all([repo.refreshPlanetPulse(round.id), repo.pulseSeries(round.id, minutes)]);
  return ok({ stats, series }, { cache: 5 });
});
