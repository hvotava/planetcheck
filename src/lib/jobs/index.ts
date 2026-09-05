import "server-only";
import { env } from "@/lib/env";
import { getRepo } from "@/lib/db/server";
import { recomputeAll, type RecomputeSummary } from "@/lib/recompute";
import { anthropicNarratorClient, buildNarratorUserPrompt, NARRATOR_SYSTEM_PROMPT, wordCount, type NarratorClient } from "@/lib/narrator";

/**
 * Scheduled jobs. Each takes a lease in job_leases (leader election across replicas),
 * so the internal scheduler and the /api/cron/* endpoints can coexist safely.
 */
export async function runRecomputeJob(): Promise<{ skipped: boolean; rounds: RecomputeSummary[]; ms: number }> {
  const repo = await getRepo();
  const lease = await repo.acquireJobLease("recompute", 9 * 60);
  if (!lease.acquired) return { skipped: true, rounds: [], ms: 0 };
  const started = Date.now();
  try {
    const rounds = await recomputeAll(repo, { log: (m) => console.log(`[recompute] ${m}`) });
    await repo.releaseJobLease("recompute", "ok");
    return { skipped: false, rounds, ms: Date.now() - started };
  } catch (e) {
    await repo.releaseJobLease("recompute", "error", e instanceof Error ? e.message : String(e));
    throw e;
  }
}

export async function runNarratorJob(locales?: string[], client?: NarratorClient): Promise<{ skipped: boolean; posts: Array<{ locale: string; id: string; words: number }>; reason?: string }> {
  const e = env();
  const repo = await getRepo();
  const lease = await repo.acquireJobLease("narrator", 10 * 60);
  if (!lease.acquired) return { skipped: true, posts: [] };
  try {
    const round = await repo.getRound({ kind: "weekly", fallback_anchor: true });
    if (!round) {
      await repo.releaseJobLease("narrator", "no_round");
      return { skipped: true, posts: [], reason: "no live round" };
    }
    const narrator = client ?? (e.ANTHROPIC_API_KEY ? await anthropicNarratorClient(e.ANTHROPIC_API_KEY, e.NARRATOR_MODEL) : null);
    if (!narrator) {
      await repo.releaseJobLease("narrator", "no_api_key");
      return { skipped: true, posts: [], reason: "ANTHROPIC_API_KEY not set" };
    }
    const context = await repo.narratorContext(round.id);
    const posts: Array<{ locale: string; id: string; words: number }> = [];
    for (const locale of locales ?? ["cs", "en"]) {
      const body = await narrator.generate(NARRATOR_SYSTEM_PROMPT, buildNarratorUserPrompt(context, locale));
      const words = wordCount(body);
      const inserted = await repo.insertNarratorPost({ round_id: round.id, locale, body, model: e.NARRATOR_MODEL, context: { ...(context as object), words } as never });
      posts.push({ locale, id: inserted.id, words });
    }
    await repo.releaseJobLease("narrator", "ok");
    return { skipped: false, posts };
  } catch (err) {
    await repo.releaseJobLease("narrator", "error", err instanceof Error ? err.message : String(err));
    throw err;
  }
}
