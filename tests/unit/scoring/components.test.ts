import { describe, expect, it } from "vitest";
import { scoreRealism } from "@/lib/scoring/realism";
import { findContradictions, scoreConsistency } from "@/lib/scoring/contradiction";
import { honeypotHit, scoreCompromise } from "@/lib/scoring/compromise";
import { scoreSurvival } from "@/lib/scoring/survival";
import { ROUND } from "./fixtures";

describe("scoreRealism", () => {
  it("averages 1 − |guess − actual| / 100", () => {
    expect(
      scoreRealism([
        { question: "a", guess: 40, actual: 30 }, // 0.9
        { question: "b", guess: 10, actual: 60 }, // 0.5
      ]),
    ).toBeCloseTo(0.7, 6);
  });
  it("skips guesses without planet data and returns null when none remain", () => {
    expect(scoreRealism([{ question: "a", guess: 40, actual: null }])).toBeNull();
    expect(scoreRealism([{ question: "a", guess: 40, actual: null }, { question: "b", guess: 25, actual: 25 }])).toBe(1);
  });
  it("is exactly 0 for the worst possible guess", () => {
    expect(scoreRealism([{ question: "a", guess: 100, actual: 0 }])).toBe(0);
  });
});

describe("contradictions", () => {
  it("finds pairs where both tense options were chosen", () => {
    const hits = findContradictions(
      [
        { question: "stick", option: "treaty" },
        { question: "weapon", option: "buy" },
        { question: "field", option: "fence" },
      ],
      ROUND,
    );
    expect(hits).toEqual(["treaty_but_buy"]);
  });
  it("finds multiple pairs sharing an option", () => {
    const hits = findContradictions(
      [
        { question: "stick", option: "treaty" },
        { question: "weapon", option: "buy" },
        { question: "field", option: "un" },
      ],
      ROUND,
    );
    expect(hits.sort()).toEqual(["treaty_but_buy", "un_but_cousin"]);
  });
  it("consistency = 1 − hits/pairs, 1 when the round has no pairs", () => {
    expect(scoreConsistency(1, 2)).toBe(0.5);
    expect(scoreConsistency(0, 2)).toBe(1);
    expect(scoreConsistency(2, 2)).toBe(0);
    expect(scoreConsistency(0, 0)).toBe(1);
  });
});

describe("compromise + honeypot", () => {
  it("compromise is the share of compromise options among answered choice questions", () => {
    const v = scoreCompromise(
      [
        { question: "field", option: "un" }, // compromise
        { question: "stick", option: "bigger" },
        { question: "weapon", option: "promise" }, // compromise
      ],
      ROUND,
    );
    expect(v).toBeCloseTo(2 / 3, 6);
    expect(scoreCompromise([], ROUND)).toBe(0);
  });
  it("detects the honeypot", () => {
    expect(honeypotHit([{ question: "field", option: "moon" }], ROUND)).toBe(true);
    expect(honeypotHit([{ question: "field", option: "un" }], ROUND)).toBe(false);
  });
});

describe("scoreSurvival", () => {
  const w = { consistency: 0.4, compromise: 0.35, realism: 0.25 };
  it("is the weighted sum with the round's coefficients", () => {
    // 0.4·0.5 + 0.35·(2/3) + 0.25·0.7 = 0.2 + 0.2333 + 0.175 = 0.6083
    expect(scoreSurvival({ consistency: 0.5, compromise: 2 / 3, realism: 0.7 }, w)).toBeCloseTo(0.60833, 4);
  });
  it("renormalises when realism is unavailable", () => {
    // (0.4·1 + 0.35·0) / 0.75 = 0.5333
    expect(scoreSurvival({ consistency: 1, compromise: 0, realism: null }, w)).toBeCloseTo(0.53333, 4);
  });
  it("is bounded 0..1", () => {
    expect(scoreSurvival({ consistency: 1, compromise: 1, realism: 1 }, w)).toBe(1);
    expect(scoreSurvival({ consistency: 0, compromise: 0, realism: 0 }, w)).toBe(0);
  });
});
