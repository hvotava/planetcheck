import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/** Removes embedded databases of previous e2e runs (never the one the current web server is using). */
export default async function globalSetup() {
  const current = process.env.PGLITE_DIR ?? "";
  let entries: string[] = [];
  try {
    entries = readdirSync(".pglite");
  } catch {
    return;
  }
  for (const name of entries) {
    const dir = join(".pglite", name);
    if (name.startsWith("e2e") && dir !== current) rmSync(dir, { recursive: true, force: true });
  }
}
