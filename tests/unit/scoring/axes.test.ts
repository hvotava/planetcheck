import { describe, expect, it } from "vitest";
import { scoreAxes } from "@/lib/scoring/axes";
import { ROUND } from "./fixtures";

describe("scoreAxes", () => {
  // max |weight| per axis in ROUND: peace_force 1 + 0.6 + 0.8 = 2.4; trust_paranoia 1 + 0.8 + 0.6 = 2.4; us_them 1 + 0 + 0.6 = 1.6
  it("normalises the sum of chosen weights by the maximum possible absolute sum", () => {
    const s = scoreAxes(
      [
        { question: "field", option: "cousin" }, // peace +1, us_them +1
        { question: "stick", option: "bigger" }, // peace +0.6, trust +0.6
        { question: "weapon", option: "buy" }, // peace +0.8, trust +0.6
      ],
      ROUND,
    );
    expect(s.peace_force).toBeCloseTo(2.4 / 2.4, 6);
    expect(s.trust_paranoia).toBeCloseTo(1.2 / 2.4, 6);
    expect(s.us_them).toBeCloseTo(1 / 1.6, 6);
  });

  it("is 0 on every axis for the neutral fence/believe/alliance combo except where weights exist", () => {
    const s = scoreAxes(
      [
        { question: "field", option: "fence" }, // trust −0.5
        { question: "stick", option: "believe" }, // trust −0.8
        { question: "weapon", option: "alliance" }, // peace −0.2, us_them −0.6
      ],
      ROUND,
    );
    expect(s.peace_force).toBeCloseTo(-0.2 / 2.4, 6);
    expect(s.trust_paranoia).toBeCloseTo(-1.3 / 2.4, 6);
    expect(s.us_them).toBeCloseTo(-0.6 / 1.6, 6);
  });

  it("ignores unknown questions/options and clamps to [-1, 1]", () => {
    const s = scoreAxes([{ question: "nope", option: "x" }, { question: "field", option: "zzz" }], ROUND);
    expect(s).toEqual({ peace_force: 0, trust_paranoia: 0, us_them: 0 });
  });

  it("returns 0 for an axis no option in the round touches", () => {
    const round = { ...ROUND, questions: [ROUND.questions[1]!] };
    const s = scoreAxes([{ question: "stick", option: "bigger" }], round);
    expect(s.us_them).toBe(0);
    expect(s.peace_force).toBeCloseTo(1, 6);
  });
});
