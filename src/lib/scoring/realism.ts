import type { MetaGuess } from "@/types/domain";

/**
 * Realism = mean over meta questions of 1 − |guess − actual| / 100.
 * Guesses without an `actual` (planet has no data yet) are skipped; if none remain → null.
 * Pure. ARCHITECTURE §8.
 */
export function scoreRealism(guesses: MetaGuess[]): number | null {
  const usable = guesses.filter((g) => g.actual != null && Number.isFinite(g.actual));
  if (usable.length === 0) return null;
  const sum = usable.reduce((s, g) => s + (1 - Math.abs(g.guess - (g.actual as number)) / 100), 0);
  return Math.min(1, Math.max(0, sum / usable.length));
}
