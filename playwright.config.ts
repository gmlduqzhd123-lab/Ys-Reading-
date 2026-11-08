import { defineConfig, devices } from "@playwright/test";
if (
  process.env.BOOKFOREST_E2E !== "1" ||
  !/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  )
)
  throw Error("ISOLATED_LOCAL_BROWSER_TESTS_ONLY");
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  retries: 0,
  timeout: 120000,
  globalTimeout: 10 * 60000,
  reporter: "list",
  use: {
    actionTimeout: 15000,
    baseURL: "http://127.0.0.1:3096",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      testMatch: /(?:journey|completion|teacher-accessibility)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "webkit-mobile",
      testMatch: /(?:responsive|mobile-learning)\.spec\.ts/,
      use: { ...devices["iPhone 13"] },
    },
  ],
  webServer: {
    command: "npm start -- --port 3096",
    url: "http://127.0.0.1:3096/api/health",
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3096",
      SUPABASE_SECRET_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
    },
  },
});
