/**
 * Builds data/countries.json — the single source for country codes, names, population
 * and demographic targets used by the map, the country board and post-stratification.
 *
 * Sources:
 *   - world-countries (npm): ISO codes, names + translations, region, flag emoji, UN membership
 *   - World Bank API (api.worldbank.org/v2): population and 5-year age × sex structure
 *
 * Run: pnpm data:countries
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import countries from "world-countries";

const OUT = resolve(process.cwd(), "data/countries.json");
const WB = "https://api.worldbank.org/v2/country/all/indicator";

const LOCALE_KEYS: Record<string, string> = {
  cs: "ces", sk: "slk", de: "deu", pl: "pol", fr: "fra", es: "spa", it: "ita", pt: "por",
  ru: "rus", ja: "jpn", ko: "kor", zh: "zho", ar: "ara", hu: "hun", nl: "nld", sv: "swe",
  fi: "fin", tr: "tur", hr: "hrv", sr: "srp", et: "est", fa: "per", ur: "urd",
};

const AGE5 = ["1519", "2024", "2529", "3034", "3539", "4044", "4549", "5054", "5559", "6064", "6569", "7074", "7579", "80UP"] as const;
const BANDS = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"] as const;
type Band = (typeof BANDS)[number];

// Countries the World Bank does not report. Population: UN WPP 2024 estimates.
const MANUAL_POPULATION: Record<string, number> = {
  TW: 23_400_000, // Taiwan
  VA: 500,
};

type WbRow = { countryiso3code: string; country: { id: string }; date: string; value: number | null };

async function wb(indicator: string): Promise<Map<string, { value: number; date: string }>> {
  const url = `${WB}/${indicator}?format=json&mrnev=1&per_page=400`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`World Bank ${indicator}: HTTP ${res.status}`);
  const json = (await res.json()) as [unknown, WbRow[] | null];
  const out = new Map<string, { value: number; date: string }>();
  for (const row of json[1] ?? []) {
    if (row.value == null) continue;
    const iso3 = row.countryiso3code === "XKX" ? "UNK" : row.countryiso3code; // Kosovo
    out.set(iso3, { value: row.value, date: row.date });
  }
  return out;
}

function bandsFrom5y(s: Record<string, number>): Record<Band, number> {
  // s[age5] = % of that sex's population. 18-24 takes 2/5 of the 15-19 group.
  const g = (k: string) => s[k] ?? 0;
  const raw: Record<Band, number> = {
    "18-24": 0.4 * g("1519") + g("2024"),
    "25-34": g("2529") + g("3034"),
    "35-44": g("3539") + g("4044"),
    "45-54": g("4549") + g("5054"),
    "55-64": g("5559") + g("6064"),
    "65+": g("6569") + g("7074") + g("7579") + g("80UP"),
  };
  return raw;
}

async function main() {
  console.log("Fetching World Bank indicators…");
  const [pop, femaleShare] = await Promise.all([wb("SP.POP.TOTL"), wb("SP.POP.TOTL.FE.ZS")]);
  const fe: Record<string, Map<string, { value: number }>> = {};
  const ma: Record<string, Map<string, { value: number }>> = {};
  for (const a of AGE5) {
    [fe[a], ma[a]] = await Promise.all([wb(`SP.POP.${a}.FE.5Y`), wb(`SP.POP.${a}.MA.5Y`)]);
    process.stdout.write(".");
  }
  console.log("\nAssembling…");

  const worldFallback = { f: {} as Record<Band, number>, m: {} as Record<Band, number>, fShare: 0.496 };
  const list = [];
  const sumsF: Record<Band, number> = { "18-24": 0, "25-34": 0, "35-44": 0, "45-54": 0, "55-64": 0, "65+": 0 };
  const sumsM: Record<Band, number> = { ...sumsF };
  let weightSum = 0;

  for (const c of countries) {
    const iso3 = c.cca3;
    const p = pop.get(iso3);
    const population = p?.value ?? MANUAL_POPULATION[c.cca2] ?? 0;
    if (!population) continue;

    const f5: Record<string, number> = {};
    const m5: Record<string, number> = {};
    let complete = true;
    for (const a of AGE5) {
      const fv = fe[a]?.get(iso3)?.value;
      const mv = ma[a]?.get(iso3)?.value;
      if (fv == null || mv == null) { complete = false; break; }
      f5[a] = fv; m5[a] = mv;
    }
    let demographics: { age_band: Record<string, number>; gender: Record<string, number>; joint: Record<string, { f: number; m: number }>; source: "WB" | "world-average" } | undefined;
    if (complete) {
      const fBands = bandsFrom5y(f5);
      const mBands = bandsFrom5y(m5);
      const fShare = (femaleShare.get(iso3)?.value ?? 49.6) / 100;
      const fAdult = BANDS.reduce((s, b) => s + fBands[b], 0);
      const mAdult = BANDS.reduce((s, b) => s + mBands[b], 0);
      // joint shares among adults: P(band, sex)
      const joint = {} as Record<Band, { f: number; m: number }>;
      let tot = 0;
      for (const b of BANDS) {
        const jf = fShare * fBands[b];
        const jm = (1 - fShare) * mBands[b];
        joint[b] = { f: jf, m: jm };
        tot += jf + jm;
      }
      for (const b of BANDS) { joint[b] = { f: joint[b].f / tot, m: joint[b].m / tot }; }
      const age_band = Object.fromEntries(BANDS.map((b) => [b, +(joint[b].f + joint[b].m).toFixed(4)]));
      const gender = {
        f: +BANDS.reduce((s, b) => s + joint[b].f, 0).toFixed(4),
        m: +BANDS.reduce((s, b) => s + joint[b].m, 0).toFixed(4),
      };
      for (const b of BANDS) { joint[b] = { f: +joint[b].f.toFixed(4), m: +joint[b].m.toFixed(4) }; }
      demographics = { age_band, gender, joint, source: "WB" as const };
      void fAdult; void mAdult;
      for (const b of BANDS) { sumsF[b] += joint[b].f * population; sumsM[b] += joint[b].m * population; }
      weightSum += population;
    }

    const names: Record<string, string> = { en: c.name.common };
    for (const [loc, key] of Object.entries(LOCALE_KEYS)) {
      const t = (c.translations as Record<string, { common: string } | undefined>)[key];
      if (t?.common) names[loc] = t.common;
    }
    list.push({
      code: c.cca2,
      iso3,
      numeric: c.ccn3 || null,
      flag: c.flag,
      region: c.region,
      subregion: c.subregion,
      un_member: c.unMember,
      independent: c.independent ?? false,
      latlng: c.latlng,
      names,
      population,
      population_year: p?.date ?? "2024",
      demographics,
    });
  }

  for (const b of BANDS) { worldFallback.f[b] = sumsF[b] / weightSum; worldFallback.m[b] = sumsM[b] / weightSum; }
  const fallbackJoint = Object.fromEntries(BANDS.map((b) => [b, { f: +worldFallback.f[b].toFixed(4), m: +worldFallback.m[b].toFixed(4) }]));
  const fallbackAge = Object.fromEntries(BANDS.map((b) => [b, +(worldFallback.f[b] + worldFallback.m[b]).toFixed(4)]));
  const fallbackGender = {
    f: +BANDS.reduce((s, b) => s + worldFallback.f[b], 0).toFixed(4),
    m: +BANDS.reduce((s, b) => s + worldFallback.m[b], 0).toFixed(4),
  };
  let filled = 0;
  for (const c of list) {
    if (!c.demographics) {
      c.demographics = { age_band: fallbackAge, gender: fallbackGender, joint: fallbackJoint, source: "world-average" as const };
      filled++;
    }
  }
  list.sort((a, b) => a.code.localeCompare(b.code));
  const world_population = list.reduce((s, c) => s + c.population, 0);
  const out = {
    generated_at: new Date().toISOString(),
    sources: {
      codes_names: "world-countries (mledoze/countries), ODbL",
      population: "World Bank SP.POP.TOTL (most recent non-empty value)",
      demographics: "World Bank SP.POP.*.FE/MA.5Y (5-year age × sex shares), aggregated to adult bands",
    },
    world_population,
    countries: list,
  };
  writeFileSync(OUT, JSON.stringify(out));
  console.log(`Wrote ${list.length} countries (${filled} with world-average demographics) → ${OUT}`);
  console.log(`World population: ${world_population.toLocaleString("en")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
