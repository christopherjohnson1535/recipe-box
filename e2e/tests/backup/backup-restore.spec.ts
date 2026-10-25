import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, request, test } from "@playwright/test";
import { ApiClient } from "../../support/api-client.ts";
import { createBackupStack, type BackupStack } from "../../support/backup-stack.ts";
import { makePng } from "../../support/png.ts";

// Issue #19 (OPS-6): scripts/backup.sh and scripts/restore.sh, proved end to end. One story, told in order against one
// throwaway stack: seed a household, back it up, wipe the stack, restore, and compare everything a person could see.

test.describe.configure({ mode: "serial" });

const OWNER = { username: "bea", displayName: "Bea", password: "bea-secret-password-41" };
const GUEST = { username: "cal", displayName: "Cal", password: "cal-secret-password-52" };

let stack: BackupStack;
let owner: ApiClient;
let stale: ApiClient; // owner's signed-in session from before the wipe
let original: Snapshot;
let backup: string; // the folder the first backup went to

/** Everything a person can see: each recipe in full, every photo's bytes, search, tags, and what is in the trash. */
type Snapshot = {
  recipes: unknown[];
  photos: Record<string, string>;
  search: string[];
  tags: unknown;
  trashed: string;
  counts: string;
};

const line = (text: string, section: string | null = null) => ({ text, section });
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

async function client(): Promise<ApiClient> {
  return new ApiClient(await request.newContext({ baseURL: stack.apiUrl }));
}

async function snapshot(c: ApiClient): Promise<Snapshot> {
  const list = await c.listRecipes({ limit: "200", sort: "title" });
  const recipes = await Promise.all(list.items.map((i) => c.getRecipe(i.id)));
  const urls = new Set<string>();
  for (const r of recipes) {
    for (const u of [r.imageUrl, r.imageDisplayUrl, ...r.photoUrls]) if (u) urls.add(u);
  }
  const photos: Record<string, string> = {};
  for (const u of [...urls].sort()) {
    const res = await c.request.get(u);
    expect(res.status(), u).toBe(200);
    photos[u] = sha256(await res.body());
  }
  const search = (await c.listRecipes({ q: "brulee" })).items.map((i) => i.id).sort();
  const tags = await (await c.request.get("/api/tags")).json();
  return {
    recipes,
    photos,
    search,
    tags,
    trashed: await stack.sql("select string_agg(id::text, ',' order by id) from recipes where deleted_at is not null"),
    counts: await stack.sql("select (select count(*) from users) || '/' || (select count(*) from recipes) || '/' || (select count(*) from images)"),
  };
}

const backupFolders = (dir: string) => readdirSync(dir).sort();

test.beforeAll(async () => {
  stack = createBackupStack();
  await stack.fresh();
});

test.afterAll(async () => {
  await owner?.request.dispose();
  await stack?.stop();
});

test("seed a household with recipes, photos and a deleted recipe", async () => {
  owner = await client();
  expect((await owner.setupRaw(OWNER)).ok()).toBe(true);
  await owner.login(OWNER.username, OWNER.password);
  await owner.createUser({ ...GUEST });

  const cover = await owner.uploadPng(makePng(1));
  const step = await owner.uploadPng(makePng(2));
  const side = await owner.uploadPng(makePng(3));
  const brulee = await owner.createRecipe({
    title: "Crème brûlée",
    description: "Burnt sugar & \"quotes\", a 'tricky' line",
    ingredients: [line("500 ml cream"), line("6 yolks", "Custard")],
    steps: [line("Warm the cream"), line("Bake in a water bath")],
    servings: "6",
    totalMinutes: 75,
    tags: ["dessert", "french"],
    notes: "Brulee the top just before serving.",
    imageId: cover.id,
    photoImageIds: [cover.id, step.id],
  });
  await owner.createRecipe({ title: "Plain toast", ingredients: [line("bread")], tags: ["breakfast"], imageId: side.id });
  await owner.createRecipe({ title: "Handwritten: Gran's soup", sourceType: "photo", sourceName: "Gran's card", notes: "No photo, text only" });
  const gone = await owner.createRecipe({ title: "Deleted before the backup" });
  await owner.deleteRecipe(gone.id);

  original = await snapshot(owner);
  expect(original.recipes).toHaveLength(3);
  expect(Object.keys(original.photos).length).toBeGreaterThanOrEqual(4); // originals and display renditions
  expect(new Set(Object.values(original.photos)).size).toBe(Object.keys(original.photos).length); // all different
  expect(original.search).toEqual([brulee.id]);
  expect(original.trashed).toBe(gone.id);
  expect(await stack.sql("select count(*) from sessions")).not.toBe("0");
});

test("backup writes the four files, readable only by the owner, with no secrets in them", async () => {
  const result = await stack.script("backup", []);
  expect(result.code, result.output).toBe(0);
  const folders = backupFolders(stack.backupDir);
  expect(folders).toHaveLength(1);
  backup = path.join(stack.backupDir, folders[0]!);
  expect(folders[0]).toMatch(/^\d{8}-\d{6}$/);
  expect(backupFolders(backup)).toEqual(["SHA256SUMS", "backup.info", "db.dump", "media.tar"]);

  // Private: nobody but the owner can read it (permissions are meaningful on Linux and macOS).
  expect(statSync(backup).mode & 0o077).toBe(0);
  expect(statSync(path.join(backup, "db.dump")).mode & 0o077).toBe(0);

  const info = Object.fromEntries(
    readFileSync(path.join(backup, "backup.info"), "utf8")
      .trim()
      .split("\n")
      .map((l) => l.split("=") as [string, string]),
  );
  expect(info).toMatchObject({ format: "1", users: "2", recipes: "4", images: "3", postgres_major: "16" });
  expect(info.schema_version).toBe(await stack.sql("select max(version) from _sqlx_migrations"));
  expect(Number(info.photo_files)).toBe(6); // three photos, each with a display rendition

  // No secret from the stack's configuration, no password anyone typed, and no sign-in sessions.
  const secrets = [...stack.secrets, OWNER.password, GUEST.password];
  for (const file of backupFolders(backup)) {
    const bytes = readFileSync(path.join(backup, file));
    for (const secret of secrets) expect(bytes.includes(secret), `${file} contains a secret`).toBe(false);
  }
});

test("restore asks first and changes nothing when the answer is not yes", async () => {
  stale = owner;
  await stack.fresh();
  const result = await stack.script("restore", [backup], { input: "no\n" });
  expect(result.code).toBe(1);
  expect(result.output).toContain("Type yes to continue");
  expect(result.output).toContain("cancelled");
  expect(await stack.sql("select count(*) from users")).toBe("0");

  const silent = await stack.script("restore", [backup]); // no answer at all (closed input), as under cron
  expect(silent.code).toBe(1);
  expect(await stack.sql("select count(*) from users")).toBe("0");
});

test("restore refuses a backup that was changed or is incomplete", async () => {
  const damaged = mkdtempSync(path.join(tmpdir(), "rb-damaged-"));
  cpSync(backup, damaged, { recursive: true });
  const tar = path.join(damaged, "media.tar");
  const bytes = readFileSync(tar);
  bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 0xff;
  bytes[100] = bytes[100]! ^ 0xff;
  writeFileSync(tar, bytes);
  const result = await stack.script("restore", [damaged, "--yes"]);
  expect(result.code).toBe(1);
  expect(result.output).toContain("SHA256SUMS");
  expect(await stack.sql("select count(*) from users")).toBe("0");

  const incomplete = mkdtempSync(path.join(tmpdir(), "rb-incomplete-"));
  mkdirSync(path.join(incomplete, "x"));
  const missing = await stack.script("restore", [incomplete, "--yes"]);
  expect(missing.code).toBe(1);
  expect(missing.output).toContain("not a complete backup");

  expect((await stack.script("restore", [])).code).toBe(2);
  expect((await stack.script("restore", [backup, "--nope"])).code).toBe(2);
});

test("backup, wipe, restore: recipes, photos, accounts and search come back exactly", async () => {
  const result = await stack.script("restore", [backup], { input: "yes\n" });
  expect(result.code, result.output).toBe(0);
  expect(result.output).toContain("Restored: 4 recipes, 2 accounts, 6 photo files");

  // Sessions are not in the backup: the old cookie is dead, and people sign in again with the same passwords.
  expect((await stale.me()).status()).toBe(401);
  await stale.request.dispose();
  owner = await client();
  await owner.login(OWNER.username, OWNER.password);
  const guest = await client();
  await guest.login(GUEST.username, GUEST.password);
  await guest.request.dispose();

  expect(await snapshot(owner)).toEqual(original);
  expect(await stack.sql("select count(*) from sessions")).toBe("2"); // only the two just made

  // And it is a working Recipe Box, not a copy: new data and new photos can be added.
  const fresh = await owner.uploadPng(makePng(9));
  const added = await owner.createRecipe({ title: "Added after the restore", imageId: fresh.id });
  expect((await owner.getRecipe(added.id)).title).toBe("Added after the restore");
  await owner.deleteRecipe(added.id);
});

test("restore will not replace data that is already there unless told to", async () => {
  const extra = await owner.createRecipe({ title: "Made after the backup" });
  const before = await stack.sql("select count(*) from recipes");

  const refused = await stack.script("restore", [backup, "--yes"]);
  expect(refused.code).toBe(3);
  expect(refused.output).toContain("already has data");
  expect(refused.output).toContain("--force");
  expect(await stack.sql("select count(*) from recipes")).toBe(before);
  expect((await owner.getRecipe(extra.id)).title).toBe("Made after the backup");
});

test("--force replaces everything and keeps a safety backup of what it replaced", async () => {
  const result = await stack.script("restore", [backup, "--yes", "--force"]);
  expect(result.code, result.output).toBe(0);

  const safety = backupFolders(stack.backupDir).filter((f) => f.startsWith("pre-restore-"));
  expect(safety).toHaveLength(1);
  const safetyInfo = readFileSync(path.join(stack.backupDir, safety[0]!, "backup.info"), "utf8");
  expect(safetyInfo).toContain("recipes=6"); // the 4 restored + "Made after the backup" + the one deleted after the restore

  owner = await client();
  await owner.login(OWNER.username, OWNER.password);
  expect(await snapshot(owner)).toEqual(original); // the extra recipe is gone, the originals are as backed up
  expect((await owner.listRecipes({ q: "Made after the backup" })).total).toBe(0);
});

test("a backup from a newer Recipe Box is refused with a clear message", async () => {
  await stack.sql(
    "insert into _sqlx_migrations (version, description, success, checksum, execution_time) values (99999999999999, 'from the future', true, '\\x00', 0)",
  );
  const made = await stack.script("backup", [], { env: { BACKUP_NAME: "from-the-future" } });
  expect(made.code, made.output).toBe(0);
  await stack.sql("delete from _sqlx_migrations where version = 99999999999999");

  const result = await stack.script("restore", [path.join(stack.backupDir, "from-the-future"), "--yes", "--force"]);
  expect(result.code).toBe(3);
  expect(result.output).toContain("newer Recipe Box");
  expect(result.output).toContain("Nothing was changed");
  expect(await snapshot(owner)).toEqual(original);
});

test("retention removes the oldest timestamped backups and nothing else", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "rb-retention-"));
  const old = ["20200101-000000", "20200102-000000", "20200103-000000"];
  const keepers = ["pre-restore-20200101-000000", "from-the-future", "notes"];
  for (const name of [...old, ...keepers]) mkdirSync(path.join(dir, name));

  const bad = await stack.script("backup", [], { env: { BACKUP_DIR: dir, BACKUP_KEEP: "lots" } });
  expect(bad.code).toBe(2);
  expect(backupFolders(dir)).toHaveLength(6);

  const result = await stack.script("backup", [], { env: { BACKUP_DIR: dir, BACKUP_KEEP: "2" } });
  expect(result.code, result.output).toBe(0);
  const left = backupFolders(dir);
  expect(left).toEqual(expect.arrayContaining(["20200103-000000", ...keepers]));
  expect(left).not.toContain("20200101-000000");
  expect(left).not.toContain("20200102-000000");
  expect(left.filter((f) => /^\d{8}-\d{6}$/.test(f))).toHaveLength(2);
  expect(left.some((f) => f.startsWith(".partial"))).toBe(false);

  // A failed backup leaves nothing behind: a name that already exists is refused before anything is written.
  const again = await stack.script("backup", [], { env: { BACKUP_DIR: dir, BACKUP_NAME: "notes" } });
  expect(again.code).toBe(1);
  expect(existsSync(path.join(dir, ".partial-notes"))).toBe(false);
});
