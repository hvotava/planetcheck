import { NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getRepo } from "@/lib/db/server";
import { fail, handle, ok } from "@/lib/api/respond";
import { readAnonId, setAnonCookie } from "@/lib/trust/anon";
import { clientIp, geoCountry, hashIp, uaFamily } from "@/lib/trust/fingerprint";
import { getFloodLimiter } from "@/lib/trust/ratelimit";
import { verifyTurnstile } from "@/lib/trust/turnstile";
import { isKnownCountry } from "@/lib/countries";
import { isLocale } from "@/lib/i18n/locales";
import { loadWeighting } from "@/lib/content/loader";
import { compassDeck, compassVersion } from "@/lib/api/compass";
import { scoringCompassFromPayload, toPlayCompass } from "@/lib/compass/deck";
import { round4, scoreCompass } from "@/lib/compass/score";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/compass?locale=cs — the deck, with the correct answers removed. Sets the anon cookie. */
export const GET = handle(async (req) => {
  const url = new URL(req.url);
  const localeParam = url.searchParams.get("locale") ?? "en";
  const locale = isLocale(localeParam) ? localeParam : "en";
  const version = compassVersion();
  const payload = await compassDeck();

  const nreq = req as NextRequest;
  const { anonId, isNew } = readAnonId(nreq);
  const repo = await getRepo();
  const status = isNew ? null : await repo.compassStatus(anonId, version);
  const e = env();
  const res = ok(
    toPlayCompass(payload, locale, {
      turnstileSiteKey: e.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null,
      alreadyDone: status?.submission_id ? { submission_id: status.submission_id } : null,
      geoCountry: geoCountry(req.headers),
    }),
  );
  setAnonCookie(res, anonId, e.NODE_ENV === "production");
  return res;
});

const bodySchema = z.object({
  version: z.number().int().positive(),
  answers: z.array(z.object({ questionId: z.string().uuid(), optionId: z.string().uuid() })).min(1).max(60),
  token: z.string().max(4096).nullable().optional(),
  loadedAt: z.string().datetime({ offset: true }).nullable().optional(),
  locale: z.string().max(10).optional(),
  country: z.string().length(2).optional(),
});

/**
 * POST /api/compass — one run per person per deck version.
 * Same trust policy as a vote (ARCHITECTURE §6): suspicious runs are flagged, never blocked;
 * the only hard stop is a repeat. Correctness is never taken from the client: the score is
 * recomputed here from the server's own deck, and the database re-reads it a second time.
 */
export const POST = handle(async (req) => {
  const e = env();
  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail(400, "invalid_body", "The compass payload is malformed.", body.error.flatten());
  const v = body.data;

  const ip = clientIp(req.headers);
  const ipHash = hashIp(ip, e.IP_SALT);
  const limiter = await getFloodLimiter({ redisUrl: e.REDIS_URL });
  const flood = await limiter.hit(ipHash);
  if (!flood.allowed) {
    return fail(429, "too_many_requests", "Slow down a little.", undefined, { "Retry-After": String(Math.ceil((flood.resetAt - Date.now()) / 1000)) });
  }

  const version = compassVersion();
  if (v.version !== version) return fail(409, "version_changed", "The compass was refreshed while you were answering. Reload and start again.");

  const payload = await compassDeck();
  const byOption = new Map(payload.questions.flatMap((q) => q.options.map((o) => [o.id, { question: q.key, option: o.key, questionId: q.id }] as const)));

  // Every answer must name a real option of a real question, once.
  const seen = new Set<string>();
  const answers: Array<{ question_id: string; option_id: string }> = [];
  const keyed: Array<{ question: string; option: string }> = [];
  for (const a of v.answers) {
    const hit = byOption.get(a.optionId);
    if (!hit || hit.questionId !== a.questionId) return fail(400, "invalid_answers", "An answer points at an option that is not on its card.");
    if (seen.has(a.questionId)) return fail(400, "invalid_answers", "Each question can be answered once.");
    seen.add(a.questionId);
    answers.push({ question_id: a.questionId, option_id: a.optionId });
    keyed.push({ question: hit.question, option: hit.option });
  }
  const facts = payload.questions.filter((q) => q.section === "fact");
  if (!facts.every((q) => seen.has(q.id))) return fail(400, "invalid_answers", "Every fact has to be answered.");

  const flags: string[] = [];
  const turnstile = await verifyTurnstile(v.token, e.TURNSTILE_SECRET, ip);
  if (!turnstile.ok) flags.push(turnstile.reason === "unavailable" ? "turnstile_unavailable" : "turnstile_failed");
  const loadedAt = v.loadedAt ? new Date(v.loadedAt).getTime() : NaN;
  // A 20-card deck answered in the time it takes to read one card is not a reading.
  // The floor is per card (content/weighting.yaml), not the round's single-deck 8 seconds.
  const tooFast = loadWeighting().compass_seconds_per_card * payload.questions.length;
  if (!Number.isFinite(loadedAt) || Date.now() - loadedAt < tooFast * 1000) flags.push("too_fast");

  const geo = geoCountry(req.headers);
  const declared = v.country?.toUpperCase() ?? null;
  const declaredKnown = declared && isKnownCountry(declared) ? declared : null;
  const country = declaredKnown ?? geo;
  if (declaredKnown && geo && declaredKnown !== geo) flags.push("country_mismatch");

  const score = scoreCompass(keyed, scoringCompassFromPayload(payload));

  const { anonId } = readAnonId(req as NextRequest);
  const repo = await getRepo();
  const result = await repo.submitCompass({
    anon_id: anonId,
    version,
    ip_hash: ipHash,
    ua_family: uaFamily(req.headers.get("user-agent")),
    locale: v.locale ?? "en",
    country: country && isKnownCountry(country) ? country : null,
    loaded_at: Number.isFinite(loadedAt) ? new Date(loadedAt).toISOString() : null,
    answers,
    score: {
      facts_total: score.facts_total,
      facts_correct: score.facts_correct,
      knowledge: round4(score.knowledge),
      chance: round4(score.chance),
      skill: round4(score.skill),
      bias: score.bias,
      axes: {
        peace_force: round4(score.axes.peace_force) ?? 0,
        trust_paranoia: round4(score.axes.trust_paranoia) ?? 0,
        us_them: round4(score.axes.us_them) ?? 0,
      },
    },
    flags,
  });

  if (!result.ok) {
    const res = fail(409, "duplicate", "You have already taken this compass.", { submissionId: result.submission_id });
    setAnonCookie(res, anonId, e.NODE_ENV === "production");
    return res;
  }

  const res = ok(
    {
      submissionId: result.submission_id,
      facts_correct: score.facts_correct,
      facts_total: score.facts_total,
      knowledge: score.knowledge,
      flags,
    },
    { status: 201 },
  );
  setAnonCookie(res, anonId, e.NODE_ENV === "production");
  return res;
});
