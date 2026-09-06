import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CompassDeck } from "@/components/compass/CompassDeck";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "compass" });
  return { title: t("title"), description: t("lead") };
}

export default async function CompassPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <CompassDeck />;
}
