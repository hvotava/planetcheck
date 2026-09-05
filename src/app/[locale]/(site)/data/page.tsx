import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getRepo } from "@/lib/db/server";
import { loadWeighting } from "@/lib/content/loader";
import { pickLocalized } from "@/lib/content/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "data" });
  return { title: t("title"), description: t("subtitle") };
}

export default async function DataPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("data");
  const repo = await getRepo();
  const rounds = await repo.listRounds(false);
  const w = loadWeighting();
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8">
      <h1 className="text-4xl font-bold">{t("title")}</h1>
      <p className="mt-3 text-lg text-muted">{t("subtitle")}</p>
      <p className="mt-2 text-sm text-faint">{t("note", { min: w.min_country_submissions })}</p>
      <h2 className="mt-8 text-2xl font-bold">{t("roundsTitle")}</h2>
      <ul className="mt-3 divide-y divide-border rounded-2xl border border-border">
        {rounds.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="font-semibold">
                {pickLocalized(r.i18n as Record<string, { title: string }>, locale)?.value.title ?? r.slug} <span className="font-mono text-xs text-muted">{r.slug}</span>
              </p>
              <p className="text-xs text-muted">
                {r.kind} · {r.status} · {t("votes", { count: r.votes_total })}
              </p>
            </div>
            <div className="flex gap-2 text-sm">
              <a className="rounded-full border border-border px-3 py-1.5 hover:border-border-strong" href={`/api/export/${r.slug}`}>
                {t("json")}
              </a>
              <a className="rounded-full border border-border px-3 py-1.5 hover:border-border-strong" href={`/api/export/${r.slug}.csv`}>
                {t("csv")}
              </a>
            </div>
          </li>
        ))}
      </ul>
      <h2 className="mt-8 text-2xl font-bold">{t("apiTitle")}</h2>
      <p className="mt-2 text-sm text-muted">{t("apiText", { endpoint: "" })}</p>
      <pre className="mt-2 overflow-x-auto rounded-2xl border border-border bg-bg-elev p-4 font-mono text-xs text-muted">
        {["GET /api/results/planet?round=<slug>&trust=verified&age_band=25-34", "GET /api/results/question/<id>?country=CZ", "GET /api/results/country/<code>", "GET /api/results/board", "GET /api/results/pulse", "GET /api/live/planet (SSE)", "GET /api/export/<slug>[.csv]"].join("\n")}
      </pre>
      <p className="mt-6 text-sm text-muted">{t("license")}</p>
    </div>
  );
}
