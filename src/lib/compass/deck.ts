import { pickLocalized } from "@/lib/content/i18n";
import type { CompassFile } from "@/lib/content/schema";
import type { CompassPayload, PlayCompass, PlayCompassQuestion } from "@/types/api";
import type { ScoringCompassDeck } from "@/types/domain";

/**
 * Conversions between the three shapes a Kompas deck takes:
 * content YAML, the server payload, and what the browser is allowed to see.
 *
 * The client shape exists for one reason: `correct` must never leave the server before a
 * submission exists. Same principle as the honeypot flag in `toPlayRound`.
 */

/** Content file → the shape the pure scorer wants. Used by scripts and tests. */
export function toScoringCompass(file: CompassFile): ScoringCompassDeck {
  return {
    version: file.compass.version,
    questions: file.questions.map((q) => ({
      key: q.key,
      section: q.section,
      options: q.options.map((o) => ({ key: o.key, correct: o.correct, bias: o.bias ?? null, axis_weights: o.axis_weights })),
    })),
  };
}

/** DB payload → the shape the pure scorer wants. Used by the submit route. */
export function scoringCompassFromPayload(payload: CompassPayload): ScoringCompassDeck {
  return {
    version: payload.version,
    questions: payload.questions.map((q) => ({
      key: q.key,
      section: q.section,
      options: q.options.map((o) => ({ key: o.key, correct: o.correct, bias: o.bias, axis_weights: o.axis_weights })),
    })),
  };
}

/** DB payload → what the browser gets. Strips `correct`, `bias`, `axis_weights` and the answer text. */
export function toPlayCompass(
  payload: CompassPayload,
  locale: string,
  extra: { turnstileSiteKey: string | null; alreadyDone: { submission_id: string } | null; geoCountry: string | null },
): PlayCompass {
  const label = pickLocalized(payload.i18n, locale)?.value;
  const questions: PlayCompassQuestion[] = payload.questions.map((q) => {
    const text = pickLocalized(q.i18n, locale, q.review_required);
    return {
      id: q.id,
      key: q.key,
      section: q.section,
      position: q.position,
      text: text?.value.text ?? q.key,
      scenario: text?.value.scenario ?? null,
      fallback_locale: text?.fallback ? text.locale : null,
      options: q.options.map((o) => ({
        id: o.id,
        key: o.key,
        text: pickLocalized(o.i18n, locale, q.review_required)?.value.text ?? o.key,
        icon: o.icon ?? null,
      })),
    };
  });
  return {
    version: payload.version,
    title: label?.title ?? "Kompas",
    blurb: label?.blurb ?? null,
    facts_total: payload.questions.filter((q) => q.section === "fact").length,
    questions,
    loaded_at: new Date().toISOString(),
    turnstile_site_key: extra.turnstileSiteKey,
    already_done: extra.alreadyDone,
    geo_country: extra.geoCountry,
  };
}

/** Content file → the jsonb `sync_compass` expects. Option order in the file becomes `position`. */
export function compassSyncPayload(file: CompassFile) {
  return file.questions.map((q) => ({
    key: q.key,
    section: q.section,
    position: q.position,
    i18n: q.i18n,
    i18n_answer: q.i18n_answer ?? null,
    source: q.source
      ? { name: q.source.name, url: q.source.url, as_of: q.source.as_of.toISOString(), review_by: q.source.review_by.toISOString() }
      : null,
    review_required: q.review_required,
    options: q.options.map((o, i) => ({
      key: o.key,
      position: i + 1,
      i18n: o.i18n,
      icon: o.icon ?? null,
      correct: o.correct,
      bias: o.bias ?? null,
      axis_weights: o.axis_weights,
    })),
  }));
}
