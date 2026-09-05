import { NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getRepo } from "@/lib/db/server";
import { fail, handle, ok } from "@/lib/api/respond";
import { readAnonId, setAnonCookie } from "@/lib/trust/anon";
import { clientIp, geoCountry, hashIp } from "@/lib/trust/fingerprint";
import { getFloodLimiter } from "@/lib/trust/ratelimit";
import { verifyTurnstile } from "@/lib/trust/turnstile";
import { isKnownCountry } from "@/lib/countries";
import { loadWeighting } from "@/lib/content/loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  key: z.string().regex(/^[a-z0-9_]+$/),
  probability: z.number().int().min(0).max(100),
  country: z.string().length(2).optional(),
  token: z.string().nullable().optional(),
  locale: z.string().max(10).optional(),
});

/**
 * POST /api/prophecies/guess — one probability per voter per prophecy.
 * Same trust policy as a vote (ARCHITECTURE §6): suspicious guesses are flagged, never
 * blocked; the only hard stop is a repeat, which is a 409 and never a silent replacement.
 */
export const POST = handle(async (req) => {
  const e = env();
  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail(400, "invalid_body", "Expected { key, probability }.", body.error.flatten());
  const v = body.data;

  const ip = clientIp(req.headers);
  const ipHash = hashIp(ip, e.IP_SALT);
  const limiter = await getFloodLimiter({ redisUrl: e.REDIS_URL });
  const flood = await limiter.hit(ipHash);
  if (!flood.allowed) {
    return fail(429, "too_many_requests", "Slow down a little.", undefined, { "Retry-After": String(Math.ceil((flood.resetAt - Date.now()) / 1000)) });
  }

  const { anonId } = readAnonId(req as NextRequest);
  const flags: string[] = [];
  const turnstile = await verifyTurnstile(v.token, e.TURNSTILE_SECRET, ip);
  if (!turnstile.ok) flags.push(turnstile.reason === "unavailable" ? "turnstile_unavailable" : "turnstile_failed");

  const geo = geoCountry(req.headers);
  const declared = v.country?.toUpperCase() ?? null;
  const declaredKnown = declared && isKnownCountry(declared) ? declared : null;
  const country = declaredKnown ?? geo;
  if (declaredKnown && geo && declaredKnown !== geo) flags.push("country_mismatch");

  const repo = await getRepo();
  const res = await repo.submitProphecyGuess({
    key: v.key,
    anon_id: anonId,
    probability: v.probability,
    country: country && isKnownCountry(country) ? country : null,
    ip_hash: ipHash,
    locale: v.locale ?? "en",
    flags,
  });

  if (!res.ok) {
    const status = res.code === "not_found" ? 404 : res.code === "closed" ? 410 : 409;
    const message =
      res.code === "not_found" ? "Unknown prophecy." : res.code === "closed" ? "This prophecy no longer accepts guesses." : "You already answered this prophecy.";
    const [clo, chi] = loadWeighting().country_clamp;
    const details =
      res.code === "duplicate" ? { guessId: res.guess_id, stats: await repo.prophecyStats({ key: v.key, clamp_lo: clo, clamp_hi: chi }) } : undefined;
    const out = fail(status, res.code, message, details);
    setAnonCookie(out, anonId, e.NODE_ENV === "production");
    return out;
  }

  // Return the aggregate as it stands *after* this guess: the reveal would otherwise show
  // the numbers from page load, i.e. "0 voices" to someone who just voted.
  const [lo, hi] = loadWeighting().country_clamp;
  const stats = await repo.prophecyStats({ key: v.key, clamp_lo: lo, clamp_hi: hi });
  const out = ok({ guessId: res.guess_id, prophecyId: res.prophecy_id, flags, stats }, { status: 201 });
  setAnonCookie(out, anonId, e.NODE_ENV === "production");
  return out;
});
