import { z } from "zod";
import { requireAdmin } from "@/lib/api/auth";
import { getRepo } from "@/lib/db/server";
import { fail, handle, ok } from "@/lib/api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/narrator — list drafts; POST { id, approved } — approve/unpublish. Bearer ADMIN_TOKEN. Never auto-publishes. */
export const GET = handle(async (req) => {
  requireAdmin(req);
  const repo = await getRepo();
  const locale = new URL(req.url).searchParams.get("locale") ?? undefined;
  return ok(await repo.narratorPosts({ locale, only_approved: false, limit: 50 }));
});

export const POST = handle(async (req) => {
  requireAdmin(req);
  const body = z.object({ id: z.string().uuid(), approved: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return fail(400, "invalid_body", "Expected { id, approved }.");
  const repo = await getRepo();
  const row = await repo.setNarratorApproval(body.data.id, body.data.approved);
  if (!row) return fail(404, "not_found", "Unknown narrator post.");
  return ok(row);
});
