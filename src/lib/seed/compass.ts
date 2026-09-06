import { randomUUID, createHash } from "node:crypto";
import type { Repo } from "@/lib/db/repo";
import { scoringCompassFromPayload } from "@/lib/compass/deck";
import { round4, scoreCompass } from "@/lib/compass/score";
import type { CompassAnswer } from "@/types/domain";

/**
 * Synthetic Kompas runs for local development. Deliberately not uniform:
 *
 *  * people differ in how much they actually know (a latent level per person),
 *  * when they are wrong they lean to the dark side more often than the bright one,
 *    which is the finding this whole module exists to measure, and
 *  * knowledge correlates weakly with how people answered the weekly round, so the
 *    crossing on /planet has something to show instead of three identical bars.
 *
 * It reuses existing voters where it can, because a Kompas run only meets a round
 * submission through `voters.id`.
 */
export type CompassSeedOptions = { total?: number; seed?: number; log?: (m: string) => void };

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function seedCompass(repo: Repo, version: number, opts: CompassSeedOptions = {}): Promise<{ inserted: number; duplicates: number }> {
  const total = opts.total ?? 1200;
  const rand = mulberry32(opts.seed ?? 20260905);
  const log = opts.log ?? console.log;

  const deck = await repo.getCompass({ version, i18n: {} });
  const scoring = scoringCompassFromPayload(deck);
  const facts = deck.questions.filter((q) => q.section === "fact");
  const profile = deck.questions.filter((q) => q.section !== "fact");

  // Dev-only seeding reads voters directly; the application layer never does (CLAUDE.md rule 1).
  const existing = await repo.db.query<{ anon_id: string; country_code: string | null; dove: number | null }>(
    `select v.anon_id, s.country_code, (s.axis_scores->>'peace_force')::float as dove
       from voters v
       join submissions s on s.voter_id = v.id and not s.flagged
       left join compass_submissions c on c.voter_id = v.id and c.version = $1
      where c.id is null
      order by random()
      limit $2`,
    [version, total],
  );

  let inserted = 0;
  let duplicates = 0;
  for (let i = 0; i < total; i++) {
    const reuse = existing[i];
    // Latent knowledge, mostly middling. People who voted peacefully know slightly more here,
    // which is a made-up correlation and exists only so the dev UI is not three flat bars.
    const base = 0.18 + rand() * 0.6;
    const tilt = reuse?.dove == null ? 0 : -reuse.dove * 0.12;
    const level = Math.max(0.02, Math.min(0.96, base + tilt));

    const answers: Array<{ question_id: string; option_id: string }> = [];
    const keyed: CompassAnswer[] = [];
    for (const q of facts) {
      const right = q.options.find((o) => o.correct)!;
      const wrong = q.options.filter((o) => !o.correct);
      let picked = right;
      if (rand() > level) {
        // Wrong answers are not random: two thirds of them lean pessimistic.
        const dark = wrong.filter((o) => o.bias === "pessimistic");
        const bright = wrong.filter((o) => o.bias === "optimistic");
        const pool = (rand() < 0.66 ? dark : bright).length ? (rand() < 0.66 ? dark : bright) : wrong;
        picked = pool[Math.floor(rand() * pool.length)] ?? wrong[0]!;
      }
      answers.push({ question_id: q.id, option_id: picked.id });
      keyed.push({ question: q.key, option: picked.key });
    }
    for (const q of profile) {
      const o = q.options[Math.floor(rand() * q.options.length)]!;
      answers.push({ question_id: q.id, option_id: o.id });
      keyed.push({ question: q.key, option: o.key });
    }

    const score = scoreCompass(keyed, scoring);
    const res = await repo.submitCompass({
      anon_id: reuse?.anon_id ?? randomUUID(),
      version,
      ip_hash: createHash("sha256").update(`compass-seed:${i}`).digest("hex"),
      ua_family: "seed",
      locale: "cs",
      country: reuse?.country_code ?? null,
      loaded_at: new Date(Date.now() - 300_000).toISOString(),
      submitted_at: new Date(Date.now() - rand() * 48 * 3600_000).toISOString(),
      answers,
      synthetic: true,
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
      flags: [],
    });
    if (res.ok) inserted++;
    else duplicates++;
    if ((i + 1) % 300 === 0) log(`compass seeded ${i + 1}/${total}`);
  }
  return { inserted, duplicates };
}
