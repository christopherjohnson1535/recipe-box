import { expect, test, unique } from "../../support/fixtures.ts";

test("an admin adds and removes a member; members cannot manage users", async ({ admin, anon, member }) => {
  const password = `pw-${unique()}`;
  const name = unique("m");
  const added = await admin.createUser({ username: name, displayName: "Temp Member", password });
  expect(added).toMatchObject({ username: name, role: "member" });
  expect((await admin.listUsers()).map((u) => u.username)).toContain(name);

  // duplicate username
  const dup = await admin.request.post("/api/users", { data: { username: name, displayName: "Again", password, role: "member" } });
  expect(dup.status()).toBe(409);

  // a member is refused on admin routes
  expect((await member.client.request.get("/api/users")).status()).toBe(403);
  expect((await member.client.request.get("/api/export")).status()).toBe(403);

  await admin.deleteUser(added.id);
  expect((await admin.listUsers()).map((u) => u.username)).not.toContain(name);
  expect((await anon.loginRaw(name, password)).status()).toBe(401);
});

test("an admin cannot remove themselves", async ({ admin }) => {
  const me = await (await admin.me()).json();
  const res = await admin.request.delete(`/api/users/${me.id}`);
  expect(res.status()).toBe(403);
});
