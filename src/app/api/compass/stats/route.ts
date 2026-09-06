import { handle, ok } from "@/lib/api/respond";
import { compassPlanet } from "@/lib/api/compass";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/compass/stats — the planet's knowledge, raw and weighted. */
export const GET = handle(async () => ok(await compassPlanet(), { cache: 30 }));
