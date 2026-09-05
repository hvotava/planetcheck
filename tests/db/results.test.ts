import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildVote, createTestRepo, DOVE, HAWK, TORN } from "./helpers";
import { seedSynthetic } from "@/lib/seed/synthetic";
import { recomputeRound } from "@/lib/recompute";
import { loadTitles } from "@/lib/content/loader";

let ctx: Awaited<ReturnType<typeof createTestRepo>>;

beforeAll(async () => {
  ctx = await createTestRepo();
  // 8 hand-made votes: CZ 3 doves + 1 hawk, SK 2 hawks + 1 torn (with demographics), DE 1 dove
  const votes = [
    buildVote(ctx.round, DOVE, { country: "CZ", age_band: "25-34", gender: "f", settlement: "city" }),
    buildVote(ctx.round, DOVE, { country: "CZ", age_band: "35-44", gender: "m", settlement: "town" }),
    buildVote(ctx.round, DOVE, { country: "CZ" }),
    buildVote(ctx.round, HAWK, { country: "CZ", age_band: "65+", gender: "m", settlement: "rural" }),
    buildVote(ctx.round, HAWK, { country: "SK", age_band: "18-24", gender: "m" }),
    buildVote(ctx.round, HAWK, { country: "SK", age_band: "18-24", gender: "f" }),
    buildVote(ctx.round, TORN, { country: "SK", age_band: "45-54", gender: "x" }),
    buildVote(ctx.round, DOVE, { country: "DE" }),
  ];
  for (const v of votes) {
    const r = await ctx.repo.submitVote(v);
    if (!r.ok) throw new Error("seed vote failed");
  }
});
afterAll(async () => {
  await ctx.close();
});

describe("planet_results", () => {
  it("computes totals, survival, archetypes, option shares and pairs — raw and weighted", async () => {
    const r = await ctx.repo.planetResults(ctx.round.id);
    expect(r.filtered).toBe(false);
    expect(r.totals.raw).toBe(8);
    expect(r.totals.weighted).toBeCloseTo(8, 6); // weights are 1 before recompute
    expect(r.survival.raw).toBe(r.survival.weighted);
    expect(r.contradiction.raw).toBeCloseTo(12.5, 2); // 1 of 8 has a contradiction
    expect(r.archetypes.diplomat!.raw).toBe(4); // 4 doves; TORN has compromise 2/7 → fallback
    expect(r.archetypes.jestrab!.raw).toBe(3);
    const field = r.questions.find((q) => q.key === "neighbor_field")!;
    expect(field.options.find((o) => o.key === "un")?.raw).toBe(5); // 4 doves + torn
    expect(field.options.find((o) => o.key === "cousin")?.share_raw).toBeCloseTo(37.5, 2);
    expect(r.pairs.find((p) => p.key === "small_sticks_secret_weapon")?.raw).toBe(1);
    expect(r.questions.map((q) => q.position)).toEqual([1, 2, 3, 4, 6, 7, 8]);
  });

  it("filters by country and demographics ('kdyby vládli jen…')", async () => {
    const sk = await ctx.repo.planetResults(ctx.round.id, { country: "SK" });
    expect(sk.filtered).toBe(true);
    expect(sk.totals.raw).toBe(3);
    expect(sk.contradiction.raw).toBeCloseTo(33.33, 1);
    const young = await ctx.repo.planetResults(ctx.round.id, { age_band: "18-24" });
    expect(young.totals.raw).toBe(2);
    expect(young.archetypes.jestrab!.raw).toBe(2); // both 18-24 voters are hawks
    const men = await ctx.repo.planetResults(ctx.round.id, { gender: "m", country: "CZ" });
    expect(men.totals.raw).toBe(2);
    const empty = await ctx.repo.planetResults(ctx.round.id, { settlement: "rural", gender: "f" });
    expect(empty.totals.raw).toBe(0);
    expect(empty.survival.raw).toBeNull();
  });

  it("pulse + planet refresh", async () => {
    const pulse = await ctx.repo.pulseSeries(ctx.round.id, 10);
    expect(pulse.points).toHaveLength(10);
    expect(pulse.total).toBe(8);
    const ps = await ctx.repo.refreshPlanetPulse(ctx.round.id, true);
    expect(ps.votes_total).toBe(8);
    expect(ps.votes_verified).toBe(0);
    expect(ps.pulse_per_min).toBeGreaterThanOrEqual(0);
  });
});

describe("recompute (weights, country_stats, planet_stats)", () => {
  it("seeds synthetic votes and recomputes the round end to end", async () => {
    const seeded = await seedSynthetic(ctx.repo, { total: 700, countries: 6, seed: 7, roundSlug: "2026-w37", log: () => undefined });
    expect(seeded.inserted).toBeGreaterThan(500);

    const summary = await recomputeRound(ctx.repo, ctx.round.id, { log: () => undefined });
    expect(summary.weights_updated).toBe(summary.submissions);
    expect(summary.countries).toBeGreaterThanOrEqual(5);
    expect(summary.survival_weighted).not.toBeNull();

    const board = await ctx.repo.countryBoard(ctx.round.id);
    expect(board.unlock_threshold).toBe(500);
    expect(board.countries.length).toBe(summary.countries);
    // nobody has 500 votes here → nothing unlocked, no rank, no titles
    expect(board.countries.every((c) => !c.unlocked && c.rank === null && c.titles.length === 0)).toBe(true);
    const big = board.countries.filter((c) => c.submissions_count >= 30);
    expect(big.every((c) => !c.insufficient_sample)).toBe(true);
    expect(board.countries.filter((c) => c.submissions_count < 30).every((c) => c.insufficient_sample)).toBe(true);

    // Σ weights = n (normalisation) and weights differ between countries
    const w = await ctx.db.query<{ n: number; w: number; distinct: number }>(
      "select count(*)::int as n, sum(weight)::float as w, count(distinct weight)::int as distinct from submissions where round_id = $1 and not flagged",
      [ctx.round.id],
    );
    expect(w[0]!.w).toBeCloseTo(w[0]!.n, 0);
    expect(w[0]!.distinct).toBeGreaterThan(1);

    const planet = await ctx.repo.planetResults(ctx.round.id);
    expect(planet.totals.raw).toBe(w[0]!.n);
    expect(planet.survival.raw).not.toBe(planet.survival.weighted);

    const stats = await ctx.db.query<{ votes_total: number; countries_unlocked: number }>("select votes_total::int, countries_unlocked from planet_stats where round_id = $1", [ctx.round.id]);
    expect(stats[0]!.votes_total).toBe(w[0]!.n);
    const snaps = await ctx.repo.planetSnapshotSeries(ctx.round.id);
    expect(snaps.length).toBeGreaterThanOrEqual(1);
  });

  it("unlocks, ranks and titles countries once they pass the threshold", async () => {
    // lower the threshold via content sync of a modified header
    await ctx.db.query("update rounds set unlock_threshold = 40 where id = $1", [ctx.round.id]);
    const summary = await recomputeRound(ctx.repo, ctx.round.id, { log: () => undefined });
    expect(summary.unlocked).toBeGreaterThanOrEqual(2);
    const board = await ctx.repo.countryBoard(ctx.round.id);
    const unlocked = board.countries.filter((c) => c.unlocked);
    expect(unlocked.map((c) => c.rank)).toEqual(unlocked.map((_, i) => i + 1));
    // survival index sorted desc among unlocked
    for (let i = 1; i < unlocked.length; i++) expect(unlocked[i - 1]!.survival_index!).toBeGreaterThanOrEqual(unlocked[i]!.survival_index!);
    const allTitles = unlocked.flatMap((c) => c.titles);
    expect(allTitles).toContain("survivors");
    expect(unlocked[0]!.titles).toContain("survivors");
    expect(new Set(allTitles).size).toBe(loadTitles().titles.length);

    const cr = await ctx.repo.countryResults(ctx.round.id, unlocked[0]!.country_code);
    expect(cr.stats?.unlocked).toBe(true);
    expect(cr.questions).toHaveLength(7);
    const opt = cr.questions[0]!.options[0]!;
    expect(opt.planet_share_weighted).not.toBeNull();
    expect(cr.rivals.length).toBeGreaterThanOrEqual(1);

    const trend = await ctx.repo.questionTrend("neighbor_field");
    expect(trend.map((t) => t.slug)).toContain("2026-w37");
    await ctx.db.query("update rounds set unlock_threshold = 500 where id = $1", [ctx.round.id]);
  });

  it("export contains aggregates only and folds small countries into '--'", async () => {
    const exp = (await ctx.repo.exportRound(ctx.round.id)) as { countries: Array<{ submissions_count: number }>; options_by_country: Array<{ country_code: string }>; planet: { votes_total: number } };
    expect(exp.countries.every((c) => c.submissions_count >= 30)).toBe(true);
    const codes = new Set(exp.options_by_country.map((r) => r.country_code));
    expect(codes.has("--")).toBe(true);
    expect(codes.has("DE")).toBe(false); // 1 vote → folded
    expect(JSON.stringify(exp)).not.toContain("ip_hash");
  });
});

describe("verified layer", () => {
  it("links a cookie to a hashed identity, upgrades past votes and moves identity between cookies", async () => {
    const anon1 = randomUUID();
    const v = await ctx.repo.submitVote(buildVote(ctx.round, DOVE, { anon: anon1, country: "AT" }));
    expect(v.ok).toBe(true);
    const link = await ctx.repo.linkAuthUser({ anon_id: anon1, provider: "google", subject_hash: "hash-1" });
    expect(link.trust).toBe("verified");
    expect(link.upgraded).toBe(1);
    expect(link.conflicts).toBe(0);
    const session = await ctx.repo.authSession(link.session_id);
    expect(session.valid).toBe(true);
    if (v.ok) {
      const s = (await ctx.repo.getSubmission(v.submission_id))!;
      expect(s.trust).toBe("verified");
    }
    const verifiedOnly = await ctx.repo.planetResults(ctx.round.id, { trust: "verified" });
    expect(verifiedOnly.totals.raw).toBe(1);
    // same identity, new cookie, tries to vote again in the same round → duplicate
    const anon2 = randomUUID();
    const link2 = await ctx.repo.linkAuthUser({ anon_id: anon2, provider: "google", subject_hash: "hash-1" });
    expect(link2.auth_user_id).toBe(link.auth_user_id);
    const dup = await ctx.repo.submitVote(buildVote(ctx.round, HAWK, { anon: anon2, country: "AT" }));
    expect(dup.ok).toBe(false);
    if (!dup.ok && v.ok) expect(dup.submission_id).toBe(v.submission_id);
    const old = await ctx.db.query<{ auth_user_id: string | null }>("select auth_user_id from voters where anon_id = $1", [anon1]);
    expect(old[0]!.auth_user_id).toBeNull();
  });

  it("flags (never deletes) a later vote when linking reveals a double vote", async () => {
    const a = randomUUID();
    const b = randomUUID();
    const first = await ctx.repo.submitVote(buildVote(ctx.round, DOVE, { anon: a, country: "PL" }));
    const second = await ctx.repo.submitVote(buildVote(ctx.round, HAWK, { anon: b, country: "PL" }));
    expect(first.ok && second.ok).toBe(true);
    await ctx.repo.linkAuthUser({ anon_id: a, provider: "apple", subject_hash: "hash-2" });
    const link = await ctx.repo.linkAuthUser({ anon_id: b, provider: "apple", subject_hash: "hash-2" });
    expect(link.conflicts).toBe(1);
    if (second.ok) {
      const row = await ctx.db.query<{ flagged: boolean; flag_reasons: string[] }>("select flagged, flag_reasons from submissions where id = $1", [second.submission_id]);
      expect(row[0]!.flagged).toBe(true);
      expect(row[0]!.flag_reasons).toContain("duplicate_identity");
    }
  });
});

describe("narrator + jobs", () => {
  it("narrator posts are invisible until approved", async () => {
    const ctxJson = await ctx.repo.narratorContext(ctx.round.id);
    expect(ctxJson).toBeTruthy();
    const post = await ctx.repo.insertNarratorPost({ round_id: ctx.round.id, locale: "cs", body: "Planeta dnes drží.", model: "test", context: {} });
    expect(post.approved).toBe(false);
    expect(await ctx.repo.narratorPosts({ locale: "cs" })).toEqual([]);
    const approved = await ctx.repo.setNarratorApproval(post.id, true);
    expect(approved?.approved).toBe(true);
    expect(approved?.published_at).not.toBeNull();
    const list = await ctx.repo.narratorPosts({ locale: "cs" });
    expect(list).toHaveLength(1);
    expect("context" in list[0]!).toBe(false);
  });

  it("job lease is exclusive until released or expired", async () => {
    expect((await ctx.repo.acquireJobLease("recompute", 60)).acquired).toBe(true);
    expect((await ctx.repo.acquireJobLease("recompute", 60)).acquired).toBe(false);
    await ctx.repo.releaseJobLease("recompute", "ok");
    expect((await ctx.repo.acquireJobLease("recompute", 60)).acquired).toBe(true);
  });
});
