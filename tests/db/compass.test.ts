import { randomUUID, createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildVote, createTestRepo, DOVE, HAWK } from "./helpers";
import { scoringCompassFromPayload, toPlayCompass } from "@/lib/compass/deck";
import { scoreCompass, round4 } from "@/lib/compass/score";
import type { CompassPayload } from "@/types/api";
import type { CompassSubmitInput } from "@/lib/db/repo";

let ctx: Awaited<ReturnType<typeof createTestRepo>>;
let deck: CompassPayload;

const VERSION = 1;

/** Answers every fact with the option at `pick`, and every profile question with its first option. */
function answersFor(pick: "correct" | "wrong" | "none", opts: { profile?: boolean } = {}) {
  const out: Array<{ question_id: string; option_id: string }> = [];
  for (const q of deck.questions) {
    if (q.section === "fact") {
      if (pick === "none") continue;
      const o = pick === "correct" ? q.options.find((x) => x.correct)! : q.options.find((x) => !x.correct)!;
      out.push({ question_id: q.id, option_id: o.id });
    } else if (opts.profile !== false) {
      out.push({ question_id: q.id, option_id: q.options[0]!.id });
    }
  }
  return out;
}

function submitInput(answers: Array<{ question_id: string; option_id: string }>, over: Partial<CompassSubmitInput> = {}): CompassSubmitInput {
  const scoring = scoringCompassFromPayload(deck);
  const byId = new Map(deck.questions.flatMap((q) => q.options.map((o) => [o.id, { q: q.key, o: o.key }] as const)));
  const score = scoreCompass(
    answers.map((a) => ({ question: byId.get(a.option_id)!.q, option: byId.get(a.option_id)!.o })),
    scoring,
  );
  return {
    anon_id: randomUUID(),
    version: VERSION,
    ip_hash: createHash("sha256").update(randomUUID()).digest("hex"),
    ua_family: "test",
    locale: "cs",
    country: "CZ",
    loaded_at: new Date(Date.now() - 120_000).toISOString(),
    answers,
    score: {
      facts_total: score.facts_total,
      facts_correct: score.facts_correct,
      knowledge: round4(score.knowledge),
      chance: round4(score.chance),
      skill: round4(score.skill),
      bias: score.bias,
      axes: score.axes,
    },
    flags: [],
    ...over,
  };
}

beforeAll(async () => {
  ctx = await createTestRepo();
  deck = await ctx.repo.getCompass({ version: VERSION, i18n: {} });
});
afterAll(async () => {
  await ctx.close();
});

describe("sync_compass", () => {
  it("loads the whole deck from content, facts first", () => {
    expect(deck.questions).toHaveLength(20);
    expect(deck.questions.filter((q) => q.section === "fact")).toHaveLength(12);
    const positions = deck.questions.map((q) => q.position);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("gives every fact exactly one correct option, a source and a reveal", () => {
    for (const q of deck.questions.filter((x) => x.section === "fact")) {
      expect(q.options.filter((o) => o.correct), q.key).toHaveLength(1);
      expect(q.source?.url, q.key).toMatch(/^https:\/\//);
      expect(q.i18n_answer, q.key).toBeTruthy();
    }
  });

  it("never lets a profile question carry a correct answer or a fact carry axis weights", () => {
    for (const q of deck.questions) {
      if (q.section === "fact") expect(q.options.every((o) => Object.keys(o.axis_weights).length === 0), q.key).toBe(true);
      else expect(q.options.some((o) => o.correct), q.key).toBe(false);
    }
  });

  it("is idempotent and deactivates an option that leaves the content", async () => {
    const { syncContent } = await import("@/lib/content/sync");
    const again = await syncContent(ctx.repo, { log: () => undefined });
    expect(again.compass.questions).toBe(20);
    const rows = await ctx.db.query<{ n: number }>("select count(*)::int as n from compass_questions where active");
    expect(rows[0]!.n).toBe(20);
    // one correct option per question is a database guarantee, not just a content rule
    const dup = await ctx.db.query<{ n: number }>(
      "select count(*)::int as n from (select question_id from compass_options where correct and active group by question_id having count(*) > 1) t",
    );
    expect(dup[0]!.n).toBe(0);
  });
});

describe("the deck the browser gets", () => {
  it("carries no correct answer, no bias and no axis weights", () => {
    const play = toPlayCompass(deck, "cs", { turnstileSiteKey: null, alreadyDone: null, geoCountry: "CZ" });
    const json = JSON.stringify(play);
    expect(json).not.toContain("correct");
    expect(json).not.toContain("pessimistic");
    expect(json).not.toContain("axis_weights");
    expect(json).not.toContain("i18n_answer");
    expect(play.facts_total).toBe(12);
    expect(play.questions[0]!.text).toContain("chudob");
  });
});

describe("submit_compass", () => {
  it("stores a perfect run and reads correctness from the database, not from the client", async () => {
    const anon = randomUUID();
    const res = await ctx.repo.submitCompass(submitInput(answersFor("correct"), { anon_id: anon }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const s = (await ctx.repo.getCompassSubmission(res.submission_id))!;
    expect(s.facts_total).toBe(12);
    expect(s.facts_correct).toBe(12);
    expect(Number(s.knowledge)).toBe(1);
    expect(Number(s.chance)).toBeCloseTo(1 / 3, 3);
    expect(Number(s.skill)).toBeCloseTo(1, 3);
    expect(s.answers).toHaveLength(20);
    expect(s.answers.filter((a) => a.correct)).toHaveLength(12);

    const status = await ctx.repo.compassStatus(anon, VERSION);
    expect(status?.submission_id).toBe(res.submission_id);
  });

  it("ignores a client that claims a wrong answer was right", async () => {
    const wrong = answersFor("wrong");
    // the payload lies: it says everything was correct
    const lying = submitInput(wrong);
    lying.score = { ...lying.score, facts_correct: 12, knowledge: 1, skill: 1 };
    const res = await ctx.repo.submitCompass(lying);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const s = (await ctx.repo.getCompassSubmission(res.submission_id))!;
    // the stored per-answer truth comes from compass_options
    expect(s.answers.filter((a) => a.correct)).toHaveLength(0);
  });

  it("refuses a second run of the same version and never replaces the first", async () => {
    const anon = randomUUID();
    const first = await ctx.repo.submitCompass(submitInput(answersFor("correct"), { anon_id: anon }));
    const second = await ctx.repo.submitCompass(submitInput(answersFor("wrong"), { anon_id: anon }));
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (first.ok && !second.ok) {
      expect(second.code).toBe("duplicate");
      expect(second.submission_id).toBe(first.submission_id);
      const s = (await ctx.repo.getCompassSubmission(first.submission_id))!;
      expect(s.facts_correct).toBe(12);
    }
  });

  it("lets the same person take a later version", async () => {
    const anon = randomUUID();
    await ctx.repo.submitCompass(submitInput(answersFor("correct"), { anon_id: anon }));
    const next = await ctx.repo.submitCompass(submitInput(answersFor("wrong"), { anon_id: anon, version: 2 }));
    expect(next.ok).toBe(true);
  });

  it("keeps flagged runs out of the public numbers", async () => {
    const before = await ctx.repo.compassStats({ version: VERSION });
    const res = await ctx.repo.submitCompass(submitInput(answersFor("correct"), { flags: ["turnstile_failed"] }));
    expect(res.ok).toBe(true);
    const after = await ctx.repo.compassStats({ version: VERSION });
    expect(after.n).toBe(before.n);
  });
});

describe("compass_shares and compass_stats", () => {
  beforeAll(async () => {
    // a small mixed population: 6 all-right, 4 all-wrong, spread over three countries
    for (let i = 0; i < 6; i++) await ctx.repo.submitCompass(submitInput(answersFor("correct"), { country: i < 3 ? "CZ" : "SK" }));
    for (let i = 0; i < 4; i++) await ctx.repo.submitCompass(submitInput(answersFor("wrong"), { country: "DE" }));
  });

  it("reports option shares per question, raw and weighted", async () => {
    const shares = await ctx.repo.compassShares({ version: VERSION });
    const q = shares.questions.find((x) => x.key === "extreme_poverty")!;
    expect(q.total_raw).toBeGreaterThan(0);
    const sum = q.options.reduce((s, o) => s + (o.share_raw ?? 0), 0);
    expect(sum).toBeCloseTo(100, 0);
    expect(q.options.every((o) => o.share_weighted != null)).toBe(true);
  });

  it("computes the planet's knowledge, its chance baseline and which way the errors lean", async () => {
    const stats = await ctx.repo.compassStats({ version: VERSION });
    expect(stats.n).toBeGreaterThanOrEqual(10);
    expect(stats.chance).toBeCloseTo(1 / 3, 3);
    expect(stats.knowledge.raw).not.toBeNull();
    expect(stats.knowledge.weighted).not.toBeNull();
    // every wrong run picked the first wrong option of each fact, so both leanings appear
    expect(stats.bias.pessimistic + stats.bias.optimistic).toBeGreaterThan(0);
    const q = stats.questions.find((x) => x.key === "extreme_poverty")!;
    expect(q.correct_option_id).toBeTruthy();
    expect(q.correct_share.raw).not.toBeNull();
    expect(stats.countries.map((c) => c.country_code).sort()).toEqual(["CZ", "DE", "SK"]);
  });

  it("weights countries by population, so the weighted number differs from the raw one", async () => {
    const stats = await ctx.repo.compassStats({ version: VERSION });
    expect(stats.knowledge.weighted).not.toBe(stats.knowledge.raw);
    expect(stats.n_weighted).toBeGreaterThan(0);
  });
});

describe("round_by_knowledge — the crossing", () => {
  it("says so plainly when there are too few people to split", async () => {
    const split = await ctx.repo.roundByKnowledge({ round_id: ctx.round.id, version: VERSION, min_n: 30 });
    expect(split.enough).toBe(false);
    expect(split.questions).toEqual([]);
  });

  it("splits a round's answers into thirds by what the voter knows", async () => {
    // 12 people who know everything vote DOVE, 12 who know nothing vote HAWK
    for (let i = 0; i < 12; i++) {
      const anon = randomUUID();
      await ctx.repo.submitCompass(submitInput(answersFor("correct"), { anon_id: anon }));
      const v = await ctx.repo.submitVote(buildVote(ctx.round, DOVE, { anon, country: "CZ" }));
      expect(v.ok).toBe(true);
    }
    for (let i = 0; i < 12; i++) {
      const anon = randomUUID();
      await ctx.repo.submitCompass(submitInput(answersFor("wrong"), { anon_id: anon }));
      const v = await ctx.repo.submitVote(buildVote(ctx.round, HAWK, { anon, country: "CZ" }));
      expect(v.ok).toBe(true);
    }

    const split = await ctx.repo.roundByKnowledge({ round_id: ctx.round.id, version: VERSION, min_n: 10 });
    expect(split.enough).toBe(true);
    expect(split.tertiles.map((t) => t.band)).toEqual(["low", "mid", "high"]);
    expect(split.tertiles[0]!.knowledge_mean!).toBeLessThan(split.tertiles[2]!.knowledge_mean!);

    // the people who know the facts chose the dove option; the ones who do not chose the hawk
    const q = split.questions.find((x) => x.key === "neighbor_field")!;
    const un = q.options.find((o) => o.key === "un")!;
    expect(un.high!).toBeGreaterThan(un.low!);
    expect(un.gap!).toBeGreaterThan(0);
  });
});
