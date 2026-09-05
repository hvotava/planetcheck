import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildVote, createTestRepo, DOVE, HAWK } from "./helpers";

let ctx: Awaited<ReturnType<typeof createTestRepo>>;
let code: string;

beforeAll(async () => {
  ctx = await createTestRepo();
  code = (await ctx.repo.createClassCode({ label: "7.B", locale: "cs", ip_hash: "teacher" })).code;
});
afterAll(async () => {
  await ctx.close();
});

describe("school mode", () => {
  it("mints a six-character code from an unambiguous alphabet", async () => {
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    const info = await ctx.repo.classCodeInfo(code.toLowerCase());
    expect(info?.label).toBe("7.B");
  });

  it("tags a vote with the class and still counts it for the planet", async () => {
    const res = await ctx.repo.submitVote(buildVote(ctx.round, DOVE, { class_code: code, country: "CZ" }));
    expect(res.ok).toBe(true);
    const rows = await ctx.db.query<{ class_code: string; country_code: string; flagged: boolean }>(
      "select class_code, country_code, flagged from submissions where round_id = $1 and class_code is not null",
      [ctx.round.id],
    );
    expect(rows).toHaveLength(1);
    // the class is an extra label, not a replacement: the vote still belongs to its country
    expect(rows[0]).toMatchObject({ class_code: code, country_code: "CZ", flagged: false });
  });

  it("ignores an unknown class code rather than refusing the vote", async () => {
    const res = await ctx.repo.submitVote(buildVote(ctx.round, HAWK, { class_code: "ZZZZZZ" }));
    expect(res.ok).toBe(true);
    const rows = await ctx.db.query<{ n: number }>("select count(*)::int as n from submissions where class_code = 'ZZZZZZ'");
    expect(rows[0]!.n).toBe(0);
  });

  it("shows nothing but the count below the privacy floor", async () => {
    const r = (await ctx.repo.classResults(code, ctx.round.id, 5))!;
    expect(r.enough).toBe(false);
    expect(r.n).toBe(1);
    expect(r.questions).toEqual([]);
    expect(r.survival).toBeNull();
  });

  it("shows the class next to the planet once the floor is met", async () => {
    for (let i = 0; i < 5; i++) await ctx.repo.submitVote(buildVote(ctx.round, i % 2 ? HAWK : DOVE, { class_code: code, country: "CZ", rate_ip_per_hour: 60, ip: `class-${i}` }));
    const r = (await ctx.repo.classResults(code, ctx.round.id, 5))!;
    expect(r.enough).toBe(true);
    expect(r.n).toBe(6);
    expect(r.questions.length).toBeGreaterThan(0);
    const q = r.questions.find((x) => x.key === "neighbor_field")!;
    const shares = q.options.reduce((s, o) => s + (o.share_raw ?? 0), 0);
    expect(shares).toBeCloseTo(100, 0);
    // a class is not a sample of a population, so it is deliberately never weighted
    expect(r.survival?.weighted).toBeNull();
    expect(Number(r.survival?.raw)).toBeGreaterThan(0);
    // the planet's share travels alongside, so the lesson can compare
    expect(q.options.every((o) => o.planet_share_weighted !== undefined)).toBe(true);
  });

  it("does not flag a whole class voting from one school network", async () => {
    const ip = "one-school-network";
    const flags: string[][] = [];
    for (let i = 0; i < 25; i++) {
      const res = await ctx.repo.submitVote(buildVote(ctx.round, DOVE, { class_code: code, ip, country: "CZ", rate_ip_per_hour: 60 }));
      if (res.ok) flags.push(res.flags);
    }
    expect(flags).toHaveLength(25);
    expect(flags.every((f) => !f.includes("rate_ip"))).toBe(true);
  });

  it("still flags the same burst without a class code", async () => {
    const ip = "not-a-classroom";
    const flags: string[][] = [];
    for (let i = 0; i < 12; i++) {
      const res = await ctx.repo.submitVote(buildVote(ctx.round, DOVE, { ip, country: "SK", rate_ip_per_hour: 10 }));
      if (res.ok) flags.push(res.flags);
    }
    expect(flags.some((f) => f.includes("rate_ip"))).toBe(true);
  });

  it("returns null for an unknown class", async () => {
    expect(await ctx.repo.classResults("QQQQQQ", ctx.round.id, 5)).toBeNull();
  });

  it("keeps one vote per person per round even inside a class", async () => {
    const anon = randomUUID();
    const first = await ctx.repo.submitVote(buildVote(ctx.round, DOVE, { anon, class_code: code, rate_ip_per_hour: 60 }));
    const second = await ctx.repo.submitVote(buildVote(ctx.round, HAWK, { anon, class_code: code, rate_ip_per_hour: 60 }));
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
  });
});
