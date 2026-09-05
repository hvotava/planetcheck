import { describe, expect, it } from "vitest";
import { buildCountryStats } from "@/lib/recompute/country-stats";
import type { CountryAggregate } from "@/types/api";
import type { CountryWeightDiagnostics } from "@/types/domain";
import { loadTitles } from "@/lib/content/loader";

function agg(code: string, n: number, survival: number, contradiction: number, trust: number): CountryAggregate {
  return {
    country_code: code,
    n,
    verified_n: 0,
    weight_sum: n,
    survival: { raw: survival - 1, weighted: survival },
    contradiction: { raw: contradiction, weighted: contradiction },
    realism: { raw: 0.6, weighted: 0.6 },
    compromise: { raw: 0.5, weighted: 0.5 },
    axis_means: { raw: { peace_force: 0, trust_paranoia: trust, us_them: 0 }, weighted: { peace_force: 0, trust_paranoia: trust, us_them: 0 } },
    archetypes: { diplomat: { raw: n, weighted: n, share_raw: 100, share_weighted: 100 } },
    pairs: {},
    top_archetype: "diplomat",
  };
}

const diag = (code: string, insufficient: boolean): CountryWeightDiagnostics => ({ country: code, n: 0, country_weight: 1, insufficient_sample: insufficient, raked: false, iterations: 0, converged: true });

describe("buildCountryStats", () => {
  const titles = loadTitles().titles;
  const rows = buildCountryStats(
    [agg("CZ", 600, 70, 20, 0.4), agg("SK", 550, 65, 30, -0.2), agg("DE", 120, 90, 5, 0.9), agg("AT", 20, 50, 50, 0)],
    [diag("CZ", false), diag("SK", false), diag("DE", false), diag("AT", true)],
    500,
    titles,
  );

  it("unlocks by threshold and ranks unlocked countries by weighted survival", () => {
    expect(rows.map((r) => [r.country_code, r.unlocked, r.rank])).toEqual([
      ["CZ", true, 1],
      ["SK", true, 2],
      ["DE", false, null],
      ["AT", false, null],
    ]);
    expect(rows.find((r) => r.country_code === "AT")!.insufficient_sample).toBe(true);
  });

  it("awards titles only among unlocked countries (DE has the best numbers but is locked)", () => {
    const cz = rows.find((r) => r.country_code === "CZ")!;
    const sk = rows.find((r) => r.country_code === "SK")!;
    const de = rows.find((r) => r.country_code === "DE")!;
    expect(de.titles).toEqual([]);
    expect(cz.titles).toContain("survivors");
    expect(cz.titles).toContain("most_paranoid");
    expect(cz.titles).toContain("most_consistent");
    expect(sk.titles).toContain("most_trusting");
    expect(sk.titles).toContain("most_torn");
    // every title is awarded exactly once
    const all = rows.flatMap((r) => r.titles);
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(titles.length);
  });

  it("uses weighted values as the index", () => {
    expect(rows.find((r) => r.country_code === "CZ")!.survival_index).toBe(70);
  });
});
