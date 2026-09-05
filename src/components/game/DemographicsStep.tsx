"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { AGE_BANDS, GENDERS, SETTLEMENTS, type AgeBand, type Demographics, type Gender, type Settlement } from "@/types/domain";

function Chips<T extends string>({ label, values, value, onChange, render }: { label: string; values: readonly T[]; value: T | null; onChange: (v: T | null) => void; render: (v: T) => string }) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs uppercase tracking-wide text-muted">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => {
          const on = value === v;
          return (
            <button
              key={v}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? null : v)}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${on ? "border-accent bg-accent text-bg" : "border-border bg-surface text-text hover:border-border-strong"}`}
            >
              {render(v)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Optional, coarse, privacy-first (ARCHITECTURE §5). Nothing here is required to vote. */
export function DemographicsStep({
  countries,
  geoCountry,
  submitting,
  onSubmit,
}: {
  countries: Array<{ code: string; name: string; flag: string }>;
  geoCountry: string | null;
  submitting: boolean;
  onSubmit: (d: Demographics) => void;
}) {
  const t = useTranslations("play");
  const td = useTranslations("demographics");
  const [age, setAge] = useState<AgeBand | null>(null);
  const [gender, setGender] = useState<Gender | null>(null);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [country, setCountry] = useState<string>(geoCountry ?? "");
  const detected = countries.find((c) => c.code === geoCountry);

  return (
    <form
      className="card mx-auto w-full max-w-sm space-y-6 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ age_band: age, gender, settlement, declared_country: country && country !== geoCountry ? country : null });
      }}
    >
      <div>
        <h2 className="text-2xl font-bold">{t("demoTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{t("demoSubtitle")}</p>
      </div>
      <Chips label={td("age_band.label")} values={AGE_BANDS} value={age} onChange={setAge} render={(v) => td(`age_band.${v}`)} />
      <Chips label={td("gender.label")} values={GENDERS} value={gender} onChange={setGender} render={(v) => td(`gender.${v}`)} />
      <Chips label={td("settlement.label")} values={SETTLEMENTS} value={settlement} onChange={setSettlement} render={(v) => td(`settlement.${v}`)} />
      <label className="block">
        <span className="mb-2 block text-xs uppercase tracking-wide text-muted">{td("country.label")}</span>
        <select value={country} onChange={(e) => setCountry(e.target.value)} className="w-full rounded-2xl border border-border bg-surface px-3 py-2.5 text-sm">
          <option value="">—</option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.name}
            </option>
          ))}
        </select>
        {detected ? (
          <span className="mt-1 block text-xs text-faint">
            {td("country.detected", { country: `${detected.flag} ${detected.name}` })}
          </span>
        ) : null}
      </label>
      <div className="flex flex-col gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? t("submitting") : t("demoSubmit")}
        </Button>
        <Button type="button" variant="ghost" disabled={submitting} onClick={() => onSubmit({ age_band: null, gender: null, settlement: null, declared_country: null })}>
          {t("demoSkip")}
        </Button>
      </div>
    </form>
  );
}
