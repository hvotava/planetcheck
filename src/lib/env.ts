import { z } from "zod";

/**
 * Server environment. Parsed lazily so that scripts, tests and the Next.js server share one source.
 * Never import from client components — use NEXT_PUBLIC_* through `publicEnv` instead.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PLANETCHECK_DATA: z.enum(["pg", "pglite"]).optional(),
  DATABASE_URL: z.string().optional(),
  PGSSLMODE: z.string().optional(),
  PGLITE_DIR: z.string().default(".pglite/dev"),
  PLANETCHECK_AUTOSEED: z.coerce.number().int().min(0).optional(),
  PLANETCHECK_INTERNAL_CRON: z.string().optional(),
  REDIS_URL: z.string().optional(),
  TURNSTILE_SECRET: z.string().optional(),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
  IP_SALT: z.string().default("dev-salt-not-for-production"),
  CRON_SECRET: z.string().default("dev-cron"),
  ADMIN_TOKEN: z.string().default("dev-admin"),
  AUTH_SECRET: z.string().default("dev-auth-secret-not-for-production"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  APPLE_CLIENT_ID: z.string().optional(),
  APPLE_TEAM_ID: z.string().optional(),
  APPLE_KEY_ID: z.string().optional(),
  APPLE_PRIVATE_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  NARRATOR_MODEL: z.string().default("claude-sonnet-5"),
  TRANSLATE_MODEL: z.string().default("claude-haiku-4-5-20251001"),
  NEXT_PUBLIC_SITE_URL: z.string().default("http://localhost:3000"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.parse(process.env);
  if (parsed.NODE_ENV === "production") {
    const problems: string[] = [];
    if (dataBackend(parsed) === "pg" && !parsed.DATABASE_URL) problems.push("DATABASE_URL is required in production");
    for (const k of ["IP_SALT", "CRON_SECRET", "ADMIN_TOKEN", "AUTH_SECRET"] as const) {
      if (parsed[k].startsWith("dev-") || parsed[k].startsWith("change-me")) problems.push(`${k} must be set to a real secret`);
    }
    if (problems.length) throw new Error(`Invalid production environment:\n - ${problems.join("\n - ")}`);
  }
  cached = parsed;
  return parsed;
}

export function dataBackend(e: Env = env()): "pg" | "pglite" {
  if (e.PLANETCHECK_DATA) return e.PLANETCHECK_DATA;
  return e.DATABASE_URL ? "pg" : "pglite";
}

export function internalCronEnabled(e: Env = env()): boolean {
  const v = (e.PLANETCHECK_INTERNAL_CRON ?? "true").toLowerCase();
  return v !== "false" && v !== "0" && v !== "off";
}

/** Reset the cache (tests). */
export function resetEnvCache(): void {
  cached = null;
}
