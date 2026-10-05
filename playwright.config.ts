import { defineConfig, devices } from "@playwright/test";

const PORT = 3013;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "phone", testMatch: /landing\.spec\.ts/, use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
  webServer: {
    // Run pages with ids starting "fixture-" render from recorded logs instead of the database.
    command: `unset NODE_ENV; E2E_FIXTURES=1 pnpm exec next dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
