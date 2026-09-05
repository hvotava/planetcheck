import { randomUUID, createHash } from "node:crypto";
import type { Repo, SubmitVoteInput } from "@/lib/db/repo";
import { COUNTRIES } from "@/lib/countries";
import { archetypeRules, loadArchetypes } from "@/lib/content/loader";
import { scoreSubmission } from "@/lib/scoring";
import { AGE_BANDS, AXES, GENDERS, SETTLEMENTS, type AxisKey, type ScoringRound } from "@/types/domain";
import type { RoundPayload } from "@/types/api";

/**
 * Synthetic votes for development (ARCHITECTURE §15 phase 0): N votes over K countries,
 * each country with its own "personality" on the three axes, realistic demographics,
 * a daily rhythm over the last 48 hours, and a sprinkle of flagged votes.
 * Deterministic for a given seed. Scores go through the real scoring pipeline.
 */
export type SeedOptions = { total?: number; countries?: number; seed?: number; roundSlug?: string; log?: (m: string) => void };

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function pickWeighted<T>(items: T[], weights: number[], rand: () => number): T {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

export function toScoringRound(round: RoundPayload): ScoringRound {
  return {
    survival_weights: round.survival_weights,
    questions: round.questions.map((q) => ({
      key: q.key,
      type: q.type,
      options: q.options.map((o) => ({ key: o.key, axis_weights: o.axis_weights, compromise: o.compromise, honeypot: o.honeypot })),
    })),
    contradictions: round.contradictions.map((c) => ({
      key: c.key,
      a: { question: c.a.question_key, option: c.a.option_key },
      b: { question: c.b.question_key, option: c.b.option_key },
    })),
  };
}

export async function seedSynthetic(repo: Repo, opts: SeedOptions = {}): Promise<{ inserted: number; duplicates: number; round: string }> {
  const total = opts.total ?? 10_000;
  const k = opts.countries ?? 40;
  const rand = mulberry32(opts.seed ?? 20260904);
  const log = opts.log ?? console.log;

  const round = await repo.getRound(opts.roundSlug ? { slug: opts.roundSlug } : { kind: "weekly", fallback_anchor: true });
  if (!round) throw new Error("no live round to seed — run content:sync first");
  const scoringRound = toScoringRound(round);
  const rules = archetypeRules(loadArchetypes());
  const choiceQuestions = round.questions.filter((q) => q.type === "choice");
  const metaQuestions = round.questions.filter((q) => q.type === "meta");

  // K most populous countries + CZ/SK always
  const pool = [...COUNTRIES].filter((c) => c.un_member).sort((a, b) => b.population - a.population).slice(0, k);
  for (const code of ["CZ", "SK"]) if (!pool.some((c) => c.code === code)) pool.push(COUNTRIES.find((c) => c.code === code)!);
  // sample share ~ sqrt(population) so small countries still unlock in dev
  const shareWeights = pool.map((c) => Math.sqrt(c.population));
  const personality = new Map(pool.map((c) => [c.code, { peace_force: gaussian(rand) * 0.5, trust_paranoia: gaussian(rand) * 0.5, us_them: gaussian(rand) * 0.5 } as Record<AxisKey, number>]));

  const now = Date.now();
  const rows: SubmitVoteInput[] = [];
  for (let i = 0; i < total; i++) {
    const country = pickWeighted(pool, shareWeights, rand);
    const p = personality.get(country.code)!;
    const individual: Record<AxisKey, number> = {
      peace_force: p.peace_force + gaussian(rand) * 0.6,
      trust_paranoia: p.trust_paranoia + gaussian(rand) * 0.6,
      us_them: p.us_them + gaussian(rand) * 0.6,
    };
    // choose options by softmax over alignment with the individual's position
    const answers = choiceQuestions.map((q) => {
      const scores = q.options.map((o) => {
        if (o.honeypot) return -4 + (rand() < 0.02 ? 8 : 0); // ~2 % of players pick the nonsense option
        let s = 0;
        for (const a of AXES) s += (o.axis_weights[a] ?? 0) * individual[a];
        return s * 1.8 + gaussian(rand) * 0.4;
      });
      const m = Math.max(...scores);
      const w = scores.map((s) => Math.exp(s - m));
      const o = pickWeighted(q.options, w, rand);
      return { question_id: q.id, option_id: o.id, question: q.key, option: o.key };
    });
    const meta_guesses = metaQuestions.map((q) => {
      const actual = 20 + rand() * 40; // unknown at seed time; realism uses a plausible value
      const guess = Math.round(Math.min(100, Math.max(0, actual + gaussian(rand) * 18)));
      return { question_id: q.id, guess, actual_at_submit: Math.round(actual * 100) / 100, question: q.key };
    });
    const score = scoreSubmission(
      {
        answers: answers.map((a) => ({ question: a.question, option: a.option })),
        metaGuesses: meta_guesses.map((m) => ({ question: m.question, guess: m.guess, actual: m.actual_at_submit })),
        round: scoringRound,
      },
      rules,
    );
    const flags: string[] = [];
    if (score.honeypot_hit) flags.push("honeypot");
    if (rand() < 0.02) flags.push("too_fast");
    const withDemo = rand() < 0.7;
    const gender = withDemo ? pickWeighted([...GENDERS], [0.49, 0.49, 0.02], rand) : null;
    const age = withDemo ? pickWeighted([...AGE_BANDS], [0.14, 0.24, 0.22, 0.17, 0.13, 0.1], rand) : null;
    const settlement = withDemo ? pickWeighted([...SETTLEMENTS], [0.45, 0.3, 0.25], rand) : null;
    // daily rhythm: more votes in the evening (UTC-ish), spread over 48 h, last hour densest
    const hoursAgo = rand() < 0.15 ? rand() : rand() * 48;
    const t = new Date(now - hoursAgo * 3600_000);
    if (rand() < 0.5 && (t.getUTCHours() < 6 || t.getUTCHours() > 23)) continue; // thin out the night
    rows.push({
      round_id: round.id,
      anon_id: randomUUID(),
      ip_hash: createHash("sha256").update(`seed:${i}:${country.code}`).digest("hex"),
      ua_family: pickWeighted(["mobile-safari", "chrome-mobile", "chrome", "firefox", "samsung"], [0.35, 0.35, 0.2, 0.05, 0.05], rand),
      locale: country.code === "CZ" ? "cs" : country.code === "SK" ? "sk" : "en",
      geo_country: country.code,
      declared_country: null,
      country: country.code,
      age_band: age,
      gender,
      settlement,
      loaded_at: new Date(t.getTime() - 60_000).toISOString(),
      submitted_at: t.toISOString(),
      answers: answers.map(({ question_id, option_id }) => ({ question_id, option_id })),
      meta_guesses: meta_guesses.map(({ question_id, guess, actual_at_submit }) => ({ question_id, guess, actual_at_submit })),
      score,
      flags,
      synthetic: true,
      skip_rate: true,
    });
  }

  let inserted = 0;
  let duplicates = 0;
  const batch = 250;
  for (let i = 0; i < rows.length; i += batch) {
    const r = await repo.seedSubmissions(rows.slice(i, i + batch));
    inserted += r.inserted;
    duplicates += r.duplicates;
    log(`seeded ${Math.min(i + batch, rows.length)}/${rows.length}`);
  }
  return { inserted, duplicates, round: round.slug };
}
