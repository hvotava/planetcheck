import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ProphecyList, type ProphecyCardData } from "@/components/prophecy/ProphecyList";
import { memo } from "@/lib/api/cache";
import { pickLocalized } from "@/lib/content/i18n";
import { loadWeighting } from "@/lib/content/loader";
import { env } from "@/lib/env";
import { getRepo } from "@/lib/db/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "prophecy" });
  return { title: t("title"), description: t("subtitle") };
}

/** /prophecies — forecasting. Fetches and localises; ProphecyList owns the interaction. */
export default async function PropheciesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("prophecy");
  const [lo, hi] = loadWeighting().country_clamp;
  const repo = await getRepo();
  const rows = await memo("prophecies:page", 30_000, () => repo.listProphecies({ clamp_lo: lo, clamp_hi: hi }));

  const prophecies: ProphecyCardData[] = rows.map((p) => {
    // review_required is true for every prophecy: an unreviewed machine translation of a
    // precise claim falls back to English rather than risk changing what was claimed (§11).
    const l = pickLocalized(p.i18n, locale, p.review_required);
    return { ...p, title: l?.value.title ?? p.key, blurb: l?.value.blurb, fallbackLocale: l?.fallback ? l.locale : null };
  });

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-6">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-muted">{t("subtitle")}</p>
      <p className="mt-2 text-sm text-faint">{t("howItWorks")}</p>
      <div className="mt-8">
        {prophecies.length ? (
          <ProphecyList prophecies={prophecies} turnstileSiteKey={env().NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null} />
        ) : (
          <p className="card p-6 text-center text-muted">{t("empty")}</p>
        )}
      </div>
    </div>
  );
}
