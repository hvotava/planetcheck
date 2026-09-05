import { defineConfig, devices } from "@playwright/test";

// A fresh embedded database per run. globalSetup removes stale ones (it runs after the web server starts,
// so it must never touch the directory the running server uses).
const PGLITE_DIR = process.env.PGLITE_DIR ?? `.pglite/e2e-${Date.now()}`;
process.env.PGLITE_DIR = PGLITE_DIR;

/**
 * E2E runs against `next dev` backed by the embedded PGlite database
 * (PLANETCHECK_DATA=pglite), reset + seeded by tests/e2e/global-setup.ts.
 * No Docker, no Supabase project needed.
 */
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    locale: "cs-CZ",
  },
  projects: [
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: "pnpm dev -p 3100",
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      PLANETCHECK_DATA: "pglite",
      PGLITE_DIR,
      PLANETCHECK_AUTOSEED: "400",
      PLANETCHECK_INTERNAL_CRON: "false",
      NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3100",
      TURNSTILE_SECRET: "1x0000000000000000000000000000000AA",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      IP_SALT: "e2e-salt",
      CRON_SECRET: "e2e-cron",
      ADMIN_TOKEN: "e2e-admin",
    },
  },
});
