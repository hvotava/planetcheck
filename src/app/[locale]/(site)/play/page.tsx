import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PlayClient } from "@/components/game/PlayClient";

// PlayClient reads ?round= and ?class= with useSearchParams, so this page is never static.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common" });
  return { title: t("nav.play"), robots: { index: false } };
}

export default async function PlayPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PlayClient />;
}
