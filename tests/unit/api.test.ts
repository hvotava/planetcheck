import { describe, expect, it } from "vitest";
import { voteBodySchema } from "@/lib/api/vote-schema";
import { parseFilter } from "@/lib/api/filter";
import { flagEmoji } from "@/components/ui/Flag";
import { survivalColor } from "@/components/viz/WorldMap";

const uuid = "123e4567-e89b-42d3-a456-426614174000";

describe("vote body schema", () => {
  it("accepts a well-formed vote", () => {
    const r = voteBodySchema.safeParse({
      roundId: uuid,
      answers: [{ questionId: uuid, optionId: uuid }],
      metaGuesses: [{ questionId: uuid, guess: 42 }],
      demographics: { age_band: "25-34", gender: "x", settlement: null, declared_country: "cz" },
      token: null,
      loadedAt: new Date().toISOString(),
      locale: "cs",
    });
    expect(r.success).toBe(true);
  });
  it("rejects out-of-range guesses, unknown bands and non-uuids", () => {
    expect(voteBodySchema.safeParse({ roundId: uuid, answers: [{ questionId: uuid, optionId: uuid }], metaGuesses: [{ questionId: uuid, guess: 101 }] }).success).toBe(false);
    expect(voteBodySchema.safeParse({ roundId: uuid, answers: [{ questionId: uuid, optionId: uuid }], demographics: { age_band: "12-17" } }).success).toBe(false);
    expect(voteBodySchema.safeParse({ roundId: "nope", answers: [{ questionId: uuid, optionId: uuid }] }).success).toBe(false);
    expect(voteBodySchema.safeParse({ roundId: uuid, answers: [] }).success).toBe(false);
  });
});

describe("results filter", () => {
  it("parses and upper-cases country, ignores empty strings", () => {
    const r = parseFilter(new URLSearchParams("trust=verified&country=cz&gender="));
    expect(r).toEqual({ filter: { trust: "verified", country: "CZ" }, filtered: true });
    expect(parseFilter(new URLSearchParams(""))).toEqual({ filter: {}, filtered: false });
  });
  it("rejects invalid values", () => {
    expect("error" in parseFilter(new URLSearchParams("age_band=99"))).toBe(true);
  });
});

describe("ui helpers", () => {
  it("flag emoji from alpha-2", () => {
    expect(flagEmoji("cz")).toBe("🇨🇿");
    expect(flagEmoji(null)).toBe("🌍");
  });
  it("survival colour scale is monotone red → amber → green", () => {
    expect(survivalColor(0)).toBe("rgb(255,92,108)");
    expect(survivalColor(50)).toBe("rgb(255,180,84)");
    expect(survivalColor(100)).toBe("rgb(61,255,160)");
  });
});
