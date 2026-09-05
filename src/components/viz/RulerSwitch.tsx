"use client";

import { useTranslations } from "next-intl";
import type { ResultsFilterPayload } from "@/types/api";
import { AGE_BANDS, GENDERS, SETTLEMENTS } from "@/types/domain";

/** "Kdyby vládli jen…" — demographic / trust filter for all planet numbers. Pure: value in, onChange out. */
export function RulerSwitch({ value, onChange }: { value: ResultsFilterPayload; onChange: (v: ResultsFilterPayload) => void }) {
  const t = useTranslations("planet");
  const td = useTranslations("demographics");
  const none = Object.keys(value).length === 0;
  const chip = (on: boolean, label: string, onClick: () => void, key: string) => (
    <button key={key} type="button" aria-pressed={on} onClick={onClick} className={`rounded-full border px-3 py-1.5 text-xs transition ${on ? "border-accent bg-accent text-bg" : "border-border bg-surface text-muted hover:text-text"}`}>
      {label}
    </button>
  );
  const toggle = <K extends keyof ResultsFilterPayload>(k: K, v: ResultsFilterPayload[K]) => {
    const next = { ...value };
    if (next[k] === v) delete next[k];
    else next[k] = v;
    onChange(next);
  };
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-semibold">{t("filterTitle")}</p>
        {!none ? (
          <button type="button" className="text-xs text-muted hover:text-text" onClick={() => onChange({})}>
            {t("filterReset")}
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chip(none, t("filterAll"), () => onChange({}), "all")}
        {chip(value.trust === "verified", t("filterVerified"), () => toggle("trust", "verified"), "verified")}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">{AGE_BANDS.map((a) => chip(value.age_band === a, td(`age_band.${a}`), () => toggle("age_band", a), a))}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">{GENDERS.map((g) => chip(value.gender === g, td(`gender.${g}`), () => toggle("gender", g), g))}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">{SETTLEMENTS.map((s) => chip(value.settlement === s, td(`settlement.${s}`), () => toggle("settlement", s), s))}</div>
    </div>
  );
}

export function filterLabel(value: ResultsFilterPayload, td: (k: string) => string, tp: (k: string) => string): string {
  const parts: string[] = [];
  if (value.trust === "verified") parts.push(tp("filterVerified"));
  if (value.age_band) parts.push(td(`age_band.${value.age_band}`));
  if (value.gender) parts.push(td(`gender.${value.gender}`));
  if (value.settlement) parts.push(td(`settlement.${value.settlement}`));
  if (value.country) parts.push(value.country);
  return parts.join(" · ");
}
