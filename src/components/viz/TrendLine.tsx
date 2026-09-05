"use client";

import { useTranslations } from "next-intl";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type TrendPoint = { at: string; survival_weighted: number | null; survival_raw: number | null; votes_total: number };

/** Survival index over time (planet snapshots every recompute). Weighted solid, raw dashed. */
export function TrendLine({ points }: { points: TrendPoint[] }) {
  const t = useTranslations("common");
  const data = points.map((p) => ({ ...p, label: new Date(p.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) }));
  return (
    <div className="card h-56 p-3">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 6" />
          <XAxis dataKey="label" tick={{ fill: "var(--color-faint)", fontSize: 10 }} minTickGap={32} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fill: "var(--color-faint)", fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ background: "var(--color-bg-elev)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }} labelStyle={{ color: "var(--color-muted)" }} />
          <Line type="monotone" dataKey="survival_weighted" name={t("weighted")} stroke="var(--color-accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="survival_raw" name={t("raw")} stroke="var(--color-muted)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
