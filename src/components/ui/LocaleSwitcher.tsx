"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { LOCALES, LOCALE_META, type Locale } from "@/lib/i18n/locales";
import { usePathname, useRouter } from "@/lib/i18n/navigation";

export function LocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{t("language")}</span>
      <select
        aria-label={t("language")}
        className="appearance-none rounded-full border border-border bg-surface px-3 py-1.5 pr-7 text-sm text-muted hover:text-text focus:outline-none"
        value={locale}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as Locale;
          startTransition(() => {
            router.replace(pathname, { locale: next });
          });
        }}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_META[l].flag} {LOCALE_META[l].name}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2 text-xs text-faint">▾</span>
    </label>
  );
}
