import "server-only";
import { getRepo } from "@/lib/db/server";
import type { RoundPayload } from "@/types/api";
import { ApiError } from "./respond";

const TTL_MS = 20_000;
type Global = typeof globalThis & { __planetcheck_rounds?: Map<string, { at: number; value: Promise<RoundPayload | null> }> };
const g = globalThis as Global;

/** Small in-process cache for round payloads (content changes rarely; every play/result hit needs it). */
export async function cachedRound(key: string, load: () => Promise<RoundPayload | null>): Promise<RoundPayload | null> {
  g.__planetcheck_rounds ??= new Map();
  const hit = g.__planetcheck_rounds.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = load();
  g.__planetcheck_rounds.set(key, { at: Date.now(), value });
  value.catch(() => g.__planetcheck_rounds?.delete(key));
  return value;
}

export async function currentRound(): Promise<RoundPayload | null> {
  const repo = await getRepo();
  return cachedRound("current", () => repo.getRound({ kind: "weekly", fallback_anchor: true }));
}

export async function roundBySlugOrCurrent(slug: string | null | undefined): Promise<RoundPayload> {
  const repo = await getRepo();
  const round = slug ? await cachedRound(`slug:${slug}`, () => repo.getRound({ slug })) : await currentRound();
  if (!round) throw new ApiError(404, "no_round", "There is no live round right now.");
  return round;
}

export async function roundById(id: string): Promise<RoundPayload> {
  const repo = await getRepo();
  const round = await cachedRound(`id:${id}`, () => repo.getRound({ id }));
  if (!round) throw new ApiError(404, "no_round", "Unknown round.");
  return round;
}

export function isRoundOpen(round: RoundPayload, now = Date.now()): boolean {
  if (round.status !== "live") return false;
  if (new Date(round.starts_at).getTime() > now) return false;
  if (round.ends_at && new Date(round.ends_at).getTime() <= now) return false;
  return true;
}
