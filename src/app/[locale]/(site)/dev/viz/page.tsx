import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { VizGallery } from "@/components/dev/VizGallery";
import { archetypeMeta, titleMeta } from "@/lib/content/public";
import { NUMERIC_TO_CODE } from "@/lib/api/planet-data";

export const dynamic = "force-dynamic";

/** /dev/viz — every viz component with synthetic props, no network (ARCHITECTURE §15 phase 2). */
export default async function DevVizPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (process.env.NODE_ENV === "production" && process.env.PLANETCHECK_DEV_PAGES !== "true") notFound();
  const t = await getTranslations("dev");
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-muted">{t("subtitle")}</p>
      <VizGallery archetypes={archetypeMeta(locale)} titles={titleMeta(locale)} codes={NUMERIC_TO_CODE} />
    </div>
  );
}
