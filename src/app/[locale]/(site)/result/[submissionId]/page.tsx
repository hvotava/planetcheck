import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getRepo } from "@/lib/db/server";
import { isUuid } from "@/lib/trust/fingerprint";
import { archetypeMeta } from "@/lib/content/public";
import { countryName } from "@/lib/countries";
import { roundById } from "@/lib/api/rounds";
import { pickLocalized } from "@/lib/content/i18n";
import { Verdict } from "@/components/game/Verdict";

export const dynamic = "force-dynamic";

async function load(id: string) {
  if (!isUuid(id)) return null;
  const repo = await getRepo();
  return repo.getSubmission(id);
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; submissionId: string }> }): Promise<Metadata> {
  const { locale, submissionId } = await params;
  const s = await load(submissionId);
  const t = await getTranslations({ locale, namespace: "result" });
  if (!s) return { title: t("notFound") };
  const meta = archetypeMeta(locale)[s.archetype];
  const title = `${t("youAre")} ${meta?.title ?? s.archetype}`;
  const description = t("shareText", { share: meta?.share ?? "", planet: Math.round(s.planet?.survival_weighted ?? 0), you: Math.round(s.survival * 100) });
  const og = `/api/og/${s.id}?locale=${locale}`;
  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: og, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [og] },
    robots: { index: false, follow: true },
  };
}

export default async function ResultPage({ params }: { params: Promise<{ locale: string; submissionId: string }> }) {
  const { locale, submissionId } = await params;
  setRequestLocale(locale);
  const s = await load(submissionId);
  if (!s) notFound();
  const round = await roundById(s.round.id);
  const archetypes = archetypeMeta(locale);
  const pairs = Object.fromEntries(
    round.contradictions.map((c) => {
      const l = pickLocalized(c.i18n, locale)?.value;
      return [c.key, { title: l?.title ?? c.key, blurb: l?.blurb }];
    }),
  );
  const questions = Object.fromEntries(round.questions.map((q) => [q.key, pickLocalized(q.i18n, locale)?.value.text ?? q.key]));
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return (
    <Verdict
      submission={s}
      archetypes={archetypes}
      pairs={pairs}
      questionTexts={questions}
      countryLabel={s.country_code ? countryName(s.country_code, locale) : null}
      shareUrl={`${site}/${locale}/result/${s.id}`}
      ogUrl={`/api/og/${s.id}?locale=${locale}`}
      unlockThreshold={round.unlock_threshold}
    />
  );
}
