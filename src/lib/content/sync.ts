import type { Repo } from "@/lib/db/repo";
import { COUNTRIES } from "@/lib/countries";
import { compassSyncPayload } from "@/lib/compass/deck";
import { loadContent } from "./loader";

export type SyncResult = {
  countries: number;
  rounds: Array<{ slug: string; questions: number; options: number; contradictions: number }>;
  prophecies: number;
  compass: { questions: number; options: number };
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
  // Prophecies are content too, but their outcome never is — resolve_prophecy is the only
  // thing that sets one, and only an operator may call it.
  const prophecies = await repo.syncProphecies(
    bundle.prophecies.map((p) => ({
      key: p.key,
      category: p.category ?? null,
      opens_at: p.opens_at.toISOString(),
      closes_at: p.closes_at.toISOString(),
      resolves_at: p.resolves_at.toISOString(),
      review_required: p.review_required,
      i18n: p.i18n,
    })) as unknown as Parameters<typeof repo.syncProphecies>[0],
  );
  log(`prophecies: ${prophecies.count}`);

  const compass = await repo.syncCompass(compassSyncPayload(bundle.compass) as unknown as Parameters<typeof repo.syncCompass>[0]);
  log(`compass v${bundle.compass.compass.version}: ${compass.questions} questions, ${compass.options} options`);

  return { countries: countries.count, rounds, prophecies: prophecies.count, compass };
}
