import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PlanetDashboard } from "@/components/planet/PlanetDashboard";
import { loadPlanetPage } from "@/lib/api/planet-data";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "planet" });
  return { title: t("title"), description: t("subtitle") };
}

export default async function PlanetPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const data = await loadPlanetPage(locale);
  return <PlanetDashboard data={data} />;
}
