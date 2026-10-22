import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, STACK } from "./support/env.ts";

// Only Chromium is installed in CI and in the sandbox, so the phone and iPad profiles run on Chromium with the
// device's viewport, touch support and user agent.
const onChromium = (d: (typeof devices)[string]) => ({ ...d, defaultBrowserType: "chromium" as const });


export default defineConfig({
  testDir: "tests",
  globalSetup: "./support/global-setup.ts",
  fullyParallel: true,
  retries: 0, // a flaky test is a bug (#52)
  forbidOnly: !!process.env.CI,
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : process.env.CI ? 4 : 3,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    locale: "en-US",
    timezoneId: "America/Denver",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "api", testDir: "tests/api", use: { extraHTTPHeaders: { accept: "application/json" } } },
    { name: "web-desktop", testDir: "tests/web", use: { ...devices["Desktop Chrome"] } },
    { name: "web-ipad", testDir: "tests/web", use: onChromium(devices["iPad Pro 11 landscape"]) },
    { name: "web-phone", testDir: "tests/web", use: onChromium(devices["iPhone 15"]) },
    // Restarts containers, so it runs on its own after everything else, and only against a compose stack.
    ...(STACK === "compose"
      ? [{ name: "compose", testDir: "tests/compose", dependencies: ["api", "web-desktop", "web-ipad", "web-phone"] }]
      : []),
  ],
});
