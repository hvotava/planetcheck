import type { CountryAggregate, CountryStatsRow } from "@/types/api";
import type { CountryWeightDiagnostics } from "@/types/domain";
import type { TitlesFile } from "@/lib/content/schema";

/**
 * Pure: country aggregates + weighting diagnostics + content rules → country_stats rows.
 *  - unlocked: submissions ≥ round.unlock_threshold
 *  - insufficient_sample: from weighting (n < min_country_submissions)
 *  - rank: among unlocked, by weighted survival index desc (ties: more submissions first, then code)
 *  - titles: content/titles.yaml, each evaluated among unlocked countries
 */
export function buildCountryStats(
  aggregates: CountryAggregate[],
  diagnostics: CountryWeightDiagnostics[],
  unlockThreshold: number,
  titles: TitlesFile["titles"],
): CountryStatsRow[] {
  const diag = new Map(diagnostics.map((d) => [d.country, d] as const));
  const rows: CountryStatsRow[] = aggregates.map((a) => ({
    country_code: a.country_code,
    submissions_count: a.n,
    verified_count: a.verified_n,
    unlocked: a.n >= unlockThreshold,
    insufficient_sample: diag.get(a.country_code)?.insufficient_sample ?? true,
    survival_index: a.survival.weighted,
    contradiction_index: a.contradiction.weighted,
    realism_mean: a.realism.weighted,
    compromise_mean: a.compromise.weighted,
    axis_means: a.axis_means,
    archetype_shares: a.archetypes,
    contradiction_shares: a.pairs,
    top_archetype: a.top_archetype,
    titles: [],
    rank: null,
  }));

  const unlocked = rows.filter((r) => r.unlocked);
  unlocked.sort(
    (x, y) =>
      (y.survival_index ?? -1) - (x.survival_index ?? -1) ||
      y.submissions_count - x.submissions_count ||
      x.country_code.localeCompare(y.country_code),
  );
  unlocked.forEach((r, i) => {
    r.rank = i + 1;
  });

  for (const t of titles) {
    let best: CountryStatsRow | null = null;
    let bestValue = t.pick === "max" ? -Infinity : Infinity;
    for (const r of unlocked) {
      const v = metricValue(r, t.metric);
      if (v == null) continue;
      const better = t.pick === "max" ? v > bestValue : v < bestValue;
      const tie = v === bestValue && best && r.country_code.localeCompare(best.country_code) < 0;
      if (better || tie) {
        best = r;
        bestValue = v;
      }
    }
    if (best) best.titles.push(t.key);
  }

  rows.sort((x, y) => (x.rank ?? 1e9) - (y.rank ?? 1e9) || y.submissions_count - x.submissions_count || x.country_code.localeCompare(y.country_code));
  return rows;
}

export function metricValue(r: CountryStatsRow, metric: TitlesFile["titles"][number]["metric"]): number | null {
  switch (metric) {
    case "axis_means.peace_force":
    case "axis_means.trust_paranoia":
    case "axis_means.us_them": {
      const axis = metric.slice("axis_means.".length) as "peace_force" | "trust_paranoia" | "us_them";
      return r.axis_means.weighted?.[axis] ?? null;
    }
    case "survival_index":
      return r.survival_index;
    case "contradiction_index":
      return r.contradiction_index;
    case "realism_mean":
      return r.realism_mean;
    case "compromise_mean":
      return r.compromise_mean;
  }
}
