import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
import { ADMIN, BASE_URL, COMPOSE_FILE, STACK } from "./env.ts";
import { FIXTURES_DIR, ROOT, startNativeStack, waitFor } from "./stack.ts";
import { FIXTURE_PORT } from "./env.ts";
import { startFixtureServer } from "./fixture-server.ts";

/**
 * Brings the stack up (native: database + API + web; compose: `docker compose up --wait`), starts the fixture site
 * (native only; compose runs it as a service) and creates the first admin through the real setup page. Returns the
 * teardown.
 */
export default async function globalSetup() {
  const stops: Array<() => Promise<void> | void> = [];
  const teardown = async () => {
    for (const stop of stops.reverse()) await stop();
  };
  try {
    if (STACK === "native") {
      const fixture = await startFixtureServer(FIXTURES_DIR, FIXTURE_PORT);
      stops.push(() => new Promise<void>((r) => fixture.close(() => r())));
      const stack = await startNativeStack();
      stops.push(stack.stop);
    } else {
      // CI runs `docker compose up --wait` as its own step, but a developer can just run the tests.
      execFileSync("docker", ["compose", "-f", COMPOSE_FILE, "up", "-d", "--build", "--wait", "--wait-timeout", "300"], { cwd: ROOT, stdio: "inherit" });
      if (!process.env.E2E_KEEP_STACK) stops.push(() => void execFileSync("docker", ["compose", "-f", COMPOSE_FILE, "down", "-v"], { cwd: ROOT, stdio: "inherit" }));
      await waitFor(`${BASE_URL}/api/health`, "the web container");
    }
    await createFirstAdmin();
  } catch (e) {
    await teardown();
    throw e;
  }
  return teardown;
}

/** First-run setup, driven through the page: the one place the setup form is exercised. */
async function createFirstAdmin() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL: BASE_URL, locale: "en-US", timezoneId: "America/Denver" });
    const status = await (await page.request.get("/api/setup")).json();
    if (!status.needsSetup) throw new Error("the stack already has users; e2e needs an empty database");
    await page.goto("/setup");
    await page.getByLabel("Your name").fill(ADMIN.displayName);
    await page.getByLabel("Username").fill(ADMIN.username);
    await page.getByLabel("Password").fill(ADMIN.password);
    await page.getByRole("button", { name: "Create admin account" }).click();
    await page.waitForURL(`${BASE_URL}/`);
  } finally {
    await browser.close();
  }
}
