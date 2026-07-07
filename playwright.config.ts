import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke tests. Requirements:
 *  - A CookSnap instance: either a dev server on :3000 (auto-started via
 *    webServer below) or PLAYWRIGHT_BASE_URL pointing elsewhere.
 *  - A disposable test account: TEST_USER_EMAIL / TEST_USER_PASSWORD.
 *    The core-loop spec writes real data (recipes, meal plans, shopping
 *    items) — never point it at a personal account.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  ...(process.env.PLAYWRIGHT_BASE_URL
    ? {}
    : {
        webServer: {
          command: "npm run dev",
          url: "http://localhost:3000",
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }),
});
