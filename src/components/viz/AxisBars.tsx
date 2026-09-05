import { useTranslations } from "next-intl";
import { AXES, type AxisKey } from "@/types/domain";

const COLORS: Record<AxisKey, [string, string]> = {
  peace_force: ["var(--color-peace)", "var(--color-force)"],
  trust_paranoia: ["var(--color-trust)", "var(--color-paranoia)"],
  us_them: ["var(--color-us)", "var(--color-them)"],
};

/** Three bipolar axes (−1..+1). `you` is the marker, `compare` (planet/country) a ghost marker. Works on server and client. */
export function AxisBars({ you, compare, compareLabel }: { you: Partial<Record<AxisKey, number | null>>; compare?: Partial<Record<AxisKey, number | null>>; compareLabel?: string }) {
  const t = useTranslations("axes");
  return (
    <ul className="space-y-4">
      {AXES.map((axis) => {
        const v = you[axis] ?? 0;
        const c = compare?.[axis];
        const pos = (x: number) => `${((x + 1) / 2) * 100}%`;
        const [lo, hi] = COLORS[axis];
        return (
          <li key={axis}>
            <div className="mb-1 flex justify-between text-xs text-muted">
              <span style={{ color: lo }}>{t(`${axis}.low`)}</span>
              <span style={{ color: hi }}>{t(`${axis}.high`)}</span>
            </div>
            <div className="relative h-3 rounded-full" style={{ background: `linear-gradient(90deg, ${lo}33, var(--color-surface-2) 50%, ${hi}33)` }}>
              <span className="absolute inset-y-0 left-1/2 w-px bg-border-strong" aria-hidden="true" />
              {c != null ? <span className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded bg-muted/60" style={{ left: pos(c) }} title={compareLabel} /> : null}
              <span className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg shadow" style={{ left: pos(v), background: v < 0 ? lo : hi }} aria-label={`${t(`${axis}.name`)}: ${v.toFixed(2)}`} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
