import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

type Messages = Record<string, unknown>;

/** Missing keys in a locale fall back to English so a partial translation never crashes a page. */
export function deepMerge(base: Messages, over: Messages): Messages {
  const out: Messages = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    out[k] = v && typeof v === "object" && !Array.isArray(v) && b && typeof b === "object" ? deepMerge(b as Messages, v as Messages) : v;
  }
  return out;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const en = (await import("../../../messages/en.json")).default as Messages;
  const own = locale === "en" ? en : ((await import(`../../../messages/${locale}.json`)).default as Messages);
  return { locale, messages: deepMerge(en, own), timeZone: "UTC" };
});
