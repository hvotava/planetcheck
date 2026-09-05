import {
  AGE_BANDS,
  type AgeBand,
  type CellWeight,
  type CountryPopulation,
  type CountryWeightDiagnostics,
  type DemographicTargets,
  type SubmissionCell,
  type WeightingParams,
  type WeightingResult,
} from "@/types/domain";

/**
 * Post-stratification weights (ARCHITECTURE §9). Pure: cells in, weights out.
 *
 * 1. Country weight = (pop_country / pop_world) / (n_country / n_total), clamped.
 *    Countries below `min_country_submissions` (and unknown country) get 1 + insufficient_sample.
 * 2. Inside a country with ≥ `min_demographic_submissions` fully-demographic submissions:
 *    iterative proportional fitting (raking) on age_band × gender margins against the
 *    country's targets. Factors are trimmed to `cell_clamp` and re-centred so the mean
 *    weight of demographic rows stays 1 (rows without demographics keep factor 1).
 * 3. Final weight = product, normalised so that Σ weights = number of submissions.
 *
 * Operates on cells (country × age_band × gender counts), not rows, so it is O(cells).
 */
export function computeWeights(
  cells: SubmissionCell[],
  countries: Map<string, CountryPopulation>,
  params: WeightingParams,
): WeightingResult {
  const total = cells.reduce((s, c) => s + c.n, 0);
  const worldPop = [...countries.values()].reduce((s, c) => s + c.population, 0);

  const byCountry = new Map<string | null, SubmissionCell[]>();
  for (const c of cells) {
    const key = c.country && countries.has(c.country) ? c.country : null;
    const arr = byCountry.get(key) ?? [];
    arr.push(c);
    byCountry.set(key, arr);
  }

  const out: CellWeight[] = [];
  const diagnostics: CountryWeightDiagnostics[] = [];

  for (const [country, group] of byCountry) {
    const n = group.reduce((s, c) => s + c.n, 0);
    const info = country ? countries.get(country) : undefined;

    // --- step 1: country weight
    let countryWeight = 1;
    let insufficient = true;
    if (info && total > 0 && worldPop > 0 && n >= params.min_country_submissions) {
      const popShare = info.population / worldPop;
      const sampleShare = n / total;
      countryWeight = clamp(popShare / sampleShare, params.country_clamp[0], params.country_clamp[1]);
      insufficient = false;
    }

    // --- step 2: raking inside the country
    const demoCells = group.filter((c) => c.age_band != null && (c.gender === "f" || c.gender === "m"));
    const nDemo = demoCells.reduce((s, c) => s + c.n, 0);
    let factors = new Map<SubmissionCell, number>();
    let raked = false;
    let iterations = 0;
    let converged = false;
    if (info?.targets && nDemo >= params.min_demographic_submissions && demoCells.length > 0) {
      const r = rake(demoCells, info.targets, params);
      factors = r.factors;
      raked = true;
      iterations = r.iterations;
      converged = r.converged;
    }

    for (const c of group) {
      out.push({ ...c, weight: countryWeight * (factors.get(c) ?? 1) });
    }
    diagnostics.push({
      country: country ?? "--",
      n,
      country_weight: countryWeight,
      insufficient_sample: insufficient,
      raked,
      iterations,
      converged,
    });
  }

  // --- step 3: global normalisation Σ(n·w) = total
  const weighted = out.reduce((s, c) => s + c.n * c.weight, 0);
  const norm = weighted > 0 ? total / weighted : 1;
  for (const c of out) c.weight = round6(c.weight * norm);
  for (const d of diagnostics) d.country_weight = round6(d.country_weight * norm);

  diagnostics.sort((a, b) => b.n - a.n);
  return { cells: out, countries: diagnostics, total };
}

type RakeResult = { factors: Map<SubmissionCell, number>; iterations: number; converged: boolean };

/** Iterative proportional fitting on age_band × gender. Exported for tests. */
export function rake(cells: SubmissionCell[], targets: DemographicTargets, params: WeightingParams): RakeResult {
  const w = new Map<SubmissionCell, number>(cells.map((c) => [c, 1]));
  const nDemo = cells.reduce((s, c) => s + c.n, 0);

  // Renormalise targets over categories present in the sample (an absent category cannot be raked to).
  const presentBands = AGE_BANDS.filter((b) => cells.some((c) => c.age_band === b));
  const presentGenders = (["f", "m"] as const).filter((g) => cells.some((c) => c.gender === g));
  const bandTargets = normalise(presentBands.map((b) => [b, targets.age_band[b] ?? 0] as const));
  const genderTargets = normalise(presentGenders.map((g) => [g, targets.gender[g] ?? 0] as const));

  const weightedTotal = () => cells.reduce((s, c) => s + c.n * (w.get(c) ?? 1), 0);
  const share = (pred: (c: SubmissionCell) => boolean) =>
    cells.filter(pred).reduce((s, c) => s + c.n * (w.get(c) ?? 1), 0) / weightedTotal();

  const maxDeviation = () => {
    let dev = 0;
    for (const [b, t] of bandTargets) dev = Math.max(dev, Math.abs(share((c) => c.age_band === b) - t));
    for (const [g, t] of genderTargets) dev = Math.max(dev, Math.abs(share((c) => c.gender === g) - t));
    return dev;
  };

  let iterations = 0;
  let converged = maxDeviation() < params.tolerance;
  while (!converged && iterations < params.max_iterations) {
    iterations++;
    for (const [b, t] of bandTargets) {
      const s = share((c) => c.age_band === b);
      if (s > 0) for (const c of cells) if (c.age_band === b) w.set(c, (w.get(c) ?? 1) * (t / s));
    }
    for (const [g, t] of genderTargets) {
      const s = share((c) => c.gender === g);
      if (s > 0) for (const c of cells) if (c.gender === g) w.set(c, (w.get(c) ?? 1) * (t / s));
    }
    converged = maxDeviation() < params.tolerance;
  }

  // Trim to cell_clamp and re-centre so the demographic rows keep mean weight 1.
  // Re-centring can push a value back outside the clamp, so alternate until stable.
  for (let pass = 0; pass < 25; pass++) {
    let changed = 0;
    for (const c of cells) {
      const v = w.get(c) ?? 1;
      const t = clamp(v, params.cell_clamp[0], params.cell_clamp[1]);
      changed = Math.max(changed, Math.abs(v - t));
      w.set(c, t);
    }
    const wt = weightedTotal();
    const centre = wt > 0 ? nDemo / wt : 1;
    for (const c of cells) w.set(c, (w.get(c) ?? 1) * centre);
    if (changed < 1e-9) break;
  }

  return { factors: w, iterations, converged };
}

function normalise<K extends string>(pairs: ReadonlyArray<readonly [K, number]>): Array<[K, number]> {
  const sum = pairs.reduce((s, [, v]) => s + v, 0);
  if (sum <= 0) return pairs.map(([k]) => [k, 1 / Math.max(1, pairs.length)]);
  return pairs.map(([k, v]) => [k, v / sum]);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function round6(v: number): number {
  return Math.round(v * 1_000_000) / 1_000_000;
}

/** Convenience for callers holding the JSON from data/countries.json. */
export function targetsFromJson(d: { age_band: Record<string, number>; gender: Record<string, number> }): DemographicTargets {
  const age_band = {} as Record<AgeBand, number>;
  for (const b of AGE_BANDS) age_band[b] = d.age_band[b] ?? 0;
  return { age_band, gender: { f: d.gender.f ?? 0.5, m: d.gender.m ?? 0.5 } };
}
