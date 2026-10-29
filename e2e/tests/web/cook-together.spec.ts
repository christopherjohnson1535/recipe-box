import type { Page } from "@playwright/test";
import type { ApiClient } from "../../support/api-client.ts";
import { expect, hydrated, test, unique } from "../../support/fixtures.ts";

// KIT-7: two recipes in one cook session. Each step carries its dish, the cook controls the order, and order and ticks survive a reload.

/** Two dishes with distinct first letters (so their marks differ) and steps that name no time (so no timer chip splits the text). */
async function twoDishes(c: ApiClient) {
  const word = unique("ct");
  const a = await c.createRecipe({
    title: `Ragu ${word}`,
    servings: "4",
    ingredients: [
      { text: "2 onions", section: null },
      { text: "500 g mince", section: null },
    ],
    steps: [
      { text: "Chop the onions.", section: null },
      { text: "Brown the mince.", section: null },
      { text: "Simmer the sauce.", section: null },
    ],
  });
  const b = await c.createRecipe({
    title: `Tart ${word}`,
    servings: "6",
    ingredients: [
      { text: "2 onions", section: null },
      { text: "1 sheet pastry", section: null },
    ],
    steps: [
      { text: "Slice the onions thinly.", section: null },
      { text: "Roll out the pastry.", section: null },
    ],
  });
  return { word, a, b };
}

const stage = (page: Page) => page.getByRole("dialog", { name: "Cooking mode" });
const view = (page: Page, name: "One step" | "All steps" | "By dish") => stage(page).getByRole("radio", { name });
/** The all-steps list: only its items have Earlier/Later buttons. */
const combined = (page: Page) => stage(page).getByRole("listitem").filter({ has: page.getByRole("button", { name: /^Move .* later$/ }) });
const stepTick = (page: Page, dish: string, step: number) => stage(page).getByRole("button", { name: `${dish} step ${step} done` });

test("start from the home grid: both dishes open in one session, the first step shows its dish", async ({ memberPage: page, member }) => {
  const { word, a, b } = await twoDishes(member.client);

  await page.goto(`/?q=${word}`);
  const select = page.getByRole("button", { name: "Select recipes" });
  await hydrated(select);
  await select.click();
  const together = page.getByRole("button", { name: "Cook together" });
  // "Cook together" needs two: until then it is aria-disabled (it keeps focus), and a hint says why.
  await expect(together).toHaveAttribute("aria-disabled", "true");
  await page.getByRole("button", { name: new RegExp(`^Ragu ${word}`) }).click();
  await expect(together).toHaveAttribute("aria-disabled", "true");
  await page.getByRole("button", { name: new RegExp(`^Tart ${word}`) }).click();
  await expect(together).not.toHaveAttribute("aria-disabled", "true");
  await together.click();

  await expect(page).toHaveURL(/\/cook\?recipes=/);
  const ids = (new URL(page.url()).searchParams.get("recipes") ?? "").split(",");
  expect([...ids].sort()).toEqual([a.id, b.id].sort());
  await expect(stage(page)).toBeVisible();

  // Both dishes in the legend; the dish that comes first (the grid's order) shows on the first step, with its own text.
  const legend = stage(page).getByRole("list", { name: "Dishes" });
  await expect(legend).toContainText(a.title);
  await expect(legend).toContainText(b.title);
  const firsts = [
    { dish: a, text: "Chop the onions." },
    { dish: b, text: "Slice the onions thinly." },
  ];
  const found = firsts.find((f) => f.dish.id === ids[0]);
  expect(found).toBeDefined();
  const first = found as (typeof firsts)[number];
  await expect(stage(page).getByText(first.text, { exact: true })).toBeVisible();
  await expect(stage(page).getByText(`Step 1 of ${first.dish.steps.length} · 1st of 5`)).toBeVisible();
  await expect(stage(page).getByText(first.dish.title, { exact: true }).first()).toBeVisible();
  await expect(stepTick(page, first.dish.title, 1)).toBeVisible();

  // The wake status is on screen: "on" where the browser can hold a lock, "may sleep" where it cannot (headless Chromium).
  await expect(stage(page).getByText(/^Screen (stays on|may sleep)$/)).toBeVisible();
});

test("start from a recipe page: the picker has that dish chosen, add a second and start", async ({ memberPage: page, member }) => {
  const { a, b } = await twoDishes(member.client);

  await page.goto(`/recipes/${a.id}`);
  const link = page.getByRole("link", { name: "Cook together" });
  await hydrated(link);
  await link.click();

  await expect(page).toHaveURL(new RegExp(`/cook\\?recipes=${a.id}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Cook together" })).toBeVisible();
  const start = page.getByRole("button", { name: "Start cooking" });
  const mine = page.getByRole("button", { name: new RegExp(`^${a.title}`) });
  await hydrated(mine);
  await expect(mine).toHaveAttribute("aria-pressed", "true");
  await expect(start).toBeDisabled(); // one dish is not "together"

  await page.getByRole("button", { name: new RegExp(`^${b.title}`) }).click();
  await expect(start).toBeEnabled();
  await start.click();

  await expect(page).toHaveURL(new RegExp(`/cook\\?recipes=${a.id},${b.id}$`));
  await expect(stage(page)).toBeVisible();
  // The recipe you came from is dish 1, so round-robin opens on its first step, then the other dish's.
  await expect(stage(page).getByText("Chop the onions.", { exact: true })).toBeVisible();
  await stage(page).getByRole("button", { name: "Next step →" }).click();
  await expect(stage(page).getByText("Slice the onions thinly.", { exact: true })).toBeVisible();
  await expect(stage(page).getByText(`Step 1 of ${b.steps.length} · 2nd of 5`)).toBeVisible();
});

test("reorder, tick, reload: the order and the tick are still there; then finish", async ({ memberPage: page, member }) => {
  const { a, b } = await twoDishes(member.client);

  await page.goto(`/cook?recipes=${a.id},${b.id}`);
  await hydrated(stage(page));
  await expect(stage(page).getByText("Chop the onions.", { exact: true })).toBeVisible();
  await view(page, "All steps").click();
  // Round-robin to begin with: A1 B1 A2 B2 A3.
  await expect(combined(page)).toHaveText([/Chop the onions/, /Slice the onions/, /Brown the mince/, /Roll out the pastry/, /Simmer the sauce/]);
  await expect(stage(page).getByRole("button", { name: "Reset order" })).toHaveCount(0);

  // The last step has nothing after it; A's second step has B's second after it: move it later.
  await expect(stage(page).getByRole("button", { name: `Move ${a.title} step 3 later` })).toHaveAttribute("aria-disabled", "true");
  await stage(page).getByRole("button", { name: `Move ${a.title} step 2 later` }).click();
  await expect(combined(page)).toHaveText([/Chop the onions/, /Slice the onions/, /Roll out the pastry/, /Brown the mince/, /Simmer the sauce/]);

  // Tick B's first step (not the current one, so nothing else moves).
  const done = stepTick(page, b.title, 1);
  await done.click();
  await expect(done).toHaveAttribute("aria-pressed", "true");
  await expect(stage(page).getByText("1 of 5 steps done")).toBeAttached();
  await expect(stage(page).getByRole("button", { name: "Reset order" })).toBeVisible();

  await page.reload();
  await hydrated(stage(page));
  // The view, the order and the tick all came back.
  await expect(view(page, "All steps")).toHaveAttribute("aria-checked", "true");
  await expect(combined(page)).toHaveText([/Chop the onions/, /Slice the onions/, /Roll out the pastry/, /Brown the mince/, /Simmer the sauce/]);
  await expect(stepTick(page, b.title, 1)).toHaveAttribute("aria-pressed", "true");
  await expect(stepTick(page, b.title, 2)).toHaveAttribute("aria-pressed", "false");
  await expect(stage(page).getByText("1 of 5 steps done")).toBeAttached();
  await expect(stage(page).getByRole("button", { name: "Reset order" })).toBeVisible();

  // Walk the new order one step at a time: it opens on the first step not done (A1), then B2 comes before A2.
  await view(page, "One step").click();
  await expect(stage(page).getByText("Chop the onions.", { exact: true })).toBeVisible();
  const next = stage(page).getByRole("button", { name: "Next step →" });
  for (const text of ["Slice the onions thinly.", "Roll out the pastry.", "Brown the mince.", "Simmer the sauce."]) {
    await next.click();
    await expect(stage(page).getByText(text, { exact: true })).toBeVisible();
  }
  await stage(page).getByRole("link", { name: "Finish" }).click();
  // Several dishes finish at the recipes home, not at one of them.
  await expect(page).toHaveURL(/^[^?#]*\/$/);
  await expect(page.getByRole("button", { name: "Select recipes" })).toBeVisible();
});

test("bring a dish's next step here, and reset order, put the steps back round-robin", async ({ memberPage: page, member }) => {
  const { a, b } = await twoDishes(member.client);

  await page.goto(`/cook?recipes=${a.id},${b.id}`);
  await hydrated(stage(page));
  await view(page, "All steps").click();
  await stage(page).getByRole("button", { name: `Move ${a.title} step 2 later` }).click();
  await expect(combined(page)).toHaveText([/Chop the onions/, /Slice the onions/, /Roll out the pastry/, /Brown the mince/, /Simmer the sauce/]);
  await expect(stage(page).getByRole("button", { name: "Reset order" })).toBeVisible();

  // Back on the first step (A1) B's next step is already next, so there is nothing to bring.
  await view(page, "One step").click();
  await expect(stage(page).getByRole("button", { name: `Bring ${b.title}’s next step here` })).toHaveCount(0);
  // On B's first step, A's next step is two places on: pull it here. That is round-robin again, so there is nothing to reset.
  await stage(page).getByRole("button", { name: "Next step →" }).click();
  await expect(stage(page).getByText("Slice the onions thinly.", { exact: true })).toBeVisible();
  await stage(page).getByRole("button", { name: `Bring ${a.title}’s next step here` }).click();
  await view(page, "All steps").click();
  await expect(combined(page)).toHaveText([/Chop the onions/, /Slice the onions/, /Brown the mince/, /Roll out the pastry/, /Simmer the sauce/]);
  await expect(stage(page).getByRole("button", { name: "Reset order" })).toHaveCount(0);

  // Reset undoes a move.
  await stage(page).getByRole("button", { name: `Move ${b.title} step 1 later` }).click();
  await expect(combined(page)).toHaveText([/Chop the onions/, /Brown the mince/, /Slice the onions/, /Roll out the pastry/, /Simmer the sauce/]);
  await stage(page).getByRole("button", { name: "Reset order" }).click();
  await expect(combined(page)).toHaveText([/Chop the onions/, /Slice the onions/, /Brown the mince/, /Roll out the pastry/, /Simmer the sauce/]);
  await expect(stage(page).getByRole("button", { name: "Reset order" })).toHaveCount(0);
});

test("ingredients are ticked per dish, and the ticks are the recipe's own in single cook mode", async ({ memberPage: page, member }) => {
  const { a, b } = await twoDishes(member.client);

  await page.goto(`/cook?recipes=${a.id},${b.id}`);
  await hydrated(stage(page));
  // Both dishes have "2 onions". On A's first step the rail shows A's; tick it.
  await expect(stage(page).getByRole("tab", { name: a.title })).toHaveAttribute("aria-selected", "true");
  const onions = stage(page).getByRole("tabpanel").getByRole("button", { name: /onions/ });
  await onions.click();
  await expect(onions).toHaveAttribute("aria-pressed", "true");

  await expect(stage(page).getByText("For this step", { exact: true })).toBeVisible();
  // Looking at B's tab while on A's step shows all of B's ingredients, not "for this step".
  await stage(page).getByRole("tab", { name: b.title }).click();
  await expect(stage(page).getByText("All ingredients", { exact: true })).toBeVisible();
  await stage(page).getByRole("tab", { name: a.title }).click();
  // The next step is B's: the rail follows it, and B's onions are not ticked.
  await stage(page).getByRole("button", { name: "Next step →" }).click();
  await expect(stage(page).getByRole("tab", { name: b.title })).toHaveAttribute("aria-selected", "true");
  await expect(onions).toHaveAttribute("aria-pressed", "false");
  await stage(page).getByRole("button", { name: "← Back" }).click();
  await expect(stage(page).getByRole("tab", { name: a.title })).toHaveAttribute("aria-selected", "true");
  await expect(onions).toHaveAttribute("aria-pressed", "true");

  // A's tick is A's own: single cook mode of A shows it, B's does not.
  await page.goto(`/recipes/${a.id}/cook`);
  await hydrated(stage(page));
  await expect(stage(page).getByRole("button", { name: /onions/ })).toHaveAttribute("aria-pressed", "true");
  await page.goto(`/recipes/${b.id}/cook`);
  await hydrated(stage(page));
  await expect(stage(page).getByRole("button", { name: /onions/ })).toHaveAttribute("aria-pressed", "false");
});

test("an iPad held upright: no sideways scrolling, all three views, controls 44px", async ({ memberPage: page, member }) => {
  // eslint-disable-next-line playwright/no-skipped-test -- one project is enough for the viewport this test sets itself
  test.skip(test.info().project.name !== "web-ipad", "sets its own iPad portrait viewport; run once");
  const { a, b } = await twoDishes(member.client);
  await page.setViewportSize({ width: 834, height: 1194 }); // iPad Pro 11, portrait

  const noSidewaysScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  await page.goto(`/cook?recipes=${a.id},${b.id}`);
  await hydrated(stage(page));
  await expect(stage(page).getByText("Chop the onions.", { exact: true })).toBeVisible();
  expect(await noSidewaysScroll()).toBe(true);
  await expect(stage(page).getByText(/^Screen (stays on|may sleep)$/)).toBeVisible();

  await view(page, "All steps").click();
  await expect(combined(page)).toHaveCount(5);
  const later = stage(page).getByRole("button", { name: `Move ${a.title} step 2 later` });
  const box = await later.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(await noSidewaysScroll()).toBe(true);

  // Upright (below 1024px) the dishes stack: B's column starts below A's.
  await view(page, "By dish").click();
  // Each step says where it sits in the combined order: A1 B1 A2 B2 A3.
  await expect(stage(page).getByText("5th of 5")).toBeVisible();
  await expect(stage(page).getByText("2nd of 5")).toBeVisible();
  const colA = await stage(page).getByRole("region", { name: a.title }).boundingBox();
  const colB = await stage(page).getByRole("region", { name: b.title }).boundingBox();
  expect(colB!.y).toBeGreaterThan(colA!.y);
  expect(await noSidewaysScroll()).toBe(true);

  // Turned on its side (1194 wide) the columns sit side by side.
  await page.setViewportSize({ width: 1194, height: 834 });
  const landA = await stage(page).getByRole("region", { name: a.title }).boundingBox();
  const landB = await stage(page).getByRole("region", { name: b.title }).boundingBox();
  expect(landB!.x).toBeGreaterThan(landA!.x);
  expect(Math.abs(landB!.y - landA!.y)).toBeLessThan(2);
  expect(await noSidewaysScroll()).toBe(true);
});

test("moving a step keeps keyboard focus on the same button", async ({ memberPage: page, member }) => {
  const { a } = await twoDishes(member.client);
  const b = await member.client.createRecipe({ title: `Tart ${unique("kb")}`, ingredients: [], steps: [{ text: "Roll out the pastry.", section: null }, { text: "Bake the tart.", section: null }] });

  await page.goto(`/cook?recipes=${a.id},${b.id}`);
  await hydrated(stage(page));
  await view(page, "All steps").click();
  // Order: A1 B1 A2 B2 A3. Enter on "later" moves A2 past B2; the button for A2 is the one still focused.
  const later = stage(page).getByRole("button", { name: `Move ${a.title} step 2 later` });
  await later.focus();
  await expect(later).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(combined(page)).toHaveText([/Chop the onions/, /Roll out the pastry/, /Bake the tart/, /Brown the mince/, /Simmer the sauce/]);
  await expect(stage(page).getByRole("button", { name: `Move ${a.title} step 2 later` })).toBeFocused();
  // And the other way: "earlier" puts it back, focus on its "earlier" button.
  const earlier = stage(page).getByRole("button", { name: `Move ${a.title} step 2 earlier` });
  await earlier.focus();
  await page.keyboard.press("Enter");
  await expect(combined(page)).toHaveText([/Chop the onions/, /Roll out the pastry/, /Brown the mince/, /Bake the tart/, /Simmer the sauce/]);
  await expect(stage(page).getByRole("button", { name: `Move ${a.title} step 2 earlier` })).toBeFocused();
});

test("the picker searches the box and keeps the dish you came from", async ({ memberPage: page, member }) => {
  const { word, a, b } = await twoDishes(member.client);
  const other = await member.client.createRecipe({ title: `Zzz ${unique("other")}`, ingredients: [], steps: [{ text: "Stir.", section: null }] });

  await page.goto(`/cook?recipes=${a.id}`);
  const search = page.getByRole("searchbox", { name: "Search recipes" });
  await hydrated(search);
  const card = (title: string) => page.getByRole("button", { name: new RegExp(`^${title}`) });
  await expect(page.getByText("Tap the dishes you want to cook together.")).toBeVisible();
  await expect(card(other.title)).toBeVisible();

  await search.fill(`Tart ${word}`);
  await expect(card(b.title)).toBeVisible();
  await expect(card(other.title)).toHaveCount(0);
  // The dish you came from stays on screen, chosen, though it does not match.
  await expect(card(a.title)).toHaveAttribute("aria-pressed", "true");

  await card(b.title).click();
  await page.getByRole("button", { name: "Start cooking" }).click();
  await expect(page).toHaveURL(new RegExp(`/cook\\?recipes=${a.id},${b.id}$`));
  await expect(stage(page).getByRole("list", { name: "Dishes" })).toContainText(b.title);
});

test("a session opened before loads offline, and another combination does not", async ({ memberPage: page, member, context }) => {
  const { a, b } = await twoDishes(member.client);
  const url = `/cook?recipes=${a.id},${b.id}`;

  await page.goto(url);
  await hydrated(stage(page));
  await page.evaluate(() => navigator.serviceWorker.ready);
  // One kept copy per session: the key carries the query. The first visit is kept too (OfflineSupport sends the query).
  await expect
    .poll(() =>
      page.evaluate(async (suffix) => (await (await caches.open("rb-pages")).keys()).some((r) => r.url.endsWith(suffix)), url),
    )
    .toBe(true);

  await context.setOffline(true);
  await context.route(
    (u) => u.hostname === "127.0.0.1" || u.hostname === "localhost",
    (route) => route.abort("internetdisconnected"),
  );
  await expect
    .poll(() => page.evaluate(() => fetch("/api/health", { cache: "no-store" }).then(() => "reached", () => "offline")))
    .toBe("offline");

  await page.goto(url);
  await expect(stage(page).getByRole("list", { name: "Dishes" })).toContainText(a.title);
  await expect(stage(page).getByRole("list", { name: "Dishes" })).toContainText(b.title);
  await expect(stage(page).getByText("Chop the onions.", { exact: true })).toBeVisible();

  // The same dishes in another order are another session, never kept: the offline page.
  await page.goto(`/cook?recipes=${b.id},${a.id}`);
  await expect(page.getByRole("heading", { name: "You’re offline", level: 1 })).toBeVisible();
});

test("without an AI provider there is no Plan the evening, and the API says it is not configured", async ({ memberPage: page, member }) => {
  const { a, b } = await twoDishes(member.client);
  await page.goto(`/cook?recipes=${a.id},${b.id}`);
  await hydrated(view(page, "One step"));
  await expect(stage(page).getByText("Chop the onions.", { exact: true })).toBeVisible();
  await expect(stage(page).getByRole("button", { name: "Plan the evening" })).toHaveCount(0);

  const res = await member.client.request.post("/api/cook/plan", { data: { recipeIds: [a.id, b.id] } });
  expect(res.status()).toBe(422);
  expect((await res.json()).error.code).toBe("ai_disabled");
});
