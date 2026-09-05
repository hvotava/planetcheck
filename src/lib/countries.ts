import raw from "@data/countries.json";

/** data/countries.json — the single source for codes, names, population and demographic targets. */
export type CountryRecord = {
  code: string;
  iso3: string;
  numeric: string | null;
  flag: string;
  region: string;
  subregion: string;
  un_member: boolean;
  independent: boolean;
  latlng: number[];
  names: Record<string, string>;
  population: number;
  population_year: string;
  demographics: {
    age_band: Record<string, number>;
    gender: Record<string, number>;
    joint: Record<string, { f: number; m: number }>;
    source: string;
  };
};

type CountriesFile = { generated_at: string; world_population: number; countries: CountryRecord[] };

const data = raw as unknown as CountriesFile;
const byCode = new Map(data.countries.map((c) => [c.code, c] as const));
const byNumeric = new Map(data.countries.filter((c) => c.numeric).map((c) => [c.numeric as string, c] as const));

export const WORLD_POPULATION = data.world_population;
export const COUNTRIES: readonly CountryRecord[] = data.countries;

export function countryByCode(code: string | null | undefined): CountryRecord | undefined {
  return code ? byCode.get(code.toUpperCase()) : undefined;
}

export function countryByNumeric(numeric: string): CountryRecord | undefined {
  return byNumeric.get(numeric);
}

export function countryName(code: string | null | undefined, locale: string): string {
  const c = countryByCode(code);
  if (!c) return code ?? "";
  return c.names[locale] ?? c.names[locale.split("-")[0] ?? locale] ?? c.names.en ?? c.code;
}

export function isKnownCountry(code: string | null | undefined): code is string {
  return !!countryByCode(code);
}

/** Slim list for pickers/maps in the browser. */
export function countryList(locale: string): Array<{ code: string; name: string; flag: string }> {
  return data.countries
    .map((c) => ({ code: c.code, name: countryName(c.code, locale), flag: c.flag }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}
