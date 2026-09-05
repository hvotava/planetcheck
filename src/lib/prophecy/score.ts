/**
 * Prophecy scoring (ARCHITECTURE §15 phase 5). Pure functions, no I/O — the SQL API
 * stores the same Brier score, these exist so the UI and the tests agree with it.
 *
 * Brier score = (p − outcome)², p in 0..1. Lower is better:
 *   0    perfect
 *   0.25 a coin flip
 *   1    confidently wrong
 */

/** Brier score for one guess. `probability` is 0–100, as stored. */
export function brierScore(probability: number, outcome: boolean): number {
  const p = clamp01(probability / 100);
  return (p - (outcome ? 1 : 0)) ** 2;
}

/**
 * Skill against always saying "coin flip": 1 − brier/0.25, clamped to −1..1.
 * Positive means better than 50/50, 0 means no better, negative means worse.
 */
export function forecastSkill(brier: number | null): number | null {
  if (brier == null || !Number.isFinite(brier)) return null;
  return Math.max(-1, Math.min(1, 1 - brier / 0.25));
}

export type CalibrationBin = { bucket: number; label: string; predicted: number; actual: number | null; n: number };

/**
 * Calibration: bucket guesses by predicted decile and compare the average prediction with
 * how often the thing actually happened. A well-calibrated crowd sits on the diagonal —
 * of everything it called "70 %", about 70 % happened.
 */
export function calibration(guesses: Array<{ probability: number; outcome: boolean }>): CalibrationBin[] {
  const bins = new Map<number, { sum: number; hits: number; n: number }>();
  for (const g of guesses) {
    const bucket = Math.min(9, Math.max(0, Math.floor(clamp01(g.probability / 100) * 10)));
    const b = bins.get(bucket) ?? { sum: 0, hits: 0, n: 0 };
    b.sum += clamp01(g.probability / 100) * 100;
    b.hits += g.outcome ? 1 : 0;
    b.n += 1;
    bins.set(bucket, b);
  }
  return [...bins.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bucket, b]) => ({
      bucket,
      label: `${bucket * 10}–${bucket * 10 + 9} %`,
      predicted: b.sum / b.n,
      actual: b.n === 0 ? null : (b.hits / b.n) * 100,
      n: b.n,
    }));
}

/** Mean Brier over guesses that have one; null when none are scored yet. */
export function meanBrier(values: Array<number | null | undefined>): number | null {
  const ok = values.filter((v): v is number => v != null && Number.isFinite(v));
  return ok.length === 0 ? null : ok.reduce((s, v) => s + v, 0) / ok.length;
}

/** Whether a prophecy accepts guesses at `now`. Mirrors submit_prophecy_guess in SQL. */
export function isOpenForGuesses(p: { status: string; opens_at: string; closes_at: string }, now = new Date()): boolean {
  return p.status === "open" && new Date(p.opens_at) <= now && new Date(p.closes_at) > now;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
