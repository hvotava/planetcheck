"use client";

import { useEffect, useRef, useState } from "react";
import type { PlanetStatsRow, PulseSeries } from "@/types/api";

export type LiveState = {
  stats: PlanetStatsRow | null;
  series: PulseSeries | null;
  connected: boolean;
  mode: "sse" | "poll" | "idle";
  updatedAt: string | null;
};

/**
 * Live planet stats: Server-Sent Events from /api/live/planet, with polling of
 * /api/results/pulse as a fallback (proxies that buffer, old browsers, SSE failures).
 */
export function usePlanetLive(roundSlug: string | null, initial?: { stats: PlanetStatsRow | null; series: PulseSeries | null }): LiveState {
  const [state, setState] = useState<LiveState>({
    stats: initial?.stats ?? null,
    series: initial?.series ?? null,
    connected: false,
    mode: "idle",
    updatedAt: null,
  });
  const failures = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = roundSlug ? `?round=${encodeURIComponent(roundSlug)}` : "";
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let disposed = false;

    const startPolling = () => {
      if (poll || disposed) return;
      const tick = async () => {
        try {
          const res = await fetch(`/api/results/pulse${q}`, { cache: "no-store" });
          const json = (await res.json()) as { ok: boolean; data?: { stats: PlanetStatsRow; series: PulseSeries } };
          if (json.ok && json.data) setState((s) => ({ ...s, stats: json.data!.stats, series: json.data!.series, connected: true, mode: "poll", updatedAt: new Date().toISOString() }));
        } catch {
          setState((s) => ({ ...s, connected: false }));
        }
      };
      void tick();
      poll = setInterval(tick, 10_000);
    };

    if (typeof EventSource !== "undefined") {
      es = new EventSource(`/api/live/planet${q}`);
      es.addEventListener("tick", (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as { stats: PlanetStatsRow; series: PulseSeries; at: string };
          failures.current = 0;
          setState((s) => ({ ...s, stats: data.stats, series: data.series, connected: true, mode: "sse", updatedAt: data.at }));
        } catch {
          /* ignore malformed */
        }
      });
      es.onerror = () => {
        failures.current += 1;
        setState((s) => ({ ...s, connected: false }));
        if (failures.current >= 3 && es) {
          es.close();
          es = null;
          startPolling();
        }
      };
    } else {
      startPolling();
    }

    return () => {
      disposed = true;
      es?.close();
      if (poll) clearInterval(poll);
    };
  }, [roundSlug]);

  return state;
}
