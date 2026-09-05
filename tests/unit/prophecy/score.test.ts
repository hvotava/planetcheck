import { describe, expect, it } from "vitest";
import { brierScore, calibration, forecastSkill, isOpenForGuesses, meanBrier } from "@/lib/prophecy/score";

describe("brierScore", () => {
  it("is 0 for a confident correct call and 1 for a confident wrong one", () => {
    expect(brierScore(100, true)).toBe(0);
    expect(brierScore(0, false)).toBe(0);
    expect(brierScore(100, false)).toBe(1);
    expect(brierScore(0, true)).toBe(1);
  });

  it("is 0.25 for a coin flip either way", () => {
    expect(brierScore(50, true)).toBeCloseTo(0.25, 10);
    expect(brierScore(50, false)).toBeCloseTo(0.25, 10);
  });

  it("matches (p − outcome)² for a concrete guess", () => {
    // 0.7 predicted, it happened → (0.7 − 1)² = 0.09
    expect(brierScore(70, true)).toBeCloseTo(0.09, 10);
    // 0.7 predicted, it did not → 0.49
    expect(brierScore(70, false)).toBeCloseTo(0.49, 10);
  });
});

describe("forecastSkill", () => {
  it("is 1 for perfect, 0 for coin-flip and negative for worse than chance", () => {
    expect(forecastSkill(0)).toBe(1);
    expect(forecastSkill(0.25)).toBe(0);
    expect(forecastSkill(0.5)).toBeCloseTo(-1, 10);
    expect(forecastSkill(null)).toBeNull();
  });
  it("clamps confidently wrong crowds to −1", () => {
    expect(forecastSkill(1)).toBe(-1);
  });
});

describe("meanBrier", () => {
  it("averages the scored guesses and ignores unscored ones", () => {
    expect(meanBrier([0.09, 0.49, null, undefined])).toBeCloseTo(0.29, 10);
    expect(meanBrier([null, null])).toBeNull();
  });
});

describe("calibration", () => {
  it("buckets by predicted decile and reports how often it actually happened", () => {
    const bins = calibration([
      { probability: 71, outcome: true },
      { probability: 75, outcome: true },
      { probability: 78, outcome: false },
      { probability: 79, outcome: true },
      { probability: 12, outcome: false },
      { probability: 15, outcome: false },
    ]);
    const seventies = bins.find((b) => b.bucket === 7)!;
    expect(seventies.n).toBe(4);
    expect(seventies.actual).toBeCloseTo(75, 10); // 3 of 4 happened
    expect(seventies.predicted).toBeCloseTo(75.75, 10);
    expect(seventies.label).toBe("70–79 %");
    const tens = bins.find((b) => b.bucket === 1)!;
    expect(tens.actual).toBe(0);
  });

  it("puts 100 % into the top bucket rather than an eleventh one", () => {
    const bins = calibration([{ probability: 100, outcome: true }]);
    expect(bins).toHaveLength(1);
    expect(bins[0]!.bucket).toBe(9);
  });
});

describe("isOpenForGuesses", () => {
  const now = new Date("2026-09-10T12:00:00Z");
  it("is open only inside the window and while the status says so", () => {
    const base = { status: "open", opens_at: "2026-09-08T00:00:00Z", closes_at: "2026-12-31T00:00:00Z" };
    expect(isOpenForGuesses(base, now)).toBe(true);
    expect(isOpenForGuesses({ ...base, status: "closed" }, now)).toBe(false);
    expect(isOpenForGuesses({ ...base, opens_at: "2026-09-20T00:00:00Z" }, now)).toBe(false);
    expect(isOpenForGuesses({ ...base, closes_at: "2026-09-09T00:00:00Z" }, now)).toBe(false);
  });
});
