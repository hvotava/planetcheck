import { useTranslations } from "next-intl";
import { Dual } from "@/components/ui/Dual";
import { Flag } from "@/components/ui/Flag";
import { AXES, type AxisKey } from "@/types/domain";
import type { DuelComparison, DuelQuestionRow } from "@/lib/duel/compare";

const AXIS_COLORS: Record<AxisKey, [string, string]> = {
  peace_force: ["var(--color-peace)", "var(--color-force)"],
  trust_paranoia: ["var(--color-trust)", "var(--color-paranoia)"],
  us_them: ["var(--color-us)", "var(--color-them)"],
};

export type DuelTexts = {
  /** localized country names, keyed by ISO-3166 alpha-2 */
  names: Record<string, string>;
  /** localized question text, keyed by question key */
  questions: Record<string, string>;
  /** localized option text, keyed by `<question>.<option>` */
  options: Record<string, string>;
};

/**
 * Country duel board. Pure: data props in, markup out — no network, no state
 * (CLAUDE.md rule 7). Every number appears weighted with its raw companion (rule 5).
 */
export function DuelBoard({ duel, texts }: { duel: DuelComparison; texts: DuelTexts }) {
  const t = useTranslations("duel");
  const ta = useTranslations("axes");
  const nameA = texts.names[duel.a.code] ?? duel.a.code;
  const nameB = texts.names[duel.b.code] ?? duel.b.code;

  if (!duel.comparable) {
    return (
      <div className="card p-6 text-center" data-testid="duel-not-ready">
        <p className="text-4xl">
          <Flag code={duel.a.code} /> <span className="text-muted">vs.</span> <Flag code={duel.b.code} />
        </p>
        <h2 className="mt-3 text-xl font-bold">{t("notReadyTitle")}</h2>
        <p className="mt-1 text-sm text-muted">
          {t("notReadyText", { a: nameA, an: duel.a.votes, b: nameB, bn: duel.b.votes })}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* headline: how much the two agree */}
      <section className="card p-6 text-center" data-testid="duel-agreement">
        <div className="flex items-center justify-center gap-4 text-lg font-bold">
          <span className="flex items-center gap-2">
            <Flag code={duel.a.code} /> {nameA}
          </span>
          <span className="text-sm font-normal text-faint">vs.</span>
          <span className="flex items-center gap-2">
            <Flag code={duel.b.code} /> {nameB}
          </span>
        </div>
        <p className="mt-4 text-xs uppercase tracking-wide text-muted">{t("agreementLabel")}</p>
        <Dual weighted={duel.agreement.weighted} raw={duel.agreement.raw} size="xl" className="mt-1 items-center" />
        <p className="mt-3 text-sm text-muted">
          {t("sameTop", { count: duel.questions.filter((q) => q.same_top).length, total: duel.questions.length })}
        </p>
      </section>

      {/* the indices side by side */}
      <section className="card p-5">
        <h2 className="mb-4 text-lg font-bold">{t("indicesTitle")}</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-muted">
              <th className="pb-2 text-left font-normal">{t("metric")}</th>
              <th className="pb-2 text-right font-normal">
                <Flag code={duel.a.code} /> {nameA}
              </th>
              <th className="pb-2 text-right font-normal">
                <Flag code={duel.b.code} /> {nameB}
              </th>
            </tr>
          </thead>
          <tbody className="tabular">
            {(
              [
                [t("survival"), duel.a.survival, duel.b.survival, "%"],
                [t("contradiction"), duel.a.contradiction, duel.b.contradiction, "%"],
                [t("realism"), pct(duel.a.realism), pct(duel.b.realism), "%"],
                [t("votes"), duel.a.votes, duel.b.votes, ""],
              ] as Array<[string, number | null, number | null, string]>
            ).map(([label, av, bv, unit]) => (
              <tr key={label} className="border-t border-border">
                <td className="py-2 text-muted">{label}</td>
                <td className={`py-2 text-right font-mono ${lead(av, bv)}`}>{fmt(av, unit)}</td>
                <td className={`py-2 text-right font-mono ${lead(bv, av)}`}>{fmt(bv, unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* three axes, two markers each */}
      <section className="card p-5">
        <h2 className="mb-4 text-lg font-bold">{t("axesTitle")}</h2>
        <ul className="space-y-5">
          {AXES.map((axis) => {
            const row = duel.axes.find((x) => x.axis === axis)!;
            const [lo, hi] = AXIS_COLORS[axis];
            return (
              <li key={axis}>
                <div className="mb-1 flex justify-between text-xs">
                  <span style={{ color: lo }}>{ta(`${axis}.low`)}</span>
                  <span className="text-faint">{row.gap == null ? "" : t("gap", { value: row.gap.toFixed(2) })}</span>
                  <span style={{ color: hi }}>{ta(`${axis}.high`)}</span>
                </div>
                {/* markers sit above and below the track so they never overlap, however close the two countries are */}
                <div className="relative h-14">
                  <div
                    className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full border border-border"
                    style={{ background: `linear-gradient(90deg, ${lo}, var(--color-surface-2) 50%, ${hi})` }}
                  />
                  <span className="absolute inset-y-4 left-1/2 w-px bg-border-strong" aria-hidden="true" />
                  {marker(row.a, duel.a.code, "a")}
                  {marker(row.b, duel.b.code, "b")}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* where they part ways */}
      {duel.biggest ? (
        <section className="card border-warm/40 p-5" data-testid="duel-biggest">
          <p className="text-xs uppercase tracking-wide text-warm">{t("biggestTitle")}</p>
          <h3 className="mt-1 text-lg font-bold">{texts.questions[duel.biggest.key] ?? duel.biggest.key}</h3>
          <QuestionRows q={duel.biggest} duel={duel} texts={texts} />
        </section>
      ) : null}

      {/* every question */}
      <section className="card p-5">
        <h2 className="mb-4 text-lg font-bold">{t("questionsTitle")}</h2>
        <ul className="space-y-6">
          {duel.questions.map((q) => (
            <li key={q.key}>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-semibold">{texts.questions[q.key] ?? q.key}</h3>
                <span className="shrink-0 font-mono text-xs tabular text-muted">
                  {q.agreement.weighted == null ? "–" : `${Math.round(q.agreement.weighted)} %`}
                </span>
              </div>
              <QuestionRows q={q} duel={duel} texts={texts} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function QuestionRows({ q, duel, texts }: { q: DuelQuestionRow; duel: DuelComparison; texts: DuelTexts }) {
  return (
    <ul className="mt-3 space-y-2">
      {q.options.map((o) => (
        <li key={o.key} className="text-sm">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2 text-muted">
              <span aria-hidden="true">{o.icon}</span>
              <span className="truncate">{texts.options[`${q.key}.${o.key}`] ?? o.key}</span>
            </span>
            <span className="shrink-0 font-mono text-xs tabular text-faint">
              {fmt(o.a.weighted, "%")} · {fmt(o.b.weighted, "%")}
            </span>
          </div>
          <div className="space-y-1">
            <Bar value={o.a.weighted} code={duel.a.code} tone="a" />
            <Bar value={o.b.weighted} code={duel.b.code} tone="b" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Bar({ value, code, tone }: { value: number | null; code: string; tone: "a" | "b" }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 shrink-0 text-[11px]" aria-hidden="true">
        <Flag code={code} />
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(1, value ?? 0)}%`, background: tone === "a" ? "var(--color-accent)" : "var(--color-info)" }}
        />
      </div>
    </div>
  );
}

function marker(value: number | null, code: string, tone: "a" | "b") {
  if (value == null) return null;
  const left = ((value + 1) / 2) * 100;
  const color = tone === "a" ? "var(--color-accent)" : "var(--color-info)";
  return (
    <span
      className={`absolute flex -translate-x-1/2 flex-col items-center ${tone === "a" ? "top-0" : "bottom-0 flex-col-reverse"}`}
      style={{ left: `${left}%` }}
      title={code}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 text-[11px]" style={{ background: "var(--color-surface)", borderColor: color }}>
        <Flag code={code} />
      </span>
      <span className="h-2 w-0.5" style={{ background: color }} aria-hidden="true" />
    </span>
  );
}

const pct = (v: number | null) => (v == null ? null : v * 100);
const fmt = (v: number | null, unit: string) => (v == null ? "–" : `${Math.round(v)}${unit}`);
const lead = (mine: number | null, other: number | null) => (mine != null && other != null && mine > other ? "font-bold text-text" : "text-muted");
