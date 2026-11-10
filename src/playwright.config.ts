// End-to-end and accessibility harness (S-005). `npm run test:e2e` builds the app,
// serves the built Worker locally (workerd via `vite preview`) against a local
// Postgres reset by global setup, and runs every spec at 320, 375 and 1280 px.
import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const baseURL = `http://localhost:${PORT}`;
/** Optional: a pre-installed Chromium whose revision differs from this Playwright's. */
const executablePath = process.env.PW_CHROMIUM_EXECUTABLE || undefined;

const desktop = devices["Desktop Chrome"];

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./tests/e2e/support/global-setup.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
    launchOptions: { executablePath },
  },
  projects: [
    { name: "phone-320", use: { ...desktop, viewport: { width: 320, height: 640 } } },
    { name: "phone-375", use: { ...desktop, viewport: { width: 375, height: 667 } } },
    { name: "desktop-1280", use: { ...desktop, viewport: { width: 1280, height: 800 } } },
  ],
  webServer: [
    {
      // Local GoTrue stub (S-009): the real @supabase/ssr adapter talks to it, never to Supabase.
      command: "npx tsx tests/e2e/support/gotrue-stub.ts",
      url: "http://127.0.0.1:54321/auth/v1/health",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      // The `e2e` environment in wrangler.jsonc holds the (placeholder) bindings.
      command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        CLOUDFLARE_ENV: "e2e",
        CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
        // No real network in tests: skip fetching the Request.cf placeholder from Cloudflare.
        CLOUDFLARE_CF_FETCH_ENABLED: "false",
      },
    },
  ],
});
