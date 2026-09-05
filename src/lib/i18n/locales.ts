/**
 * Supported UI locales. Adding a locale = add messages/<code>.json (pnpm translate -- --to xx)
 * and list it here. Content (questions) is localised separately in content/*.yaml.
 */
export const LOCALES = ["cs", "sk", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_META: Record<Locale, { name: string; flag: string; dir: "ltr" | "rtl" }> = {
  cs: { name: "Čeština", flag: "🇨🇿", dir: "ltr" },
  sk: { name: "Slovenčina", flag: "🇸🇰", dir: "ltr" },
  en: { name: "English", flag: "🌍", dir: "ltr" },
};

export function isLocale(v: string | undefined | null): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}
