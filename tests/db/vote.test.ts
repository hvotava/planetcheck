import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildVote, createTestRepo, CONTROL, DOVE, HAWK, TORN } from "./helpers";

let ctx: Awaited<ReturnType<typeof createTestRepo>>;

beforeAll(async () => {
  ctx = await createTestRepo();
});
afterAll(async () => {
  await ctx.close();
});

describe("content sync", () => {
  it("loads the weekly round with anchors, meta targets and pairs", async () => {
    const r = ctx.round;
    expect(r.kind).toBe("weekly");
    expect(r.questions).toHaveLength(8);
    expect(r.questions.map((q) => q.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const meta = r.questions.find((q) => q.key === "secret_weapon_meta")!;
    expect(meta.target?.question_key).toBe("secret_weapon");
    expect(meta.target?.option_key).toBe("buy");
    expect(meta.position).toBe(r.questions.find((q) => q.key === "secret_weapon")!.position - 1);
    expect(r.contradictions).toHaveLength(6);
    expect(r.questions.flatMap((q) => q.options).filter((o) => o.honeypot)).toHaveLength(1);
  });

  it("is idempotent and deactivates removed options instead of deleting", async () => {
    const { syncContent } = await import("@/lib/content/sync");
    const again = await syncContent(ctx.repo, { log: () => undefined });
    expect(again.rounds.find((x) => x.slug === "2026-w37")?.questions).toBe(8);
    const ids = await ctx.db.query<{ n: number }>("select count(*)::int as n from questions where round_id = $1", [ctx.round.id]);
    expect(ids[0]!.n).toBe(8);
    // simulate content removing an option
    const q = ctx.round.questions.find((x) => x.key === "the_referee")!;
    await ctx.repo.syncRound({
      slug: "2026-w37",
      kind: "weekly",
      status: "live",
      starts_at: ctx.round.starts_at,
      ends_at: ctx.round.ends_at,
      unlock_threshold: 500,
      survival_weights: ctx.round.survival_weights,
      i18n: ctx.round.i18n,
      questions: ctx.round.questions.map((qq) => ({
        key: qq.key,
        type: qq.type,
        position: qq.position,
        i18n: qq.i18n,
        review_required: qq.review_required,
        anchor: qq.anchor,
        target: qq.target ? { question: qq.target.question_key, option: qq.target.option_key } : undefined,
        options: qq.options
          .filter((o) => !(qq.key === "the_referee" && o.key === "lottery"))
          .map((o) => ({ key: o.key, position: o.position, i18n: o.i18n, axis_weights: o.axis_weights, compromise: o.compromise, honeypot: o.honeypot, icon: o.icon ?? undefined })),
      })),
      contradictions: ctx.round.contradictions.map((c) => ({ key: c.key, i18n: c.i18n, a: { question: c.a.question_key, option: c.a.option_key }, b: { question: c.b.question_key, option: c.b.option_key } })),
    });
    const rows = await ctx.db.query<{ key: string; active: boolean }>("select key, active from options where question_id = $1 order by position", [q.id]);
    expect(rows.find((r) => r.key === "lottery")?.active).toBe(false);
    expect(rows.filter((r) => r.active)).toHaveLength(3);
    // restore
    await syncContent(ctx.repo, { log: () => undefined });
    const restored = await ctx.db.query<{ n: number }>("select count(*)::int as n from options where question_id = $1 and active", [q.id]);
    expect(restored[0]!.n).toBe(4);
  });
});

describe("submit_vote", () => {
  it("stores a vote, scores it and exposes it via get_submission", async () => {
    const anon = randomUUID();
    const res = await ctx.repo.submitVote(buildVote(ctx.round, DOVE, { anon, meta: { secret_weapon_meta: { guess: 40, actual: 30 } } }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.flags).toEqual([]);
    expect(res.country).toBe("CZ");
    const s = (await ctx.repo.getSubmission(res.submission_id))!;
    expect(s.answers).toHaveLength(7);
    expect(s.meta_guesses).toHaveLength(1);
    expect(s.realism).toBeCloseTo(0.9, 3);
    expect(s.archetype).toBe("diplomat");
    expect(s.consistency).toBe(1);
    expect(s.compromise).toBe(1); // every DOVE choice is a compromise option
    expect(s.axis_scores.peace_force).toBeLessThan(0);
    expect(s.round.slug).toBe("2026-w37");
    const status = await ctx.repo.voterStatus(ctx.round.id, anon);
    expect(status?.submission_id).toBe(res.submission_id);
  });

  it("returns duplicate for the same cookie in the same round, never a silent replacement", async () => {
    const anon = randomUUID();
    const first = await ctx.repo.submitVote(buildVote(ctx.round, DOVE, { anon }));
    const second = await ctx.repo.submitVote(buildVote(ctx.round, HAWK, { anon }));
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (first.ok && !second.ok) {
      expect(second.code).toBe("duplicate");
      expect(second.submission_id).toBe(first.submission_id);
      const s = (await ctx.repo.getSubmission(first.submission_id))!;
      expect(s.answers.find((a) => a.question_key === "neighbor_field")?.option_key).toBe("un");
    }
    // …but the same cookie may play another round
    const other = await ctx.repo.submitVote(buildVote(ctx.anchor, { neighbor_field: "fence", stranger_at_door: "yard", bigger_stick: "believe", village_well: "buy", rumor: "ignore" }, { anon }));
    expect(other.ok).toBe(true);
  });

  it("flags the honeypot and keeps flagged votes out of the aggregates", async () => {
    const q = ctx.round.questions.find((x) => x.key === "bigger_stick")!;
    const before = await ctx.repo.questionShares(q.id);
    const res = await ctx.repo.submitVote(buildVote(ctx.round, CONTROL));
    expect(res.ok && res.flags).toEqual(["honeypot"]);
    const after = await ctx.repo.questionShares(q.id);
    expect(after.total_raw).toBe(before.total_raw);
    const control = after.options.find((o) => o.key === "control")!;
    expect(control.raw).toBe(0);
  });

  it("flags rate_ip after 10 votes/hour from one ip_hash — and still accepts them", async () => {
    const ip = "shared-school-network";
    const flagsSeen: string[][] = [];
    for (let i = 0; i < 11; i++) {
      const res = await ctx.repo.submitVote(buildVote(ctx.round, DOVE, { ip, country: "SK" }));
      expect(res.ok).toBe(true);
      if (res.ok) flagsSeen.push(res.flags);
    }
    expect(flagsSeen.slice(0, 10).every((f) => f.length === 0)).toBe(true);
    expect(flagsSeen[10]).toEqual(["rate_ip"]);
  });

  it("records contradictions and country mismatch flags supplied by the API layer", async () => {
    const res = await ctx.repo.submitVote(buildVote(ctx.round, TORN, { flags: ["country_mismatch"], declared_country: "DE", country: "DE" }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const s = (await ctx.repo.getSubmission(res.submission_id))!;
    expect(s.contradictions_hit.sort()).toEqual(["open_door_closed_village", "small_sticks_secret_weapon", "un_for_me_weapon_for_me", "un_judge_but_boats_decide"]);
    expect(s.consistency).toBeCloseTo(1 - 4 / 6, 4);
    expect(s.country_code).toBe("DE");
    const row = await ctx.db.query<{ flagged: boolean; flag_reasons: string[] }>("select flagged, flag_reasons from submissions where id = $1", [res.submission_id]);
    expect(row[0]).toEqual({ flagged: true, flag_reasons: ["country_mismatch"] });
  });

  it("maps unknown countries to null (counted as '--')", async () => {
    const res = await ctx.repo.submitVote(buildVote(ctx.round, HAWK, { country: "T1" }));
    expect(res.ok && res.country).toBeNull();
  });

  it("question_shares gives raw and weighted shares, per planet and per country", async () => {
    const q = ctx.round.questions.find((x) => x.key === "neighbor_field")!;
    const shares = await ctx.repo.questionShares(q.id, "SK");
    expect(shares.total_raw).toBeGreaterThan(0);
    const sumRaw = shares.options.reduce((s, o) => s + (o.share_raw ?? 0), 0);
    expect(sumRaw).toBeCloseTo(100, 0);
    expect(shares.country?.code).toBe("SK");
    expect(shares.country?.options.find((o) => o.key === "un")?.raw).toBe(10); // 11th vote was flagged rate_ip
    const actuals = await ctx.repo.metaActuals(ctx.round.id);
    expect(actuals).toHaveLength(1);
    expect(actuals[0]!.actual_weighted).not.toBeNull();
  });
});
