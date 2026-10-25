import { defineConfig } from "@playwright/test";

// Backup and restore (issue #19): scripts/backup.sh and scripts/restore.sh against a throwaway stack of their own, not
// the shared e2e stack, because the test wipes the volumes. One worker, one ordered story, no retries.
export default defineConfig({
  testDir: "tests/backup",
  // direct-mode.spec.ts covers what only exists without Docker (BACKUP_MODE=direct).
  testIgnore: process.env.E2E_STACK === "compose" ? "**/direct-mode.spec.ts" : undefined,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 600_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "playwright-report/backup" }]] : [["list"]],
  outputDir: "test-results/backup",
});
