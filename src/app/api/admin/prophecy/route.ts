import { z } from "zod";
import { requireAdmin } from "@/lib/api/auth";
import { getRepo } from "@/lib/db/server";
import { fail, handle, ok } from "@/lib/api/respond";
import { loadWeighting } from "@/lib/content/loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/prophecy — every prophecy including ones not yet open. Bearer ADMIN_TOKEN. */
export const GET = handle(async (req) => {
  requireAdmin(req);
  const [lo, hi] = loadWeighting().country_clamp;
  const repo = await getRepo();
  return ok(await repo.listProphecies({ include_future: true, clamp_lo: lo, clamp_hi: hi }));
});

/**
 * POST /api/admin/prophecy — settle a prophecy and score every guess. Bearer ADMIN_TOKEN.
 * An outcome is only ever set here, never by content and never by a job, and it always
 * carries a public note saying where it was settled.
 */
export const POST = handle(async (req) => {
  requireAdmin(req);
  const body = z
    .object({ key: z.string(), outcome: z.boolean().optional(), void: z.boolean().optional(), note: z.string().min(10).max(500) })
    .refine((b) => b.void === true || typeof b.outcome === "boolean", "either outcome or void is required")
    .safeParse(await req.json().catch(() => null));
  if (!body.success) return fail(400, "invalid_body", "Expected { key, outcome | void, note }.", body.error.flatten());

  const repo = await getRepo();
  const res = await repo.resolveProphecy(body.data);
  if (!res.ok) return fail(res.code === "not_found" ? 404 : 400, res.code ?? "failed", "Could not resolve the prophecy.");
  return ok(res);
});
