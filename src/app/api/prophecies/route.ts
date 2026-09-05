import { getRepo } from "@/lib/db/server";
import { handle, ok } from "@/lib/api/respond";
import { memo } from "@/lib/api/cache";
import { loadWeighting } from "@/lib/content/loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/prophecies — every open prophecy with its aggregate (raw + weighted). Cached briefly. */
export const GET = handle(async (req) => {
  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  const [lo, hi] = loadWeighting().country_clamp;
  const repo = await getRepo();
  const rows = await memo(`prophecies:${status ?? "all"}`, 30_000, () => repo.listProphecies({ status, clamp_lo: lo, clamp_hi: hi }));
  return ok(rows, { cache: 30 });
});
