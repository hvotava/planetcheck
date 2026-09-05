import "server-only";
import { getRepo } from "@/lib/db/server";
import type { PlanetStatsRow, PulseSeries } from "@/types/api";

export type LiveTick = { stats: PlanetStatsRow; series: PulseSeries; at: string };

type Subscriber = (tick: LiveTick) => void;
type Hub = { subs: Set<Subscriber>; timer: ReturnType<typeof setInterval> | null; last: LiveTick | null };
type Global = typeof globalThis & { __planetcheck_live?: Map<string, Hub> };
const g = globalThis as Global;

const INTERVAL_MS = 5000;

/**
 * One poller per round per process, fanning out to every SSE client — one DB query per 5 s
 * regardless of how many browsers are watching the EKG.
 */
export function subscribeLive(roundId: string, sub: Subscriber): () => void {
  g.__planetcheck_live ??= new Map();
  let hub = g.__planetcheck_live.get(roundId);
  if (!hub) {
    hub = { subs: new Set(), timer: null, last: null };
    g.__planetcheck_live.set(roundId, hub);
  }
  hub.subs.add(sub);
  if (hub.last) sub(hub.last);
  if (!hub.timer) {
    const tick = async () => {
      try {
        const repo = await getRepo();
        const [stats, series] = await Promise.all([repo.refreshPlanetPulse(roundId), repo.pulseSeries(roundId, 60)]);
        const t: LiveTick = { stats, series, at: new Date().toISOString() };
        hub!.last = t;
        for (const s of hub!.subs) s(t);
      } catch (e) {
        console.error("[live] tick failed", e);
      }
    };
    void tick();
    hub.timer = setInterval(tick, INTERVAL_MS);
  }
  return () => {
    hub!.subs.delete(sub);
    if (hub!.subs.size === 0 && hub!.timer) {
      clearInterval(hub!.timer);
      hub!.timer = null;
    }
  };
}
