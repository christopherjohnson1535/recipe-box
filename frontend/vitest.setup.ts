import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";
import { FIXED_NOW } from "@/test/clock";
import { allowedConsole, resetConsoleAllowances } from "@/test/console";
import { server } from "@/test/server";

// Default clock: only Date is pinned; tests that need timers call vi.useFakeTimers().
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());

const methods = ["error", "warn"] as const;
const seen: string[] = [];
const originals = { error: console.error, warn: console.warn };

beforeEach(() => {
  vi.setSystemTime(FIXED_NOW);
  seen.length = 0;
  for (const m of methods) {
    console[m] = (...args: unknown[]) => {
      const text = args.map(String).join(" ");
      if (!allowedConsole(m, text)) seen.push(`console.${m}: ${text}`);
    };
  }
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  server.resetHandlers();
  for (const m of methods) console[m] = originals[m];
  resetConsoleAllowances();
  if (seen.length) throw new Error(`Unexpected console output (use expectConsole() if intended):\n${seen.join("\n")}`);
});
