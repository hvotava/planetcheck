import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { Logo } from "./Logo";

export async function SiteHeader() {
  const t = await getTranslations("common");
  return (
    <header className="sticky top-0 z-40 glass">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight" aria-label={t("appName")}>
          <Logo className="h-7 w-7" />
          <span>{t("appName")}</span>
        </Link>
        <nav className="hidden items-center gap-1 text-sm text-muted md:flex" aria-label="primary">
          <Link className="rounded-full px-3 py-1.5 hover:bg-surface-2 hover:text-text" href="/planet">
            {t("nav.planet")}
          </Link>
          <Link className="rounded-full px-3 py-1.5 hover:bg-surface-2 hover:text-text" href="/planet#countries">
            {t("nav.countries")}
          </Link>
          <Link className="rounded-full px-3 py-1.5 hover:bg-surface-2 hover:text-text" href="/duel">
            {t("nav.duel")}
          </Link>
          <Link className="rounded-full px-3 py-1.5 hover:bg-surface-2 hover:text-text" href="/prophecies">
            {t("nav.prophecies")}
          </Link>
          <Link className="rounded-full px-3 py-1.5 hover:bg-surface-2 hover:text-text" href="/compass">
            {t("nav.compass")}
          </Link>
          <Link className="rounded-full px-3 py-1.5 hover:bg-surface-2 hover:text-text" href="/methodology">
            {t("nav.methodology")}
          </Link>
          <Link className="rounded-full px-3 py-1.5 hover:bg-surface-2 hover:text-text" href="/data">
            {t("nav.data")}
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <Link href="/play" className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-bg transition hover:bg-accent-deep">
            {t("nav.play")}
          </Link>
        </div>
      </div>
    </header>
  );
}
