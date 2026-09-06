import "./_env";
import { getRepo, closeDb } from "@/lib/db";
import { seedSynthetic } from "@/lib/seed/synthetic";
import { seedCompass } from "@/lib/seed/compass";
import { loadCompass } from "@/lib/content/loader";

/**
 * pnpm seed [--total 10000] [--countries 40] [--round 2026-w37] [--seed 42]
 * Synthetic votes for development. Never run against production (they are marked synthetic = true).
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--i-know-this-is-production")) {
    throw new Error("refusing to seed synthetic votes in production");
  }
  const repo = await getRepo();
  const res = await seedSynthetic(repo, {
    total: arg("total") ? Number(arg("total")) : 10_000,
    countries: arg("countries") ? Number(arg("countries")) : 40,
    seed: arg("seed") ? Number(arg("seed")) : undefined,
    roundSlug: arg("round"),
  });
  console.log(`seeded ${res.inserted} votes into ${res.round} (${res.duplicates} duplicates skipped)`);

  const compassTotal = arg("compass") ? Number(arg("compass")) : Math.round((arg("total") ? Number(arg("total")) : 10_000) * 0.12);
  if (compassTotal > 0) {
    const c = await seedCompass(repo, loadCompass().compass.version, { total: compassTotal, seed: arg("seed") ? Number(arg("seed")) : undefined });
    console.log(`seeded ${c.inserted} compass runs (${c.duplicates} duplicates skipped)`);
  }
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
