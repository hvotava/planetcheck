import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SignupForm } from "@/components/newsletter/SignupForm";
import { env } from "@/lib/env";
import { newsletterEnabled } from "@/lib/newsletter/sender";
import { Link } from "@/lib/i18n/navigation";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "newsletter" });
  return { title: t("title"), description: t("subtitle"), robots: { index: false } };
}

/** /newsletter — signup, and where the confirmation link lands. */
export default async function NewsletterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ state?: string }>;
}) {
  const { locale } = await params;
  const { state } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("newsletter");
  const tr = await getTranslations("result");
  const enabled = newsletterEnabled();

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-16 pt-6">
      {state === "confirmed" ? (
        <div className="card p-6" data-testid="newsletter-confirmed">
          <p className="text-4xl">✅</p>
          <h1 className="mt-2 text-2xl font-bold">{t("state.confirmedTitle")}</h1>
          <p className="mt-1 text-muted">{t("state.confirmedText")}</p>
        </div>
      ) : state === "invalid" ? (
        <div className="card p-6" data-testid="newsletter-invalid">
          <p className="text-4xl">⏳</p>
          <h1 className="mt-2 text-2xl font-bold">{t("state.invalidTitle")}</h1>
          <p className="mt-1 text-muted">{t("state.invalidText")}</p>
        </div>
      ) : null}

      <h1 className={state ? "mt-10 text-2xl font-bold" : "text-3xl font-bold"}>{t("title")}</h1>
      <p className="mt-1 text-muted">{t("subtitle")}</p>

      <div className="card mt-6 p-5">
        {enabled ? (
          <SignupForm locale={locale} turnstileSiteKey={env().NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null} />
        ) : (
          <p className="text-sm text-muted">{t("disabled")}</p>
        )}
      </div>

      <div className="card mt-4 p-5">
        <h2 className="text-lg font-bold">{tr("nextRoundTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{tr("calendarHint")}</p>
        <a href={`/api/calendar/rounds.ics?locale=${locale}`} className="mt-4 inline-flex rounded-full border border-accent px-5 py-3 font-semibold text-accent">
          {tr("calendarCta")}
        </a>
      </div>

      <p className="mt-6 text-xs text-faint">
        <Link className="underline" href="/methodology#privacy">
          {t("consent")}
        </Link>
      </p>
    </div>
  );
}
