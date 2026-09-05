import "server-only";
import { getRepo } from "@/lib/db/server";
import { memo } from "./cache";
import { currentRound } from "./rounds";
import { pickLocalized } from "@/lib/content/i18n";
import { countryName, COUNTRIES } from "@/lib/countries";
import { archetypeMeta, titleMeta } from "@/lib/content/public";
import type { BoardCountry } from "@/components/viz/CountryBoard";
import type { MapCountry } from "@/components/viz/WorldMap";
import type { CampOption } from "@/components/viz/TwoCamps";
import type { PairShare } from "@/components/viz/ContradictionMeter";
import type { PlanetResults, PlanetStatsRow, PulseSeries, RoundPayload, NarratorPost } from "@/types/api";

/** Everything the landing and /planet need, localised, memoised for 15 s per process. */
export type PlanetPageData = {
  round: { id: string; slug: string; kind: string; title: string; blurb: string | null; ends_at: string | null; unlock_threshold: number } | null;
  stats: PlanetStatsRow | null;
  series: PulseSeries | null;
  results: PlanetResults | null;
  camps: Array<{ key: string; question: string; total: number; options: CampOption[] }>;
  pairs: PairShare[];
  board: BoardCountry[];
  map: MapCountry[];
  codes: Record<string, string>;
  archetypes: ReturnType<typeof archetypeMeta>;
  titles: ReturnType<typeof titleMeta>;
  narrator: NarratorPost | null;
  trend: Array<{ at: string; survival_weighted: number | null; survival_raw: number | null; votes_total: number }>;
};

export const NUMERIC_TO_CODE: Record<string, string> = Object.fromEntries(COUNTRIES.filter((c) => c.numeric).map((c) => [c.numeric as string, c.code]));

export function localiseRound(round: RoundPayload, locale: string): PlanetPageData["round"] {
  const l = pickLocalized(round.i18n, locale)?.value;
  return { id: round.id, slug: round.slug, kind: round.kind, title: l?.title ?? round.slug, blurb: l?.blurb ?? null, ends_at: round.ends_at, unlock_threshold: round.unlock_threshold };
}

export async function loadPlanetPage(locale: string): Promise<PlanetPageData> {
  const round = await currentRound();
  const archetypes = archetypeMeta(locale);
  const titles = titleMeta(locale);
  if (!round) return { round: null, stats: null, series: null, results: null, camps: [], pairs: [], board: [], map: [], codes: NUMERIC_TO_CODE, archetypes, titles, narrator: null, trend: [] };

  const raw = await memo(`planet:${round.id}`, 15_000, async () => {
    const repo = await getRepo();
    const [stats, series, results, board, narrator, trend] = await Promise.all([
      repo.refreshPlanetPulse(round.id),
      repo.pulseSeries(round.id, 60),
      repo.planetResults(round.id),
      repo.countryBoard(round.id),
      repo.narratorPosts({ locale, only_approved: true, limit: 1 }),
      repo.planetSnapshotSeries(round.id, 144),
    ]);
    return { stats, series, results, board, narrator: narrator[0] ?? null, trend };
  });

  const camps = raw.results.questions.map((q) => ({
    key: q.key,
    question: pickLocalized(q.i18n, locale)?.value.text ?? q.key,
    total: q.total_raw,
    options: q.options.map((o) => ({ key: o.key, text: pickLocalized(o.i18n, locale)?.value.text ?? o.key, icon: o.icon, share_weighted: o.share_weighted, share_raw: o.share_raw, raw: o.raw })),
  }));
  const pairs: PairShare[] = raw.results.pairs.map((p) => {
    const l = pickLocalized(p.i18n, locale)?.value;
    return { key: p.key, title: l?.title ?? p.key, blurb: l?.blurb, share_weighted: p.share_weighted, share_raw: p.share_raw };
  });
  const board: BoardCountry[] = raw.board.countries.map((c) => ({
    code: c.country_code,
    name: countryName(c.country_code, locale),
    survival_index: c.survival_index,
    contradiction_index: c.contradiction_index,
    submissions_count: c.submissions_count,
    unlocked: c.unlocked,
    insufficient_sample: c.insufficient_sample,
    top_archetype: c.top_archetype,
    titles: c.titles,
    rank: c.rank,
  }));
  const map: MapCountry[] = board.map((c) => ({ code: c.code, name: c.name, survival_index: c.survival_index, unlocked: c.unlocked, submissions_count: c.submissions_count }));

  return {
    round: localiseRound(round, locale),
    stats: raw.stats,
    series: raw.series,
    results: raw.results,
    camps,
    pairs,
    board,
    map,
    codes: NUMERIC_TO_CODE,
    archetypes,
    titles,
    narrator: raw.narrator,
    trend: raw.trend,
  };
}
