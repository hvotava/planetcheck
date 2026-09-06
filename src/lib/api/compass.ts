import "server-only";
import { getRepo } from "@/lib/db/server";
import { memo } from "@/lib/api/cache";
import { loadCompass, loadWeighting } from "@/lib/content/loader";
import { pickLocalized } from "@/lib/content/i18n";
import type { CompassPayload, CompassStats } from "@/types/api";
import type { CompassFile } from "@/lib/content/schema";

/**
 * Server-side access to the Kompas deck. The payload returned here carries the correct
 * answers; only `toPlayCompass` may hand anything to a browser.
 */

let contentCache: CompassFile | null = null;
export function compassContent(): CompassFile {
  contentCache ??= loadCompass();
  return contentCache;
}

export function compassVersion(): number {
  return compassContent().compass.version;
}

/** Clamps for the country post-stratification, from content/weighting.yaml (ARCHITECTURE §9). */
export function countryClamp(): { clamp_lo: number; clamp_hi: number } {
  const [lo, hi] = loadWeighting().country_clamp;
  return { clamp_lo: lo, clamp_hi: hi };
}

export async function compassDeck(): Promise<CompassPayload> {
  const file = compassContent();
  const repo = await getRepo();
  return memo(`compass:deck:v${file.compass.version}`, 20_000, () => repo.getCompass({ version: file.compass.version, i18n: file.compass.i18n }));
}

export async function compassPlanet(): Promise<CompassStats> {
  const repo = await getRepo();
  return memo(`compass:stats:v${compassVersion()}`, 15_000, () => repo.compassStats({ version: compassVersion(), ...countryClamp() }));
}

/** The reveal text for one fact, in the reader's language. */
export function answerText(payload: CompassPayload, questionId: string, locale: string): string | null {
  const q = payload.questions.find((x) => x.id === questionId);
  if (!q?.i18n_answer) return null;
  return pickLocalized(q.i18n_answer, locale, q.review_required)?.value.text ?? null;
}
