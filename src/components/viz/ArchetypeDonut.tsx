"use client";

import { useTranslations } from "next-intl";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { ArchetypeMeta } from "@/components/ui/ArchetypeBadge";
import type { ArchetypeShares } from "@/types/api";

/** Z čeho je planeta — archetype shares (weighted donut, raw in the legend). */
export function ArchetypeDonut({ shares, meta }: { shares: ArchetypeShares; meta: Record<string, ArchetypeMeta> }) {
  const t = useTranslations("common");
  const data = Object.entries(shares)
    .map(([key, s]) => ({ key, name: meta[key]?.title ?? key, value: s.share_weighted ?? 0, raw: s.share_raw ?? 0, color: meta[key]?.color ?? "var(--color-muted)", emoji: meta[key]?.emoji }))
    .sort((a, b) => b.value - a.value);
  return (
    <div className="card flex flex-col items-center gap-3 p-4 md:flex-row">
      <div className="h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={2} stroke="none" isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.key} fill={d.color} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => `${Number(v).toFixed(0)} %`} contentStyle={{ background: "var(--color-bg-elev)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full space-y-1.5 text-sm">
        {data.map((d) => (
          <li key={d.key} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm" style={{ background: d.color }} />
              <span aria-hidden="true">{d.emoji}</span> {d.name}
            </span>
            <span className="font-mono text-xs tabular">
              {d.value.toFixed(0)} % <span className="text-faint">· {t("raw")} {d.raw.toFixed(0)} %</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
