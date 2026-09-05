"use client";

import { Ekg } from "@/components/viz/Ekg";
import { usePlanetLive } from "@/lib/live/usePlanetLive";
import type { PlanetStatsRow, PulseSeries } from "@/types/api";

/** Ekg wired to the live feed (SSE → polling). The viz itself stays pure. */
export function LiveEkg({ roundSlug, initialStats, initialSeries, compact = false, flash = false }: { roundSlug: string | null; initialStats: PlanetStatsRow | null; initialSeries: PulseSeries | null; compact?: boolean; flash?: boolean }) {
  const live = usePlanetLive(roundSlug, { stats: initialStats, series: initialSeries });
  const points = (live.series?.points ?? []).map((p) => p.cnt);
  return (
    <Ekg
      points={points}
      perMin={live.stats?.pulse_per_min ?? 0}
      votesTotal={live.stats?.votes_total ?? 0}
      survival={{ raw: live.stats?.survival_raw ?? null, weighted: live.stats?.survival_weighted ?? null }}
      live={live.connected}
      compact={compact}
      flash={flash}
    />
  );
}
