import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("common");
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center">
      <p className="text-6xl">🛰️</p>
      <h1 className="text-2xl font-bold">{t("notFound")}</h1>
      <Link href="/" className="rounded-full bg-accent px-6 py-3 font-semibold text-bg hover:bg-accent-deep">
        {t("notFoundCta")}
      </Link>
    </div>
  );
}
