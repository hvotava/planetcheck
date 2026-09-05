import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { UnsubscribeButton } from "@/components/newsletter/UnsubscribeButton";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "newsletter" });
  return { title: t("unsubscribe.title"), robots: { index: false } };
}

/** /newsletter/unsubscribe?token=… — the human landing page for the link in every email. */
export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  const { token } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("newsletter");
  return (
    <div className="mx-auto w-full max-w-md px-4 pb-16 pt-10">
      <div className="card p-6">
        <h1 className="text-2xl font-bold">{t("unsubscribe.title")}</h1>
        <div className="mt-3">
          {token ? (
            <UnsubscribeButton token={token} />
          ) : (
            <>
              <h2 className="text-xl font-bold">{t("unsubscribe.invalidTitle")}</h2>
              <p className="mt-1 text-sm text-muted">{t("unsubscribe.invalidText")}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
