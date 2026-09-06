import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getRepo } from "@/lib/db/server";
import { isUuid } from "@/lib/trust/fingerprint";
import { compassDeck, compassPlanet } from "@/lib/api/compass";
import { CompassResult } from "@/components/compass/CompassResult";

export const dynamic = "force-dynamic";

async function load(id: string) {
  if (!isUuid(id)) return null;
  const repo = await getRepo();
  return repo.getCompassSubmission(id);
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; submissionId: string }> }): Promise<Metadata> {
  const { locale, submissionId } = await params;
  const t = await getTranslations({ locale, namespace: "compass" });
  const s = await load(submissionId);
  if (!s) return { title: t("title"), robots: { index: false } };
  return {
    title: t("youKnow", { correct: s.facts_correct, total: s.facts_total }),
    description: t("lead"),
    robots: { index: false, follow: true },
  };
}

export default async function CompassResultPage({ params }: { params: Promise<{ locale: string; submissionId: string }> }) {
  const { locale, submissionId } = await params;
  setRequestLocale(locale);
  const submission = await load(submissionId);
  if (!submission) notFound();
  const [deck, planet] = await Promise.all([compassDeck(), compassPlanet().catch(() => null)]);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return <CompassResult submission={submission} deck={deck} planet={planet} locale={locale} shareUrl={`${site}/${locale}/compass/${submission.id}`} />;
}
