import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Loads .env.local then .env (first wins), like Next.js does for the app. */
for (const f of [".env.local", ".env"]) {
  const p = resolve(process.cwd(), f);
  if (existsSync(p)) config({ path: p, override: false, quiet: true });
}
