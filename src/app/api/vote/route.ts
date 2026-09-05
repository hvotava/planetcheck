import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepo } from "@/lib/db/server";
import { isRoundOpen, roundById } from "@/lib/api/rounds";
import { fail, handle, ok } from "@/lib/api/respond";
import { voteBodySchema } from "@/lib/api/vote-schema";
import { readAnonId, setAnonCookie } from "@/lib/trust/anon";
import { clientIp, geoCountry, hashIp, uaFamily } from "@/lib/trust/fingerprint";
import { getFloodLimiter } from "@/lib/trust/ratelimit";
import { verifyTurnstile } from "@/lib/trust/turnstile";
import { archetypeRules, loadArchetypes, loadWeighting } from "@/lib/content/loader";
import { scoreSubmission, round4 } from "@/lib/scoring";
import { toScoringRound } from "@/lib/seed/synthetic";
import { isKnownCountry } from "@/lib/countries";
import type { MetaGuess } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Cached = { rules: ReturnType<typeof archetypeRules>; weighting: ReturnType<typeof loadWeighting> };
let contentCache: Cached | null = null;
function content(): Cached {
  contentCache ??= { rules: archetypeRules(loadArchetypes()), weighting: loadWeighting() };
  return contentCache;
}

/**
 * POST /api/vote — ARCHITECTURE §6. Suspicious votes are flagged, never blocked.
 * Hard stops: invalid payload (400), closed round (410), duplicate (409), flood (429).
 */
export const POST = handle(async (req) => {
  const e = env();
  const body = voteBodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail(400, "invalid_body", "The vote payload is malformed.", body.error.flatten());
  const v = body.data;

  const ip = clientIp(req.headers);
  const ipHash = hashIp(ip, e.IP_SALT);
  const limiter = await getFloodLimiter({ redisUrl: e.REDIS_URL });
  const flood = await limiter.hit(ipHash);
  if (!flood.allowed) {
    return fail(429, "too_many_requests", "Slow down a little.", undefined, { "Retry-After": String(Math.ceil((flood.resetAt - Date.now()) / 1000)) });
  }

  const round = await roundById(v.roundId);
  if (!isRoundOpen(round)) return fail(410, "round_closed", "This round is not open for votes.");

  const nreq = req as NextRequest;
  const { anonId } = readAnonId(nreq);

  // --- validation: every active choice question exactly once with one of its options; every meta question guessed
  const choiceQs = round.questions.filter((q) => q.type === "choice");
  const metaQs = round.questions.filter((q) => q.type === "meta");
  const answerByQ = new Map(v.answers.map((a) => [a.questionId, a.optionId]));
  if (answerByQ.size !== v.answers.length) return fail(400, "invalid_answers", "Each question can be answered once.");
  const answers: Array<{ question_id: string; option_id: string; question: string; option: string }> = [];
  for (const q of choiceQs) {
    const optId = answerByQ.get(q.id);
    const opt = q.options.find((o) => o.id === optId);
    if (!opt) return fail(400, "invalid_answers", `Missing or invalid answer for question ${q.key}.`);
    answers.push({ question_id: q.id, option_id: opt.id, question: q.key, option: opt.key });
  }
  const guessByQ = new Map(v.metaGuesses.map((m) => [m.questionId, m.guess]));
  for (const q of metaQs) if (!guessByQ.has(q.id)) return fail(400, "invalid_answers", `Missing guess for ${q.key}.`);

  // --- flags
  const flags: string[] = [];
  const turnstile = await verifyTurnstile(v.token, e.TURNSTILE_SECRET, ip);
  if (!turnstile.ok) flags.push(turnstile.reason === "unavailable" ? "turnstile_unavailable" : "turnstile_failed");
  const loadedAt = v.loadedAt ? new Date(v.loadedAt).getTime() : NaN;
  const { weighting } = content();
  if (!Number.isFinite(loadedAt) || Date.now() - loadedAt < weighting.too_fast_seconds * 1000) flags.push("too_fast");

  const repo = await getRepo();

  // A class code makes the shared school network expected rather than suspicious, so the
  // per-IP flag threshold is raised for it (ARCHITECTURE §6: shared networks must not be banned).
  // An unknown code is simply ignored — never a reason to refuse a vote.
  const classCode = v.classCode ? v.classCode.toUpperCase() : null;
  const classKnown = classCode ? ((await repo.classCodeInfo(classCode))?.code ?? null) : null;

  const geo = geoCountry(req.headers);
  const declared = v.demographics?.declared_country?.toUpperCase() ?? null;
  const declaredKnown = declared && isKnownCountry(declared) ? declared : null;
  const country = declaredKnown ?? geo;
  if (declaredKnown && geo && declaredKnown !== geo) flags.push("country_mismatch");

  // --- scoring (pure)
  const actuals = await repo.metaActuals(round.id);
  const actualByQ = new Map(actuals.map((a) => [a.question_id, a.actual_weighted]));
  const metaGuesses: Array<MetaGuess & { question_id: string }> = metaQs.map((q) => ({
    question_id: q.id,
    question: q.key,
    guess: guessByQ.get(q.id) as number,
    actual: actualByQ.get(q.id) ?? null,
  }));
  const score = scoreSubmission({ answers, metaGuesses, round: toScoringRound(round) }, content().rules);
  if (score.honeypot_hit) flags.push("honeypot");

  const result = await repo.submitVote({
    round_id: round.id,
    anon_id: anonId,
    ip_hash: ipHash,
    ua_family: uaFamily(req.headers.get("user-agent")),
    locale: v.locale ?? "en",
    geo_country: geo,
    declared_country: declaredKnown,
    country,
    class_code: classKnown,
    age_band: v.demographics?.age_band ?? null,
    gender: v.demographics?.gender ?? null,
    settlement: v.demographics?.settlement ?? null,
    loaded_at: Number.isFinite(loadedAt) ? new Date(loadedAt).toISOString() : null,
    answers: answers.map(({ question_id, option_id }) => ({ question_id, option_id })),
    meta_guesses: metaGuesses.map((m) => ({ question_id: m.question_id, guess: m.guess, actual_at_submit: m.actual })),
    score: {
      ...score,
      axes: { peace_force: round4(score.axes.peace_force) ?? 0, trust_paranoia: round4(score.axes.trust_paranoia) ?? 0, us_them: round4(score.axes.us_them) ?? 0 },
      realism: round4(score.realism),
      consistency: round4(score.consistency) ?? 0,
      compromise: round4(score.compromise) ?? 0,
      survival: round4(score.survival) ?? 0,
    },
    flags,
    rate_ip_per_hour: classKnown ? weighting.rate_ip_per_hour_class : weighting.rate_ip_per_hour,
    rate_anon_per_hour: weighting.rate_anon_per_hour,
  });

  if (!result.ok) {
    const res = fail(409, "duplicate", "You already voted in this round.", { submissionId: result.submission_id });
    setAnonCookie(res, anonId, e.NODE_ENV === "production");
    return res;
  }

  const res = ok(
    {
      submissionId: result.submission_id,
      result: {
        axes: score.axes,
        realism: score.realism,
        consistency: score.consistency,
        compromise: score.compromise,
        survival: score.survival,
        archetype: score.archetype,
        contradictions_hit: score.contradictions_hit,
        trust: result.trust,
        country: result.country,
        classCode: classKnown,
      },
    },
    { status: 201 },
  );
  setAnonCookie(res, anonId, e.NODE_ENV === "production");
  return res;
});
