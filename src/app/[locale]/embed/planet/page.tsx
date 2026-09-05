import { getTranslations, setRequestLocale } from "next-intl/server";
import { LiveEkg } from "@/components/planet/LiveEkg";
import { loadPlanetPage } from "@/lib/api/planet-data";

export const dynamic = "force-dynamic";

/** /embed/planet — iframe-able live EKG + index (phase 5 embed widget). No header/footer. */
export default async function EmbedPlanet({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("embed");
  const data = await loadPlanetPage(locale);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return (
    <div className="p-2">
      <LiveEkg roundSlug={data.round?.slug ?? null} initialStats={data.stats} initialSeries={data.series} compact />
      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span>{t("poweredBy")}</span>
        <a href={`${site}/${locale}/play`} target="_blank" rel="noopener noreferrer" className="rounded-full bg-accent px-3 py-1 font-semibold text-bg">
          {t("play")} →
        </a>
      </div>
    </div>
  );
}
