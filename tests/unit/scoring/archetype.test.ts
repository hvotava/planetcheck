import { describe, expect, it } from "vitest";
import { assignArchetype, ruleMatches } from "@/lib/scoring/archetype";
import { scoreSubmission } from "@/lib/scoring";
import { ROUND, RULES } from "./fixtures";

const base = { realism: 0.8, consistency: 1, compromise: 0, survival: 0.6 };

describe("assignArchetype", () => {
  it("svycar when all axes are within ±0.2", () => {
    expect(assignArchetype({ ...base, axes: { peace_force: 0.1, trust_paranoia: -0.19, us_them: 0 } }, RULES)).toBe("svycar");
  });
  it("holubice needs peace AND trust", () => {
    expect(assignArchetype({ ...base, axes: { peace_force: -0.5, trust_paranoia: -0.1, us_them: 0 } }, RULES)).toBe("holubice");
    expect(assignArchetype({ ...base, axes: { peace_force: -0.5, trust_paranoia: 0.3, us_them: 0 } }, RULES)).toBe("strejda");
  });
  it("jestrab beats diplomat because rules are ordered", () => {
    expect(assignArchetype({ ...base, compromise: 0.9, axes: { peace_force: 0.7, trust_paranoia: 0, us_them: 0 } }, RULES)).toBe("jestrab");
  });
  it("diplomat when compromise > 0.5", () => {
    expect(assignArchetype({ ...base, compromise: 0.67, axes: { peace_force: 0.1, trust_paranoia: 0.5, us_them: 0 } }, RULES)).toBe("diplomat");
  });
  it("strejda when unrealistic and tribal; fallback otherwise", () => {
    expect(assignArchetype({ ...base, realism: 0.2, axes: { peace_force: 0.1, trust_paranoia: 0.5, us_them: 0.5 } }, RULES)).toBe("strejda");
    expect(assignArchetype({ ...base, axes: { peace_force: 0.3, trust_paranoia: 0.5, us_them: -0.5 } }, RULES)).toBe("strejda");
  });
  it("a null metric never satisfies a comparison", () => {
    expect(ruleMatches({ key: "x", when: { realism: { lt: 0.4 } } }, { ...base, realism: null, axes: { peace_force: 0, trust_paranoia: 0, us_them: 0 } })).toBe(false);
  });
});

describe("scoreSubmission (end-to-end, concrete numbers)", () => {
  it("scores a hawkish, contradictory player", () => {
    const s = scoreSubmission(
      {
        answers: [
          { question: "field", option: "un" }, // peace −1, trust +1, compromise
          { question: "stick", option: "treaty" }, // peace −0.6, trust +0.2, compromise
          { question: "weapon", option: "buy" }, // peace +0.8, trust +0.6
        ],
        metaGuesses: [{ question: "field_meta", guess: 50, actual: 30 }], // realism 0.8
        round: ROUND,
      },
      RULES,
    );
    expect(s.axes.peace_force).toBeCloseTo(-0.8 / 2.4, 6);
    expect(s.axes.trust_paranoia).toBeCloseTo(1.8 / 2.4, 6);
    expect(s.axes.us_them).toBe(0);
    expect(s.contradictions_hit.sort()).toEqual(["treaty_but_buy", "un_but_cousin"]);
    expect(s.consistency).toBe(0); // 2 of 2 pairs
    expect(s.compromise).toBeCloseTo(2 / 3, 6);
    expect(s.realism).toBeCloseTo(0.8, 6);
    // 0.4·0 + 0.35·0.6667 + 0.25·0.8 = 0.43333
    expect(s.survival).toBeCloseTo(0.43333, 4);
    expect(s.archetype).toBe("diplomat");
    expect(s.honeypot_hit).toBe(false);
  });

  it("flags the honeypot and still scores", () => {
    const s = scoreSubmission(
      {
        answers: [
          { question: "field", option: "moon" },
          { question: "stick", option: "believe" },
          { question: "weapon", option: "promise" },
        ],
        metaGuesses: [],
        round: ROUND,
      },
      RULES,
    );
    expect(s.honeypot_hit).toBe(true);
    expect(s.realism).toBeNull();
    expect(s.consistency).toBe(1);
    expect(s.compromise).toBeCloseTo(1 / 3, 6);
    // renormalised: (0.4·1 + 0.35·0.3333)/0.75 = 0.68889
    expect(s.survival).toBeCloseTo(0.68889, 4);
    // peace −0.8/2.4 = −0.33 (not < −0.4 → not holubice), compromise 1/3, realism null → fallback
    expect(s.archetype).toBe("strejda");
  });
});
