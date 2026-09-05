import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestRepo } from "./helpers";

let ctx: Awaited<ReturnType<typeof createTestRepo>>;

/** A prophecy that is open right now, independent of the dates in content/prophecies.yaml. */
const OPEN = {
  key: "test_open",
  category: "test",
  opens_at: new Date(Date.now() - 86_400_000).toISOString(),
  closes_at: new Date(Date.now() + 86_400_000).toISOString(),
  resolves_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
  review_required: false,
  i18n: { en: { title: "Will it rain?", blurb: "Settled by the weather service." } },
};
const NOT_YET = { ...OPEN, key: "test_future", opens_at: new Date(Date.now() + 86_400_000).toISOString(), closes_at: new Date(Date.now() + 2 * 86_400_000).toISOString(), resolves_at: new Date(Date.now() + 3 * 86_400_000).toISOString() };

async function guess(key: string, probability: number, country: string | null = "CZ", anon = randomUUID()) {
  return ctx.repo.submitProphecyGuess({ key, anon_id: anon, probability, country, ip_hash: "test-hash", locale: "cs", flags: [] });
}

beforeAll(async () => {
  ctx = await createTestRepo();
  await ctx.repo.syncProphecies([OPEN, NOT_YET] as never);
});
afterAll(async () => {
  await ctx.close();
});

describe("prophecies", () => {
  it("syncs from content and exposes the ones that have opened", async () => {
    const open = await ctx.repo.listProphecies({});
    expect(open.map((p) => p.key)).toContain("test_open");
    expect(open.map((p) => p.key)).not.toContain("test_future");
    const all = await ctx.repo.listProphecies({ include_future: true });
    expect(all.map((p) => p.key)).toContain("test_future");
  });

  it("also carries the prophecies from content/prophecies.yaml", async () => {
    const all = await ctx.repo.listProphecies({ include_future: true });
    expect(all.map((p) => p.key)).toContain("warmest_year_2026");
  });

  it("accepts one guess per voter and refuses a second, never replacing it", async () => {
    const anon = randomUUID();
    const first = await guess("test_open", 70, "CZ", anon);
    expect(first.ok).toBe(true);
    const second = await guess("test_open", 10, "CZ", anon);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe("duplicate");
    const stats = (await ctx.repo.prophecyStats({ key: "test_open" }))!;
    expect(stats.n).toBe(1);
    expect(stats.mean.raw).toBe(70); // the first guess stands
  });

  it("refuses guesses on a prophecy that has not opened", async () => {
    const res = await guess("test_future", 50);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("closed");
  });

  it("refuses an unknown prophecy", async () => {
    const res = await guess("no_such_thing", 50);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("not_found");
  });

  it("averages guesses raw and weighted, and buckets them", async () => {
    for (const [p, c] of [[80, "CZ"], [90, "CZ"], [20, "SK"]] as Array<[number, string]>) await guess("test_open", p, c);
    const s = (await ctx.repo.prophecyStats({ key: "test_open" }))!;
    expect(s.n).toBe(4); // 70, 80, 90 (CZ) + 20 (SK)
    expect(s.mean.raw).toBeCloseTo(65, 2);
    // weighted differs from raw because CZ is over-represented relative to population
    expect(s.mean.weighted).not.toBeNull();
    expect(s.mean.weighted).not.toBeCloseTo(65, 2);
    expect(s.histogram.find((h) => h.bucket === 2)?.n).toBe(1); // the 20 % guess
    expect(s.countries.find((c) => c.country_code === "CZ")?.n).toBe(3);
  });

  it("scores every guess with a Brier score on resolution", async () => {
    const res = await ctx.repo.resolveProphecy({ key: "test_open", outcome: true, note: "It rained, per the weather service." });
    expect(res.ok).toBe(true);
    expect(res.scored).toBe(4);
    const s = (await ctx.repo.prophecyStats({ key: "test_open" }))!;
    expect(s.status).toBe("resolved");
    expect(s.outcome).toBe(true);
    // (0.3² + 0.2² + 0.1² + 0.8²) / 4 = (0.09 + 0.04 + 0.01 + 0.64) / 4 = 0.195
    expect(Number(s.brier.raw)).toBeCloseTo(0.195, 5);
    expect(s.resolution_note).toContain("weather service");
  });

  it("closes prophecies whose window has passed", async () => {
    await ctx.repo.syncProphecies([
      { ...OPEN, key: "test_due", opens_at: new Date(Date.now() - 3 * 86_400_000).toISOString(), closes_at: new Date(Date.now() - 86_400_000).toISOString(), resolves_at: new Date(Date.now() - 3600_000).toISOString() },
    ] as never);
    const r = await ctx.repo.closeDueProphecies();
    expect(r.closed).toBeGreaterThanOrEqual(1);
    const s = (await ctx.repo.prophecyStats({ key: "test_due" }))!;
    expect(s.status).toBe("closed");
    const late = await guess("test_due", 50);
    expect(late.ok).toBe(false);
  });

  it("voids a prophecy and clears its scores", async () => {
    await ctx.repo.syncProphecies([{ ...OPEN, key: "test_void" }] as never);
    await guess("test_void", 60);
    const res = await ctx.repo.resolveProphecy({ key: "test_void", void: true, note: "The source stopped publishing the figure." });
    expect(res.ok).toBe(true);
    const s = (await ctx.repo.prophecyStats({ key: "test_void" }))!;
    expect(s.status).toBe("void");
    expect(s.outcome).toBeNull();
    expect(s.brier.raw).toBeNull();
  });
});
