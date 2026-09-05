import "./_env";
/**
 * pnpm db:local — full local reset: migrate → content → seed → recompute (embedded PGlite).
 * Implemented as a chain in package.json; this file exists so the command is discoverable.
 */
console.log("use: pnpm db:local (runs migrate --reset, content:sync, seed, recompute)");
