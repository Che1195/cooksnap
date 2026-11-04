import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke tests. Requirements:
 *  - A CookSnap instance: either a dev server on :3000 (auto-started via
 *    webServer below) or PLAYWRIGHT_BASE_URL pointing elsewhere.
 *  - A disposable Clerk dev-instance user named by E2E_CLERK_USER_EMAIL.
 *    The core-loop spec writes real data (recipes, meal plans, shopping
 *    items) — never point it at a personal account.
 */
export default defineConfig({
  testDir: "./e2e",
  // Playwright clears this directory before a run. Keep other evaluation
  // artifacts under test-results outside this disposable subdirectory.
  outputDir: "test-results/playwright",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    // Playwright's bundled Chromium lags Chrome's security fixes and runs
    // unsandboxed by default. Sandbox it on macOS (local runs); Linux CI
    // runners and containers often can't start the sandbox.
    launchOptions: { chromiumSandbox: process.platform === "darwin" },
  },
  projects: [
    { name: "setup", testMatch: /global\.setup\.ts/ },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.clerk/user.json",
      },
      dependencies: ["setup"],
    },
  ],
  ...(process.env.PLAYWRIGHT_BASE_URL
    ? {}
    : {
        webServer: {
          command: "bun run dev",
          url: "http://localhost:3000",
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }),
});
