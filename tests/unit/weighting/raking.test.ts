import { describe, expect, it } from "vitest";
import { computeWeights, rake } from "@/lib/weighting/raking";
import type { CountryPopulation, DemographicTargets, SubmissionCell, WeightingParams } from "@/types/domain";

const PARAMS: WeightingParams = {
  country_clamp: [0.2, 5],
  cell_clamp: [0.2, 5],
  min_country_submissions: 30,
  min_demographic_submissions: 200,
  max_iterations: 10,
  tolerance: 0.01,
};

const uniform: DemographicTargets = {
  age_band: { "18-24": 1 / 6, "25-34": 1 / 6, "35-44": 1 / 6, "45-54": 1 / 6, "55-64": 1 / 6, "65+": 1 / 6 },
  gender: { f: 0.5, m: 0.5 },
};

function countries(list: CountryPopulation[]): Map<string, CountryPopulation> {
  return new Map(list.map((c) => [c.code, c]));
}

describe("country weights (step 1)", () => {
  it("weights countries by population share / sample share, normalised to Σw = n", () => {
    // A: 25 % of population, 40 % of sample → 0.625; B: 75 % / 60 % → 1.25. Σ = 40·0.625 + 60·1.25 = 100 = n.
    const cells: SubmissionCell[] = [
      { country: "A", age_band: null, gender: null, n: 40 },
      { country: "B", age_band: null, gender: null, n: 60 },
    ];
    const r = computeWeights(cells, countries([{ code: "A", population: 100 }, { code: "B", population: 300 }]), PARAMS);
    const wA = r.cells.find((c) => c.country === "A")!.weight;
    const wB = r.cells.find((c) => c.country === "B")!.weight;
    expect(wA).toBeCloseTo(0.625, 3);
    expect(wB).toBeCloseTo(1.25, 3);
    expect(r.cells.reduce((s, c) => s + c.n * c.weight, 0)).toBeCloseTo(100, 6);
    expect(r.countries.find((d) => d.country === "A")!.insufficient_sample).toBe(false);
  });

  it("clamps to [0.2, 5] before normalisation", () => {
    // C: 1 % of population but 50 % of sample → 0.02 → clamped 0.2. D: 99 % / 50 % → 1.98.
    const cells: SubmissionCell[] = [
      { country: "C", age_band: null, gender: null, n: 50 },
      { country: "D", age_band: null, gender: null, n: 50 },
    ];
    const r = computeWeights(cells, countries([{ code: "C", population: 1 }, { code: "D", population: 99 }]), PARAMS);
    const wC = r.cells.find((c) => c.country === "C")!.weight;
    const wD = r.cells.find((c) => c.country === "D")!.weight;
    // pre-normalisation 0.2 and 1.98 → Σ = 50·0.2 + 50·1.98 = 109 → norm 100/109
    expect(wC).toBeCloseTo(0.2 * (100 / 109), 3);
    expect(wD).toBeCloseTo(1.98 * (100 / 109), 3);
    expect(wC / wD).toBeCloseTo(0.2 / 1.98, 6);
  });

  it("gives weight 1 (before normalisation) and insufficient_sample below 30 submissions, and to unknown countries", () => {
    const cells: SubmissionCell[] = [
      { country: "A", age_band: null, gender: null, n: 10 },
      { country: null, age_band: null, gender: null, n: 10 },
      { country: "B", age_band: null, gender: null, n: 80 },
    ];
    const r = computeWeights(cells, countries([{ code: "A", population: 500 }, { code: "B", population: 500 }]), PARAMS);
    const dA = r.countries.find((d) => d.country === "A")!;
    const dU = r.countries.find((d) => d.country === "--")!;
    const dB = r.countries.find((d) => d.country === "B")!;
    expect(dA.insufficient_sample).toBe(true);
    expect(dU.insufficient_sample).toBe(true);
    expect(dB.insufficient_sample).toBe(false);
    // B: 0.5 / 0.8 = 0.625; A and unknown: 1 → Σ = 10 + 10 + 50 = 70 → norm 100/70
    expect(dA.country_weight).toBeCloseTo(100 / 70, 3);
    expect(dB.country_weight).toBeCloseTo(0.625 * (100 / 70), 3);
  });
});

describe("raking inside a country (step 2)", () => {
  // 2×2 table with a closed-form solution: sample (a1,f)=80 (a1,m)=40 (a2,f)=40 (a2,m)=40, odds ratio 2.
  // Targets 50/50 on both margins → fitted cells x=100·√2/(1+√2)=58.5786 on the diagonal, 41.4214 off.
  const cells: SubmissionCell[] = [
    { country: "Z", age_band: "18-24", gender: "f", n: 80 },
    { country: "Z", age_band: "18-24", gender: "m", n: 40 },
    { country: "Z", age_band: "25-34", gender: "f", n: 40 },
    { country: "Z", age_band: "25-34", gender: "m", n: 40 },
  ];
  const targets: DemographicTargets = {
    age_band: { "18-24": 0.5, "25-34": 0.5, "35-44": 0, "45-54": 0, "55-64": 0, "65+": 0 },
    gender: { f: 0.5, m: 0.5 },
  };

  it("converges to the closed-form IPF solution to 3 decimals", () => {
    const r = rake(cells, targets, { ...PARAMS, tolerance: 1e-9, max_iterations: 200 });
    const x = (100 * Math.SQRT2) / (1 + Math.SQRT2);
    expect(r.converged).toBe(true);
    expect(r.factors.get(cells[0]!)).toBeCloseTo(x / 80, 3); // 0.732
    expect(r.factors.get(cells[1]!)).toBeCloseTo((100 - x) / 40, 3); // 1.036
    expect(r.factors.get(cells[2]!)).toBeCloseTo((100 - x) / 40, 3); // 1.036
    expect(r.factors.get(cells[3]!)).toBeCloseTo(x / 40, 3); // 1.464
    // margins hit the targets
    const wt = cells.reduce((s, c) => s + c.n * r.factors.get(c)!, 0);
    const f = cells.filter((c) => c.gender === "f").reduce((s, c) => s + c.n * r.factors.get(c)!, 0) / wt;
    expect(f).toBeCloseTo(0.5, 6);
    expect(wt).toBeCloseTo(200, 6); // mean weight 1 preserved
  });

  it("stops within tolerance 0.01 in at most 10 iterations with the production parameters", () => {
    const r = rake(cells, targets, PARAMS);
    expect(r.converged).toBe(true);
    expect(r.iterations).toBeLessThanOrEqual(10);
    expect(r.iterations).toBeGreaterThanOrEqual(1);
  });

  it("is applied only when the country has ≥ 200 fully-demographic submissions", () => {
    const small = cells.map((c) => ({ ...c, n: c.n / 2 })); // 100 rows
    const rSmall = computeWeights(small, countries([{ code: "Z", population: 1, targets }]), PARAMS);
    expect(rSmall.countries[0]!.raked).toBe(false);
    expect(new Set(rSmall.cells.map((c) => c.weight)).size).toBe(1);

    const rBig = computeWeights(cells, countries([{ code: "Z", population: 1, targets }]), PARAMS);
    expect(rBig.countries[0]!.raked).toBe(true);
    expect(new Set(rBig.cells.map((c) => c.weight)).size).toBeGreaterThanOrEqual(3);
  });

  it("leaves rows without demographics at the country weight and keeps mean weight 1 among raked rows", () => {
    const withUnknown = [...cells, { country: "Z", age_band: null, gender: null, n: 100 }, { country: "Z", age_band: "18-24" as const, gender: "x" as const, n: 20 }];
    const r = computeWeights(withUnknown, countries([{ code: "Z", population: 1, targets }]), PARAMS);
    const unknown = r.cells.find((c) => c.age_band === null)!;
    const nonBinary = r.cells.find((c) => c.gender === "x")!;
    expect(unknown.weight).toBeCloseTo(1, 6);
    expect(nonBinary.weight).toBeCloseTo(1, 6);
    const demo = r.cells.filter((c) => c.age_band != null && c.gender !== "x");
    const mean = demo.reduce((s, c) => s + c.n * c.weight, 0) / demo.reduce((s, c) => s + c.n, 0);
    expect(mean).toBeCloseTo(1, 6);
  });

  it("trims extreme raking factors to cell_clamp", () => {
    // 1 old woman among 199 young men → untrimmed factor would explode.
    const skewed: SubmissionCell[] = [
      { country: "Z", age_band: "18-24", gender: "m", n: 199 },
      { country: "Z", age_band: "65+", gender: "f", n: 1 },
    ];
    const r = rake(skewed, uniform, PARAMS);
    for (const f of r.factors.values()) {
      expect(f).toBeLessThanOrEqual(PARAMS.cell_clamp[1] + 1e-6);
      expect(f).toBeGreaterThanOrEqual(PARAMS.cell_clamp[0] - 1e-6);
    }
    // the rare cell sits at the cap, the common cell just under mean 1
    expect(r.factors.get(skewed[1]!)!).toBeCloseTo(5, 3);
    expect(r.factors.get(skewed[0]!)!).toBeCloseTo((200 - 5) / 199, 3);
    const mean = skewed.reduce((s, c) => s + c.n * r.factors.get(c)!, 0) / 200;
    expect(mean).toBeCloseTo(1, 6);
  });
});
