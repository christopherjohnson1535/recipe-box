import js from "@eslint/js";
import playwright from "eslint-plugin-playwright";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/", "playwright-report/", "test-results/", ".stack/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ...playwright.configs["flat/recommended"],
    files: ["tests/**/*.ts", "support/**/*.ts"],
    rules: {
      ...playwright.configs["flat/recommended"].rules,
      // Determinism rules (#52): no sleeps, no network-idle waits, web-first assertions, no focused tests.
      "playwright/no-wait-for-timeout": "error",
      "playwright/no-networkidle": "error",
      "playwright/no-focused-test": "error",
      "playwright/no-skipped-test": "error",
      "playwright/no-conditional-in-test": "error",
      "playwright/no-force-option": "error",
      "playwright/prefer-web-first-assertions": "error",
      "playwright/missing-playwright-await": "error",
      "playwright/expect-expect": "off", // the api specs assert through helper functions
    },
  },
);
