import type { Repo } from "@/lib/db/repo";
import { loadTitles, loadWeighting, weightingParams } from "@/lib/content/loader";
import { COUNTRIES } from "@/lib/countries";
import { computeWeights, targetsFromJson } from "@/lib/weighting/raking";
import type { CountryPopulation, SubmissionCell } from "@/types/domain";
import { buildCountryStats } from "./country-stats";

export type RecomputeSummary = {
  round_id: string;
  slug: string;
  submissions: number;
  weights_updated: number;
  countries: number;
  unlocked: number;
  survival_raw: number | null;
  survival_weighted: number | null;
  raked_countries: string[];
  finalized_meta: number;
};

function countriesMap(): Map<string, CountryPopulation> {
  return new Map(
    COUNTRIES.map((c) => [c.code, { code: c.code, population: c.population, targets: targetsFromJson(c.demographics) }] as const),
  );
}

/** Full recompute of one round (ARCHITECTURE §9–§10): weights → aggregates → country_stats → planet_stats. */
export async function recomputeRound(repo: Repo, roundId: string, opts: { log?: (m: string) => void } = {}): Promise<RecomputeSummary> {
  const log = opts.log ?? console.log;
  const round = await repo.getRound({ id: roundId });
  if (!round) throw new Error(`round ${roundId} not found`);
  const params = weightingParams(loadWeighting());
  const titles = loadTitles().titles;
  const countries = countriesMap();

  const cells = (await repo.submissionCells(roundId)) as SubmissionCell[];
  const weighting = computeWeights(cells, countries, params);
  const applied = await repo.applyCellWeights(
    roundId,
    weighting.cells.map((c) => ({ country: c.country, age_band: c.age_band, gender: c.gender, weight: c.weight })),
  );
  log(`[${round.slug}] weights: ${applied.updated} submissions over ${weighting.cells.length} cells`);

  const aggregates = await repo.countryAggregates(roundId);
  const rows = buildCountryStats(aggregates, weighting.countries, round.unlock_threshold, titles);
  await repo.upsertCountryStats(roundId, rows);
  const planet = await repo.recomputePlanetStats(roundId);
  log(`[${round.slug}] countries: ${rows.length} (${rows.filter((r) => r.unlocked).length} unlocked), planet survival ${planet.survival_raw} raw / ${planet.survival_weighted} weighted`);

  let finalized = 0;
  if (round.status === "closed" || (round.ends_at && new Date(round.ends_at) < new Date())) {
    finalized = (await repo.finalizeMetaActuals(roundId)).updated;
  }

  return {
    round_id: roundId,
    slug: round.slug,
    submissions: weighting.total,
    weights_updated: applied.updated,
    countries: rows.length,
    unlocked: rows.filter((r) => r.unlocked).length,
    survival_raw: planet.survival_raw,
    survival_weighted: planet.survival_weighted,
    raked_countries: weighting.countries.filter((c) => c.raked).map((c) => c.country),
    finalized_meta: finalized,
  };
}

/** Recomputes every live round plus rounds closed within the last 7 days. */
export async function recomputeAll(repo: Repo, opts: { log?: (m: string) => void } = {}): Promise<RecomputeSummary[]> {
  const rounds = await repo.listRounds(false);
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  const out: RecomputeSummary[] = [];
  for (const r of rounds) {
    const recentlyClosed = r.status === "closed" && r.ends_at && new Date(r.ends_at).getTime() > cutoff;
    if (r.status !== "live" && !recentlyClosed) continue;
    out.push(await recomputeRound(repo, r.id, opts));
  }
  return out;
}
