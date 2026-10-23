import { expect, hydrated, test, unique } from "../../support/fixtures.ts";

test("an admin adds a member who can sign in, then removes them", async ({ page, makeUser, admin }) => {
  const boss = await makeUser({ role: "admin" });
  const name = unique("n");
  const display = `New Cook ${name}`;
  const password = `pw-${unique()}`;

  await page.goto("/login");
  await hydrated(page.getByRole("button", { name: "Sign in" }));
  await page.getByLabel("Username").fill(boss.user.username);
  await page.getByLabel("Password").fill(boss.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/settings");
  await hydrated(page.getByRole("button", { name: "Add member" }));
  await page.getByLabel("Name", { exact: true }).fill(display);
  await page.getByLabel("Username").fill(name);
  await page.getByLabel("Temporary password").fill(password);
  await page.getByRole("button", { name: "Add member" }).click();
  const members = page.getByRole("list", { name: "Household members" });
  await expect(members.getByText(display)).toBeVisible();

  // the new member can sign in
  expect((await (await admin.request.get("/api/users")).json()).map((u: { username: string }) => u.username)).toContain(name);

  // remove them
  await page.getByRole("button", { name: `Remove ${display}`, exact: true }).click();
  await page.getByRole("button", { name: `Remove ${display}`, exact: true }).last().click();
  await expect(members.getByText(display)).toHaveCount(0);
  expect((await admin.listUsers()).map((u) => u.username)).not.toContain(name);
});
