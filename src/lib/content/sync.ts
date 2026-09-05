import type { Repo } from "@/lib/db/repo";
import { COUNTRIES } from "@/lib/countries";
import { loadContent } from "./loader";

export type SyncResult = {
  countries: number;
  rounds: Array<{ slug: string; questions: number; options: number; contradictions: number }>;
};

/** content/*.yaml + data/countries.json → DB. Idempotent upsert, never deletes (deactivates). */
export async function syncContent(repo: Repo, opts: { log?: (m: string) => void; dir?: string } = {}): Promise<SyncResult> {
  const log = opts.log ?? console.log;
  const bundle = loadContent(opts.dir);
  const countries = await repo.syncCountries(
    COUNTRIES.map((c) => ({
      code: c.code,
      name_en: c.names.en ?? c.code,
      region: c.region ?? null,
      population: c.population,
      demographics: { age_band: c.demographics.age_band, gender: c.demographics.gender, source: c.demographics.source },
      source: "World Bank / world-countries",
    })),
  );
  log(`countries: ${countries.count}`);
  const rounds: SyncResult["rounds"] = [];
  for (const r of bundle.rounds) {
    const res = await repo.syncRound(r);
    rounds.push({ slug: r.slug, questions: res.questions, options: res.options, contradictions: res.contradictions });
    log(`round ${r.slug}: ${res.questions} questions, ${res.options} options, ${res.contradictions} contradictions`);
  }
  return { countries: countries.count, rounds };
}
