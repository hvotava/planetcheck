import { z } from "zod";
import { env } from "@/lib/env";
import { getRepo } from "@/lib/db/server";
import { fail, handle, ok } from "@/lib/api/respond";
import { clientIp, hashIp } from "@/lib/trust/fingerprint";
import { getFloodLimiter } from "@/lib/trust/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/class — mint a class code for a teacher. No account: the code itself is the key,
 * and it grants nothing except a view of that class's own answers.
 */
export const POST = handle(async (req) => {
  const e = env();
  const body = z.object({ label: z.string().max(60).optional(), locale: z.string().max(10).optional() }).safeParse(await req.json().catch(() => ({})));
  if (!body.success) return fail(400, "invalid_body", "Expected { label?, locale? }.");

  const ipHash = hashIp(clientIp(req.headers), e.IP_SALT);
  const limiter = await getFloodLimiter({ redisUrl: e.REDIS_URL });
  const flood = await limiter.hit(`class:${ipHash}`);
  if (!flood.allowed) return fail(429, "too_many_requests", "Slow down a little.");

  const repo = await getRepo();
  const res = await repo.createClassCode({ label: body.data.label, locale: body.data.locale, ip_hash: ipHash });
  return ok(res, { status: 201 });
});
