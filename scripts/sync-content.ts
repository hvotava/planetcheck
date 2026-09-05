import "./_env";
import { loadContent } from "@/lib/content/loader";
import { getRepo, closeDb } from "@/lib/db";
import { syncContent } from "@/lib/content/sync";

/**
 * pnpm content:sync          validate content/*.yaml and upsert into the DB (never deletes)
 * pnpm content:check         validate only
 */
async function main() {
  const check = process.argv.includes("--check");
  const bundle = loadContent();
  console.log(`content OK: ${bundle.rounds.length} rounds, ${bundle.archetypes.archetypes.length} archetype rules, ${bundle.titles.titles.length} titles`);
  for (const r of bundle.rounds) {
    const choice = r.questions.filter((q) => q.type === "choice").length;
    const meta = r.questions.filter((q) => q.type === "meta").length;
    console.log(`  ${r.slug} [${r.kind}/${r.status}] ${choice} dilemmas + ${meta} meta, ${r.contradictions.length} pairs, honeypot: ${r.questions.flatMap((q) => q.options.filter((o) => o.honeypot).map((o) => `${q.key}.${o.key}`)).join(", ")}`);
  }
  if (check) return;
  const repo = await getRepo();
  await syncContent(repo);
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
