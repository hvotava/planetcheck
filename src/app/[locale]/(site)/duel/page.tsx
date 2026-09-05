import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Flag } from "@/components/ui/Flag";
import { duelMeta } from "@/lib/content/public";
import { countryName } from "@/lib/countries";
import { Link } from "@/lib/i18n/navigation";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "duel" });
  return { title: t("title"), description: t("subtitle") };
}

/** /duel — the curated duel list. Static from content/duels.yaml; no DB call. */
export default async function DuelIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("duel");
  const duels = duelMeta(locale);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-muted">{t("subtitle")}</p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {duels.map((d) => (
          <li key={d.key}>
            <Link href={`/duel/${d.key}`} className="card flex h-full flex-col gap-2 p-5 transition hover:border-border-strong">
              <span className="text-2xl">
                <Flag code={d.a} /> <span className="text-sm text-faint">vs.</span> <Flag code={d.b} />
              </span>
              <span className="font-semibold">{d.title}</span>
              {d.blurb ? <span className="text-sm text-muted">{d.blurb}</span> : null}
              <span className="mt-auto pt-2 text-xs text-faint">
                {countryName(d.a, locale)} · {countryName(d.b, locale)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
