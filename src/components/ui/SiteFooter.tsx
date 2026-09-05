import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";

export async function SiteFooter() {
  const t = await getTranslations("common");
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted md:flex-row md:items-center md:justify-between">
        <p>{t("footer.madeBy")}</p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="secondary">
          <Link className="hover:text-text" href="/methodology">
            {t("nav.methodology")}
          </Link>
          <Link className="hover:text-text" href="/data">
            {t("nav.data")}
          </Link>
          <Link className="hover:text-text" href="/verify">
            {t("nav.verify")}
          </Link>
          <Link className="hover:text-text" href="/methodology#privacy">
            {t("footer.privacy")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
