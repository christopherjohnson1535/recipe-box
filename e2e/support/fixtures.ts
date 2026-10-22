import { randomUUID } from "node:crypto";
import { test as base, expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { ApiClient, type NewUser, type User } from "./api-client.ts";
import { ADMIN, BASE_URL, FIXTURE_ORIGIN } from "./env.ts";

export { expect };
export { TEST_PNG } from "./fixture-server.ts";
/**
 * Waits until React has hydrated this element (it attaches its props to the DOM node). Acting on server-rendered
 * markup before that does nothing: the onChange/onClick handlers are not there yet.
 */
export async function hydrated(locator: Locator) {
  await expect
    .poll(() => locator.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps$"))), { message: "waiting for hydration" })
    .toBe(true);
}

/** On a phone the tag filter sits in a collapsed "Tag:" disclosure; on wider screens it is already showing. */
export async function openTagFilter(page: Page) {
  const summary = page.getByText("Tag:", { exact: false }).locator("xpath=ancestor-or-self::summary");
  if (await summary.isVisible()) await summary.click();
}

export const fixtureUrl = (name: string) => `${FIXTURE_ORIGIN}/${name}`;

/** Every test's time starts here (a Saturday, noon in Denver). Time still runs; `page.clock` can jump it. */
export const FIXED_NOW = new Date("2026-03-14T18:00:00Z");

/** Short unique text for names, titles and tags, so tests in one shared household never see each other's data. */
export const unique = (prefix = "t") => `${prefix}${randomUUID().replaceAll("-", "").slice(0, 10)}`;

export type Member = { user: User; password: string; client: ApiClient };

async function newClient(playwright: { request: { newContext: (o: { baseURL: string }) => Promise<APIRequestContext> } }) {
  return new ApiClient(await playwright.request.newContext({ baseURL: BASE_URL }));
}

type Fixtures = {
  /** Not signed in. */
  anon: ApiClient;
  /** The admin from globalSetup, signed in. Use it to create members; do not change the admin account. */
  admin: ApiClient;
  /** A fresh household member (own username), signed in through the API. */
  member: Member;
  /** A fresh admin of its own, for tests that need admin rights without sharing the global one. */
  makeUser: (u?: Partial<NewUser>) => Promise<Member>;
  /** The page, signed in as `member` (cookie copied from the API session), with the fixed clock. */
  memberPage: Page;
};

export const test = base.extend<Fixtures>({
  // Nothing may leave the machine: the browser can only talk to the stack and the fixture site.
  context: async ({ context }, use) => {
    await context.route(
      (url) => !["127.0.0.1", "localhost", "fixture"].includes(url.hostname) && url.protocol.startsWith("http"),
      (route) => route.abort("blockedbyclient"),
    );
    await use(context);
  },

  page: async ({ page }, use) => {
    await page.clock.install({ time: FIXED_NOW });
    await use(page);
  },

  anon: async ({ playwright }, use) => {
    const c = await newClient(playwright);
    await use(c);
    await c.request.dispose();
  },

  admin: async ({ playwright }, use) => {
    const c = await newClient(playwright);
    await c.login(ADMIN.username, ADMIN.password);
    await use(c);
    await c.request.dispose();
  },

  makeUser: async ({ admin, playwright }, use) => {
    const made: Member[] = [];
    await use(async (overrides = {}) => {
      const name = unique("u");
      const password = overrides.password ?? `pw-${unique()}`;
      const user = await admin.createUser({ username: name, displayName: `Cook ${name}`, password, ...overrides });
      const client = await newClient(playwright);
      await client.login(user.username, password);
      const m = { user, password, client };
      made.push(m);
      return m;
    });
    for (const m of made) await m.client.request.dispose();
  },

  member: async ({ makeUser }, use) => {
    await use(await makeUser());
  },

  memberPage: async ({ page, member }, use) => {
    const { cookies } = await member.client.request.storageState();
    await page.context().addCookies(cookies);
    await use(page);
  },
});
