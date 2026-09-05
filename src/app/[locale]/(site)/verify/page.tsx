import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { env } from "@/lib/env";
import { Link } from "@/lib/i18n/navigation";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "verify" });
  return { title: t("title"), robots: { index: false } };
}

export default async function VerifyPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("verify");
  const e = env();
  const google = !!(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET);
  const apple = !!(e.APPLE_CLIENT_ID && e.APPLE_TEAM_ID && e.APPLE_KEY_ID && e.APPLE_PRIVATE_KEY);
  return (
    <div className="mx-auto w-full max-w-md px-4 pb-16 pt-10">
      <div className="card p-6 text-center">
        <p className="text-4xl">🪪</p>
        <h1 className="mt-2 text-2xl font-bold">{t("title")}</h1>
        {sp.done ? (
          <p className="mt-3 rounded-2xl border border-accent/40 bg-accent/10 p-3 text-accent">{t("done")}</p>
        ) : (
          <p className="mt-2 text-sm text-muted">{t("text")}</p>
        )}
        {sp.error ? <p className="mt-3 rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{t("error")}</p> : null}
        {!sp.done ? (
          <div className="mt-6 flex flex-col gap-2">
            {google ? (
              <a href={`/api/auth/google/start?locale=${locale}`} className="rounded-full bg-text px-5 py-3 font-semibold text-bg">
                {t("google")}
              </a>
            ) : null}
            {apple ? (
              <a href={`/api/auth/apple/start?locale=${locale}`} className="rounded-full border border-border px-5 py-3 font-semibold">
                {t("apple")}
              </a>
            ) : null}
            {!google && !apple ? <p className="text-sm text-faint">{t("unavailable")}</p> : null}
          </div>
        ) : null}
        <Link href="/planet" className="mt-6 inline-block py-1.5 text-sm text-muted hover:text-text">
          {t("back")}
        </Link>
      </div>
    </div>
  );
}
