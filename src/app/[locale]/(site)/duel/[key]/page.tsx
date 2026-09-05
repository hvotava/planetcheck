import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DuelBoard, type DuelTexts } from "@/components/viz/DuelBoard";
import { memo } from "@/lib/api/cache";
import { currentRound } from "@/lib/api/rounds";
import { pickLocalized } from "@/lib/content/i18n";
import { duelMeta } from "@/lib/content/public";
import { countryName } from "@/lib/countries";
import { getRepo } from "@/lib/db/server";
import { duelFromResults } from "@/lib/duel";
import { Link } from "@/lib/i18n/navigation";

export const dynamic = "force-dynamic";

async function duelByKey(locale: string, key: string) {
  return duelMeta(locale).find((d) => d.key === key.toLowerCase()) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; key: string }> }): Promise<Metadata> {
  const { locale, key } = await params;
  const d = await duelByKey(locale, key);
  return d ? { title: d.title, description: d.blurb } : {};
}

/** /duel/[key] — one curated duel over the live round. Fetches, localises, and hands pure data to DuelBoard. */
export default async function DuelPage({ params }: { params: Promise<{ locale: string; key: string }> }) {
  const { locale, key } = await params;
  setRequestLocale(locale);
  const duel = await duelByKey(locale, key);
  if (!duel) notFound();
  const round = await currentRound();
  if (!round) notFound();

  const t = await getTranslations("duel");
  const repo = await getRepo();
  const [a, b] = await memo(`duel:${round.id}:${duel.key}`, 30_000, () =>
    Promise.all([repo.countryResults(round.id, duel.a), repo.countryResults(round.id, duel.b)]),
  );
  const comparison = duelFromResults(a, b);

  // Texts come from the round payload so the board itself stays locale-free.
  const texts: DuelTexts = {
    names: { [duel.a]: countryName(duel.a, locale), [duel.b]: countryName(duel.b, locale) },
    questions: {},
    options: {},
  };
  for (const q of round.questions) {
    texts.questions[q.key] = pickLocalized(q.i18n, locale, q.review_required)?.value.text ?? q.key;
    for (const o of q.options) texts.options[`${q.key}.${o.key}`] = pickLocalized(o.i18n, locale)?.value.text ?? o.key;
  }

  const roundTitle = pickLocalized(round.i18n, locale)?.value.title ?? round.slug;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      <Link href="/duel" className="-my-1.5 inline-block py-1.5 text-sm text-muted hover:text-text">
        ← {t("backToList")}
      </Link>
      <h1 className="mt-2 text-3xl font-bold">{duel.title}</h1>
      {duel.blurb ? <p className="mt-1 text-muted">{duel.blurb}</p> : null}
      <p className="mt-1 text-xs text-faint">{t("roundNote", { round: roundTitle })}</p>

      <div className="mt-6">
        <DuelBoard duel={comparison} texts={texts} />
      </div>

      <div className="mt-6">
        <Link href="/play" className="inline-flex rounded-full bg-accent px-5 py-3 font-semibold text-bg">
          {t("playCta")} →
        </Link>
      </div>
    </div>
  );
}
