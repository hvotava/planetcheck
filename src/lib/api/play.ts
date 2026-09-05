import "server-only";
import { pickLocalized } from "@/lib/content/i18n";
import { countryList } from "@/lib/countries";
import type { PlayQuestion, PlayRound, RoundPayload } from "@/types/api";

/**
 * Round payload → what the browser gets for /play. Localised (with review gating),
 * stripped of scoring internals (axis weights, compromise, honeypot flags).
 */
export function toPlayRound(
  round: RoundPayload,
  locale: string,
  extra: { turnstileSiteKey: string | null; alreadyVoted: { submission_id: string } | null; geoCountry: string | null },
): PlayRound {
  const title = pickLocalized(round.i18n, locale)?.value.title ?? round.slug;
  const blurb = pickLocalized(round.i18n, locale)?.value.blurb ?? null;
  const questions: PlayQuestion[] = round.questions.map((q) => {
    const text = pickLocalized(q.i18n, locale, q.review_required);
    return {
      id: q.id,
      key: q.key,
      type: q.type,
      position: q.position,
      text: text?.value.text ?? q.key,
      scenario: text?.value.scenario ?? null,
      fallback_locale: text?.fallback ? text.locale : null,
      anchor: q.anchor,
      target: q.target ? { question_id: q.target.question_id, option_id: q.target.option_id } : null,
      options: q.options.map((o) => ({
        id: o.id,
        key: o.key,
        text: pickLocalized(o.i18n, locale, q.review_required)?.value.text ?? o.key,
        icon: o.icon ?? null,
      })),
    };
  });
  return {
    id: round.id,
    slug: round.slug,
    kind: round.kind,
    title,
    blurb,
    ends_at: round.ends_at,
    questions,
    loaded_at: new Date().toISOString(),
    turnstile_site_key: extra.turnstileSiteKey,
    already_voted: extra.alreadyVoted,
    countries: countryList(locale),
    geo_country: extra.geoCountry,
  };
}
