import "./_env";
import { getRepo, closeDb } from "@/lib/db";
import { recomputeAll, recomputeRound } from "@/lib/recompute";

/** pnpm recompute [--round <slug>] — weights, country_stats, planet_stats (same code as the cron). */
async function main() {
  const i = process.argv.indexOf("--round");
  const slug = i >= 0 ? process.argv[i + 1] : undefined;
  const repo = await getRepo();
  if (slug) {
    const round = await repo.getRound({ slug });
    if (!round) throw new Error(`round ${slug} not found`);
    console.log(JSON.stringify(await recomputeRound(repo, round.id), null, 2));
  } else {
    for (const s of await recomputeAll(repo)) console.log(JSON.stringify(s));
  }
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
