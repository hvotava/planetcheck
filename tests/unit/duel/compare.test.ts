import { describe, expect, it } from "vitest";
import { compareCountries, shareAgreement, type DuelSideInput } from "@/lib/duel/compare";

function makeSide(code: string, shares: Record<string, Record<string, number>>, stats?: Partial<NonNullable<DuelSideInput["stats"]>>): DuelSideInput {
  return {
    code,
    live_count: 100,
    stats: {
      submissions_count: 100,
      unlocked: true,
      survival_index: 60,
      contradiction_index: 20,
      realism_mean: 0.5,
      axis_means: { weighted: { peace_force: 0.2, trust_paranoia: -0.1, us_them: 0.3 }, raw: { peace_force: 0.2, trust_paranoia: -0.1, us_them: 0.3 } },
      top_archetype: "diplomat",
      titles: [],
      ...stats,
    },
    questions: Object.entries(shares).map(([key, opts], i) => ({
      key,
      position: i + 1,
      options: Object.entries(opts).map(([k, v]) => ({ key: k, icon: null, share_raw: v, share_weighted: v })),
    })),
  };
}

describe("shareAgreement", () => {
  it("is 100 for identical distributions and 0 for disjoint ones", () => {
    expect(shareAgreement([50, 50], [50, 50])).toBe(100);
    expect(shareAgreement([100, 0], [0, 100])).toBe(0);
  });

  it("is 100 − half the summed absolute difference", () => {
    // |70−40| + |30−60| = 60 → 100 − 30 = 70
    expect(shareAgreement([70, 30], [40, 60])).toBeCloseTo(70, 6);
  });

  it("normalises distributions that do not sum to 100", () => {
    // b renormalises to 70/30, identical to a
    expect(shareAgreement([70, 30], [35, 15])).toBeCloseTo(100, 6);
  });

  it("returns null when a side has no data", () => {
    expect(shareAgreement([0, 0], [50, 50])).toBeNull();
    expect(shareAgreement([], [])).toBeNull();
  });
});

describe("compareCountries", () => {
  const a = makeSide("CZ", { field: { un: 70, cousin: 30 }, well: { pipeline: 20, dam: 80 } });
  const b = makeSide("SK", { field: { un: 40, cousin: 60 }, well: { pipeline: 25, dam: 75 } });

  it("scores each shared question and averages the agreement", () => {
    const d = compareCountries(a, b);
    expect(d.questions.map((q) => q.key)).toEqual(["field", "well"]);
    expect(d.questions[0]!.agreement.weighted).toBeCloseTo(70, 6); // 100 − (30+30)/2
    expect(d.questions[1]!.agreement.weighted).toBeCloseTo(95, 6); // 100 − (5+5)/2
    expect(d.agreement.weighted).toBeCloseTo(82.5, 6);
    expect(d.agreement.raw).toBeCloseTo(82.5, 6);
    expect(d.comparable).toBe(true);
  });

  it("names the question they disagree on most", () => {
    expect(compareCountries(a, b).biggest?.key).toBe("field");
  });

  it("reports each side's leading option and whether they lead the same way", () => {
    const d = compareCountries(a, b);
    expect(d.questions[0]).toMatchObject({ top_a: "un", top_b: "cousin", same_top: false });
    expect(d.questions[1]).toMatchObject({ top_a: "dam", top_b: "dam", same_top: true });
  });

  it("gives per-option gaps raw and weighted", () => {
    const opt = compareCountries(a, b).questions[0]!.options[0]!;
    expect(opt).toMatchObject({ key: "un", a: { weighted: 70, raw: 70 }, b: { weighted: 40, raw: 40 } });
    expect(opt.gap).toEqual({ weighted: 30, raw: 30 });
  });

  it("ignores questions the other country does not have", () => {
    const only = makeSide("SK", { field: { un: 40, cousin: 60 } });
    const d = compareCountries(a, only);
    expect(d.questions).toHaveLength(1);
  });

  it("compares the three axes and their distance", () => {
    const far = makeSide("SK", { field: { un: 40, cousin: 60 } }, {
      axis_means: { weighted: { peace_force: -0.5, trust_paranoia: -0.1, us_them: 0.3 }, raw: {} as never },
    });
    const d = compareCountries(a, far);
    expect(d.axes.find((x) => x.axis === "peace_force")).toEqual({ axis: "peace_force", a: 0.2, b: -0.5, gap: 0.7 });
    expect(d.axes.find((x) => x.axis === "us_them")?.gap).toBeCloseTo(0, 6);
  });

  it("is not comparable when one side has no votes", () => {
    const empty: DuelSideInput = { code: "XX", live_count: 0, stats: null, questions: [] };
    const d = compareCountries(a, empty);
    expect(d.comparable).toBe(false);
    expect(d.b.votes).toBe(0);
    expect(d.agreement.weighted).toBeNull();
  });
});
