import type { I18nMap } from "@/types/domain";

export const FALLBACK_LOCALE = "en";

/**
 * Picks the text for a locale with a gate for review_required content:
 * a machine translation of a sensitive question is only shown once a human set `reviewed: true`.
 * Otherwise falls back to English (marked so the UI can show a small badge). Pure.
 */
export function pickLocalized<T extends object>(
  i18n: I18nMap<T> | undefined,
  locale: string,
  reviewRequired = false,
): { value: T; locale: string; fallback: boolean } | null {
  if (!i18n) return null;
  const candidates = [locale, locale.split("-")[0] ?? locale, FALLBACK_LOCALE, "cs"];
  for (const loc of candidates) {
    const v = i18n[loc];
    if (!v) continue;
    const flags = v as { machine?: boolean; reviewed?: boolean };
    if (reviewRequired && flags.machine && !flags.reviewed) continue;
    return { value: v, locale: loc, fallback: loc !== locale };
  }
  const first = Object.entries(i18n)[0];
  return first ? { value: first[1], locale: first[0], fallback: true } : null;
}
