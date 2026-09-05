import type { CountryResults } from "@/types/api";
import { compareCountries, type DuelComparison, type DuelSideInput } from "./compare";

export * from "./compare";

/** Adapts the country_results payload to the duel's input shape. Keeps compare.ts free of API types. */
export function toDuelSide(r: CountryResults): DuelSideInput {
  return {
    code: r.country_code,
    live_count: r.live_count,
    stats: r.stats
      ? {
          submissions_count: r.stats.submissions_count,
          unlocked: r.stats.unlocked,
          survival_index: r.stats.survival_index,
          contradiction_index: r.stats.contradiction_index,
          realism_mean: r.stats.realism_mean,
          axis_means: r.stats.axis_means,
          top_archetype: r.stats.top_archetype,
          titles: r.stats.titles,
        }
      : null,
    questions: r.questions.map((q) => ({
      key: q.key,
      position: q.position,
      options: q.options.map((o) => ({ key: o.key, icon: o.icon, share_raw: o.share_raw, share_weighted: o.share_weighted })),
    })),
  };
}

export function duelFromResults(a: CountryResults, b: CountryResults): DuelComparison {
  return compareCountries(toDuelSide(a), toDuelSide(b));
}
