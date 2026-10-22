import { execFileSync } from "node:child_process";
import { COMPOSE_FILE } from "../../support/env.ts";
import { ROOT } from "../../support/stack.ts";
import { expect, test, TEST_PNG } from "../../support/fixtures.ts";

// Port of scripts/smoke.sh's restart check. Runs only in the `compose` project (compose stack), after every other
// project, because it recreates the api and web containers. The database container stays up: its data is on tmpfs.
test("an uploaded image and its recipe survive recreating the api and web containers", async ({ member, anon }) => {
  const image = await member.client.uploadPng(TEST_PNG);
  const recipe = await member.client.createRecipe({ title: `Restart ${image.id}`, imageId: image.id });
  const before = await (await member.client.request.get(image.url)).body();
  expect(before.length).toBeGreaterThan(0);

  execFileSync("docker", ["compose", "-f", COMPOSE_FILE, "up", "-d", "--force-recreate", "--no-deps", "--wait", "--wait-timeout", "180", "api", "web"], {
    cwd: ROOT,
    stdio: "inherit",
  });

  await anon.login(member.user.username, member.password); // sessions live in the database
  const after = await (await anon.request.get(image.url)).body();
  expect(after.equals(before)).toBe(true);
  expect((await anon.getRecipe(recipe.id)).imageUrl).toBe(image.url);
});
