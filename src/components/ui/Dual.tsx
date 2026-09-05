import { useTranslations } from "next-intl";

/**
 * CLAUDE.md rule 5: every number has a raw and a weighted variant and we never show only one.
 * Weighted is primary, raw is the small companion.
 */
export function Dual({
  weighted,
  raw,
  unit = "%",
  digits = 0,
  size = "md",
  className = "",
}: {
  weighted: number | null | undefined;
  raw: number | null | undefined;
  unit?: string;
  digits?: number;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const t = useTranslations("common");
  const fmt = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? "–" : `${v.toFixed(digits)}${unit}`);
  const sizes = { sm: "text-base", md: "text-2xl", lg: "text-4xl", xl: "text-6xl" }[size];
  return (
    <span className={`inline-flex flex-col leading-none ${className}`} title={t("rawWeightedHint")}>
      <span className={`font-display font-bold tabular ${sizes}`}>{fmt(weighted)}</span>
      <span className="mt-1 text-xs text-muted tabular">
        {t("raw")}: {fmt(raw)}
      </span>
    </span>
  );
}
