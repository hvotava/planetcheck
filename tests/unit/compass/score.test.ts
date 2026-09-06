import { describe, expect, it } from "vitest";
import { chanceBaseline, scoreCompass, scoreCompassAxes, skillOverChance } from "@/lib/compass/score";
import { loadCompass, staleFacts } from "@/lib/content/loader";
import { toScoringCompass } from "@/lib/compass/deck";
import type { ScoringCompassDeck } from "@/types/domain";

/** Three facts with three options each, plus two profile questions carrying axis weights. */
const DECK: ScoringCompassDeck = {
  version: 1,
  questions: [
    {
      key: "poverty",
      section: "fact",
      options: [
        { key: "ten", correct: true, axis_weights: {} },
        { key: "thirty", correct: false, bias: "pessimistic", axis_weights: {} },
        { key: "fifty", correct: false, bias: "pessimistic", axis_weights: {} },
      ],
    },
    {
      key: "co2",
      section: "fact",
      options: [
        { key: "fell", correct: false, bias: "optimistic", axis_weights: {} },
        { key: "flat", correct: false, bias: "optimistic", axis_weights: {} },
        { key: "record", correct: true, axis_weights: {} },
      ],
    },
    {
      key: "warheads",
      section: "fact",
      options: [
        { key: "fewer", correct: true, axis_weights: {} },
        { key: "same", correct: false, bias: "pessimistic", axis_weights: {} },
        { key: "more", correct: false, bias: "pessimistic", axis_weights: {} },
      ],
    },
    {
      key: "trust_people",
      section: "trust",
      options: [
        { key: "yes", correct: false, axis_weights: { trust_paranoia: -0.8 } },
        { key: "no", correct: false, axis_weights: { trust_paranoia: 0.8 } },
      ],
    },
    {
      key: "share_or_earn",
      section: "values",
      options: [
        { key: "share", correct: false, axis_weights: { us_them: -0.6 } },
        { key: "earn", correct: false, axis_weights: { us_them: 0.4 } },
      ],
    },
  ],
};

describe("chanceBaseline", () => {
  it("is exactly one third when every fact has three options", () => {
    expect(chanceBaseline(DECK)).toBeCloseTo(1 / 3, 10);
  });
  it("counts only the facts that were actually answered", () => {
    expect(chanceBaseline(DECK, ["poverty"])).toBeCloseTo(1 / 3, 10);
    expect(chanceBaseline(DECK, [])).toBeNull();
  });
  it("is null for a deck with no facts", () => {
    expect(chanceBaseline({ version: 1, questions: DECK.questions.filter((q) => q.section !== "fact") })).toBeNull();
  });
});

describe("skillOverChance", () => {
  it("is 0 at chance, 1 at perfect and negative below chance", () => {
    expect(skillOverChance(1 / 3, 1 / 3)).toBeCloseTo(0, 10);
    expect(skillOverChance(1, 1 / 3)).toBeCloseTo(1, 10);
    // 0 correct out of 3 with a third expected: (0 − 1/3) / (2/3) = −0.5
    expect(skillOverChance(0, 1 / 3)).toBeCloseTo(-0.5, 10);
    // 2 of 3 right: (0.6667 − 0.3333) / 0.6667 = 0.5
    expect(skillOverChance(2 / 3, 1 / 3)).toBeCloseTo(0.5, 10);
  });
  it("is null without data", () => {
    expect(skillOverChance(null, 1 / 3)).toBeNull();
    expect(skillOverChance(0.5, null)).toBeNull();
  });
});

describe("scoreCompass", () => {
  it("scores two of three facts and records which way the wrong one leaned", () => {
    const s = scoreCompass(
      [
        { question: "poverty", option: "ten" }, // correct
        { question: "co2", option: "fell" }, // wrong, optimistic
        { question: "warheads", option: "fewer" }, // correct
      ],
      DECK,
    );
    expect(s.facts_total).toBe(3);
    expect(s.facts_correct).toBe(2);
    expect(s.knowledge).toBeCloseTo(2 / 3, 10);
    expect(s.chance).toBeCloseTo(1 / 3, 10);
    expect(s.skill).toBeCloseTo(0.5, 10);
    expect(s.bias).toEqual({ pessimistic: 0, optimistic: 1 });
    expect(s.correct_keys.sort()).toEqual(["poverty", "warheads"]);
  });

  it("reports a score below chance when everything is wrong", () => {
    const s = scoreCompass(
      [
        { question: "poverty", option: "fifty" },
        { question: "co2", option: "flat" },
        { question: "warheads", option: "more" },
      ],
      DECK,
    );
    expect(s.knowledge).toBe(0);
    expect(s.skill).toBeCloseTo(-0.5, 10);
    expect(s.bias).toEqual({ pessimistic: 2, optimistic: 1 });
  });

  it("returns null knowledge when no fact was answered", () => {
    const s = scoreCompass([{ question: "trust_people", option: "yes" }], DECK);
    expect(s.facts_total).toBe(0);
    expect(s.knowledge).toBeNull();
    expect(s.chance).toBeNull();
    expect(s.skill).toBeNull();
    expect(s.axes.trust_paranoia).toBeCloseTo(-0.8 / 0.8, 10);
  });

  it("ignores unknown questions, unknown options and repeated answers", () => {
    const s = scoreCompass(
      [
        { question: "nope", option: "x" },
        { question: "poverty", option: "does_not_exist" },
        { question: "co2", option: "record" },
        { question: "co2", option: "fell" }, // repeat: must not be counted twice
      ],
      DECK,
    );
    expect(s.facts_total).toBe(1);
    expect(s.facts_correct).toBe(1);
    expect(s.bias).toEqual({ pessimistic: 0, optimistic: 0 });
  });

  it("never lets a fact move an axis", () => {
    const onlyFacts = scoreCompass(
      [
        { question: "poverty", option: "ten" },
        { question: "co2", option: "record" },
      ],
      DECK,
    );
    expect(onlyFacts.axes).toEqual({ peace_force: 0, trust_paranoia: 0, us_them: 0 });
  });

  it("normalises the profile axes over the profile questions only", () => {
    // trust_paranoia: chosen −0.8 over a maximum of 0.8 → −1
    // us_them: chosen +0.4 over a maximum of 0.6 → +0.667
    const axes = scoreCompassAxes(
      [
        { question: "trust_people", option: "yes" },
        { question: "share_or_earn", option: "earn" },
      ],
      DECK,
    );
    expect(axes.trust_paranoia).toBeCloseTo(-1, 10);
    expect(axes.us_them).toBeCloseTo(0.4 / 0.6, 10);
    expect(axes.peace_force).toBe(0);
  });
});

describe("content/compass.yaml", () => {
  const file = loadCompass();
  const deck = toScoringCompass(file);

  it("has twelve facts and eight profile questions in one ordered deck", () => {
    expect(file.questions.filter((q) => q.section === "fact")).toHaveLength(12);
    expect(file.questions.filter((q) => q.section !== "fact")).toHaveLength(8);
    const positions = file.questions.map((q) => q.position);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(new Set(positions).size).toBe(positions.length);
  });

  it("gives every fact a source, three options, one correct answer and a plain-language reveal", () => {
    for (const q of file.questions.filter((x) => x.section === "fact")) {
      expect(q.source, q.key).toBeTruthy();
      expect(q.source!.url, q.key).toMatch(/^https:\/\//);
      expect(q.options, q.key).toHaveLength(3);
      expect(q.options.filter((o) => o.correct), q.key).toHaveLength(1);
      expect(q.options.filter((o) => !o.correct).every((o) => o.bias), q.key).toBe(true);
      expect(q.i18n_answer?.cs?.text, q.key).toBeTruthy();
      expect(q.i18n_answer?.en?.text, q.key).toBeTruthy();
    }
  });

  it("has both cs and en for every question and option", () => {
    for (const q of file.questions) {
      expect(q.i18n.cs?.text, q.key).toBeTruthy();
      expect(q.i18n.en?.text, q.key).toBeTruthy();
      for (const o of q.options) {
        expect(o.i18n.cs?.text, `${q.key}.${o.key}`).toBeTruthy();
        expect(o.i18n.en?.text, `${q.key}.${o.key}`).toBeTruthy();
      }
    }
  });

  it("balances the deck so it is a measurement and not an argument", () => {
    // Wrong answers must be reachable in both directions, otherwise the bias number
    // only ever points one way and says nothing.
    const biases = file.questions.flatMap((q) => q.options.map((o) => o.bias).filter(Boolean));
    expect(biases).toContain("pessimistic");
    expect(biases).toContain("optimistic");
  });

  it("has no fact past its review date", () => {
    expect(staleFacts(file)).toEqual([]);
  });

  it("scores a perfect run of the real deck at skill 1", () => {
    const answers = file.questions
      .filter((q) => q.section === "fact")
      .map((q) => ({ question: q.key, option: q.options.find((o) => o.correct)!.key }));
    const s = scoreCompass(answers, deck);
    expect(s.facts_correct).toBe(12);
    expect(s.knowledge).toBe(1);
    expect(s.skill).toBeCloseTo(1, 10);
  });
});
