"use client";

import { geoNaturalEarth1, geoPath } from "d3-geo";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { Feature, Geometry } from "geojson";
import topoRaw from "@data/world-110m.json";

export type MapCountry = {
  code: string;
  name: string;
  survival_index: number | null;
  unlocked: boolean;
  submissions_count: number;
};

/** Survival index 0–100 → colour (danger → warm → accent). */
export function survivalColor(v: number): string {
  const clamp = Math.max(0, Math.min(100, v));
  const stops: Array<[number, [number, number, number]]> = [
    [0, [255, 92, 108]],
    [50, [255, 180, 84]],
    [100, [61, 255, 160]],
  ];
  let i = 0;
  while (i < stops.length - 2 && clamp > stops[i + 1]![0]) i++;
  const [a, ca] = stops[i]!;
  const [b, cb] = stops[i + 1]!;
  const f = (clamp - a) / (b - a);
  const mix = ca.map((x, k) => Math.round(x + (cb[k]! - x) * f));
  return `rgb(${mix.join(",")})`;
}

/**
 * Mapa přežití — choropleth by weighted survival index; locked countries greyed with a progress hint.
 * Pure: countries in (by alpha-2), SVG out. TopoJSON is a static import, no network.
 */
export function WorldMap({ countries, codes, threshold, onSelect, selected }: { countries: MapCountry[]; codes: Record<string, string>; threshold: number; onSelect?: (code: string) => void; selected?: string | null }) {
  const t = useTranslations("planet");
  const [hover, setHover] = useState<string | null>(null);
  const W = 960;
  const H = 500;

  const features = useMemo(() => {
    const topo = topoRaw as unknown as Topology<{ countries: GeometryCollection }>;
    const fc = feature(topo, topo.objects.countries) as unknown as { features: Array<Feature<Geometry, { name?: string }> & { id?: string | number }> };
    const projection = geoNaturalEarth1().fitExtent(
      [
        [4, 4],
        [W - 4, H - 4],
      ],
      { type: "Sphere" },
    );
    const path = geoPath(projection);
    return fc.features.map((f) => ({ id: String(f.id ?? ""), d: path(f) ?? "", name: f.properties?.name ?? "" }));
  }, []);

  const byCode = useMemo(() => new Map(countries.map((c) => [c.code, c])), [countries]);
  const hovered = hover ? byCode.get(hover) : null;

  return (
    <div className="card relative overflow-hidden p-2 md:p-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t("mapHint")}>
        <path d={geoPath(geoNaturalEarth1().fitExtent([[4, 4], [W - 4, H - 4]], { type: "Sphere" }))({ type: "Sphere" }) ?? ""} fill="var(--color-bg-elev)" stroke="var(--color-border)" />
        {features.map((f) => {
          const code = codes[f.id];
          const c = code ? byCode.get(code) : undefined;
          const fill = c?.unlocked && c.survival_index != null ? survivalColor(c.survival_index) : c && c.submissions_count > 0 ? "var(--color-surface-3)" : "var(--color-surface-2)";
          const active = code && (hover === code || selected === code);
          return (
            <path
              key={f.id + f.name}
              d={f.d}
              fill={fill}
              stroke={active ? "var(--color-text)" : "var(--color-bg)"}
              strokeWidth={active ? 1.2 : 0.5}
              opacity={c?.unlocked ? 1 : 0.9}
              className={code ? "cursor-pointer transition-opacity" : ""}
              onMouseEnter={() => code && setHover(code)}
              onMouseLeave={() => setHover(null)}
              onClick={() => code && onSelect?.(code)}
            >
              <title>{c ? `${c.name}: ${c.unlocked && c.survival_index != null ? `${c.survival_index.toFixed(0)} %` : `${t("locked")} ${c.submissions_count}/${threshold}`}` : f.name}</title>
            </path>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-bg-elev/80 px-3 py-1 text-xs text-muted">
        <span className="h-2 w-16 rounded-full" style={{ background: `linear-gradient(90deg, ${survivalColor(0)}, ${survivalColor(50)}, ${survivalColor(100)})` }} />
        0–100 %
        <span className="ml-2 h-2 w-4 rounded-sm bg-surface-3" /> {t("locked")}
      </div>
      {hovered ? (
        <div className="pointer-events-none absolute right-3 top-3 rounded-2xl bg-bg-elev/90 px-3 py-2 text-sm shadow-card">
          <p className="font-semibold">{hovered.name}</p>
          <p className="text-muted">{hovered.unlocked && hovered.survival_index != null ? `${hovered.survival_index.toFixed(0)} %` : t("progress", { count: hovered.submissions_count, threshold })}</p>
        </div>
      ) : null}
    </div>
  );
}
