import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Set in the main process so every worker inherits them before Date/Intl are first used.
process.env.TZ = "UTC";
process.env.LC_ALL = "en_US.UTF-8";
process.env.LANG = "en_US.UTF-8";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    environmentOptions: { jsdom: { url: "http://localhost:3000/" } },
    env: { TZ: "UTC", LC_ALL: "en_US.UTF-8", LANG: "en_US.UTF-8" },
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    // Always shuffle: order-dependence shows up locally, not only in CI. A failing run prints its seed
    // (re-run with --sequence.seed=<n>).
    sequence: { shuffle: true },
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      // The service worker and its build-time bundling route run outside jsdom; e2e/tests/web/offline.spec.ts covers them.
      exclude: ["src/**/*.test.*", "src/test/**", "src/**/*.d.ts", "src/app/sw.ts", "src/app/serwist/**"],
      reporter: ["text", "html", "json-summary"],
    },
  },
});
