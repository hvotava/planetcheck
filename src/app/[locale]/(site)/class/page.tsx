import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ClassCreator } from "@/components/class/ClassCreator";
import { env } from "@/lib/env";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "classroom" });
  return { title: t("title"), description: t("subtitle") };
}

/** /class — the teacher's page. No account, no personal data: a code is all it takes. */
export default async function ClassPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("classroom");
  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-16 pt-6">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-muted">{t("subtitle")}</p>
      <ol className="mt-6 space-y-2 text-sm text-muted">
        <li>1. {t("step1")}</li>
        <li>2. {t("step2")}</li>
        <li>3. {t("step3")}</li>
      </ol>
      <div className="mt-6">
        <ClassCreator locale={locale} siteUrl={env().NEXT_PUBLIC_SITE_URL} />
      </div>
      <p className="mt-6 text-xs text-faint">{t("privacy")}</p>
    </div>
  );
}
