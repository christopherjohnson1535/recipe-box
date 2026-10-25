import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, request, test } from "@playwright/test";
import { ApiClient } from "../../support/api-client.ts";
import { createBackupStack, type BackupStack } from "../../support/backup-stack.ts";
import { makePng } from "../../support/png.ts";
import { makeTar, type TarEntry } from "../../support/tar.ts";

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
  /** Every table: row count and a hash of its rows (sessions are left out of backups on purpose, so they are not compared). */
  tables: Record<string, string>;
  /** Columns, indexes and constraints: the shape of the schema. */
  schema: string;
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
    tables: await tableData(),
    schema: await schemaSignature(),
  };
}

const backupFolders = (dir: string) => readdirSync(dir).sort();

async function tableData(): Promise<Record<string, string>> {
  const names = (await stack.sql("select string_agg(tablename, ',' order by tablename) from pg_tables where schemaname = 'public'")).split(",");
  const tables: Record<string, string> = {};
  for (const name of names) {
    tables[name] =
      name === "sessions"
        ? "(not backed up)"
        : await stack.sql(`select count(*) || ':' || coalesce(md5(string_agg(x::text, E'\\n' order by x::text)), '') from public."${name}" x`);
  }
  return tables;
}

const schemaSignature = () =>
  stack.sql(`
    select string_agg(l, E'\\n' order by l) from (
      select 'column ' || table_name || '.' || column_name || ' ' || data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '') as l
        from information_schema.columns where table_schema = 'public'
      union all select 'index ' || indexdef from pg_indexes where schemaname = 'public'
      union all select 'constraint ' || conrelid::regclass::text || ' ' || conname || ' ' || pg_get_constraintdef(oid)
        from pg_constraint where connamespace = 'public'::regnamespace
    ) s`);

/** A copy of the backup with another photo archive and/or another SHA256SUMS (regenerated so it is valid unless told not to). */
function forge(opts: { tar?: Buffer; sums?: (lines: string[]) => string[] } = {}): string {
  const copy = mkdtempSync(path.join(tmpdir(), "rb-forged-"));
  cpSync(backup, copy, { recursive: true });
  if (opts.tar) writeFileSync(path.join(copy, "media.tar"), opts.tar);
  const lines = ["db.dump", "media.tar", "backup.info"].map((f) => `${sha256(readFileSync(path.join(copy, f)))}  ${f}`);
  writeFileSync(path.join(copy, "SHA256SUMS"), (opts.sums ? opts.sums(lines) : lines).join("\n") + "\n");
  return copy;
}

const preRestoreCount = () => backupFolders(stack.backupDir).filter((f) => f.startsWith("pre-restore-")).length;

async function signInAgain() {
  await owner.request.dispose();
  owner = await client();
  await owner.login(OWNER.username, OWNER.password);
}

/** The state a refused or failed restore must leave exactly as it was. */
async function expectUntouched() {
  expect(await tableData()).toEqual(original.tables);
  expect(await snapshot(owner)).toEqual(original);
}

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

  await stack.sql("update household_settings set updated_at = '2020-01-02T03:04:05Z'"); // the 0002 singleton, away from its default

  original = await snapshot(owner);
  expect(Object.keys(original.tables)).toEqual(expect.arrayContaining(["_sqlx_migrations", "household_settings", "images", "recipes", "users"]));
  expect(original.tables.household_settings).toMatch(/^1:/);
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

  // No secret from the stack's configuration, no password anyone typed, and no sign-in sessions. The database dump is
  // compressed, so it is searched as the plain SQL pg_restore prints (which does hold the accounts, proving the search
  // can find things); the other files are searched as they are.
  const secrets = [...stack.secrets, OWNER.password, GUEST.password];
  const sql = stack.dumpAsSql(path.join(backup, "db.dump"));
  expect(sql).toContain("$argon2");
  expect(sql).toContain("Crème brûlée");
  expect(sql).not.toContain("COPY public.sessions");
  for (const secret of secrets) expect(sql.includes(secret), "db.dump contains a secret").toBe(false);
  for (const file of ["media.tar", "backup.info", "SHA256SUMS"]) {
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

test("restoring the oldest backup under BACKUP_KEEP=1 does not prune it away", async () => {
  // The safety backup used to inherit BACKUP_KEEP and could delete the very backup being restored.
  const oldest = path.join(stack.backupDir, "20200101-000000");
  const others = ["20200102-000000", "20200103-000000"].map((n) => path.join(stack.backupDir, n));
  cpSync(backup, oldest, { recursive: true });
  for (const o of others) mkdirSync(o);

  const result = await stack.script("restore", [oldest, "--yes", "--force"], { env: { BACKUP_KEEP: "1" } });
  expect(result.code, result.output).toBe(0);
  expect(existsSync(path.join(oldest, "db.dump"))).toBe(true);
  for (const o of others) expect(existsSync(o)).toBe(true);
  for (const dir of [oldest, ...others]) rmSync(dir, { recursive: true, force: true });

  await signInAgain();
  await expectUntouched();
});

test("restoring an older backup removes what a newer release added, so the schema matches the backup exactly", async () => {
  const schema = await schemaSignature();
  const tables = await tableData();
  const migrations = await stack.sql("select max(version) from _sqlx_migrations");

  // As if the app had been upgraded after the backup: a table, a column, a migration row, a function.
  await stack.sql(
    `create table added_later (id int primary key, note text);
     insert into added_later values (1, 'from a newer release');
     alter table recipes add column added_later text;
     create function added_later_fn() returns int language sql as 'select 1';
     insert into _sqlx_migrations (version, description, success, checksum, execution_time) values (${Number(migrations) + 1}, 'added later', true, '\\x00', 0)`,
  );
  expect(await stack.sql("select to_regclass('public.added_later') is not null")).toBe("t");

  const result = await stack.script("restore", [backup, "--yes", "--force"]);
  expect(result.code, result.output).toBe(0);

  expect(await stack.sql("select coalesce(to_regclass('public.added_later')::text, 'gone')")).toBe("gone");
  expect(await stack.sql("select count(*) from pg_proc where proname = 'added_later_fn'")).toBe("0");
  expect(await stack.sql("select max(version) from _sqlx_migrations")).toBe(migrations);
  expect(await schemaSignature()).toBe(schema);
  expect(await tableData()).toEqual(tables);
  // Owned by the app's role, like a database the API set up itself.
  expect(await stack.sql("select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and pg_get_userbyid(c.relowner) <> current_user")).toBe("0");
  expect(await stack.sql("select pg_get_userbyid(nspowner) = current_user from pg_namespace where nspname = 'public'")).toBe("t");

  await signInAgain();
  await expectUntouched();
});

const NOT_PLAIN: [string, TarEntry[]][] = [
  ["an absolute path", [{ name: `/tmp/rb-escape-${process.pid}/pwned.txt`, data: "x" }]],
  ["a .. path", [{ name: "../rb-escape.txt", data: "x" }]],
  ["a .. path in the middle", [{ name: "a/../../rb-escape.txt", data: "x" }]],
  ["a symlink", [{ name: "link", type: "symlink", link: "/etc" }]],
  ["a hardlink", [{ name: "hard", type: "hardlink", link: "/etc/passwd" }]],
  ["a device", [{ name: "dev", type: "char" }]],
];

for (const [what, entries] of NOT_PLAIN) {
  test(`restore refuses a photo archive with ${what}, changing nothing`, async () => {
    const before = preRestoreCount();
    const photos = await stack.mediaListing();
    const evil = forge({ tar: makeTar([{ name: "fine.png", data: "x" }, ...entries]) });
    const result = await stack.script("restore", [evil, "--yes", "--force"]);
    expect(result.code, result.output).toBe(1);
    expect(result.output).toContain("unsafe");
    expect(result.output).toContain("Nothing was changed");
    expect(existsSync(`/tmp/rb-escape-${process.pid}`)).toBe(false);
    expect(await stack.mediaListing()).toEqual(photos); // nothing unpacked, nothing left behind
    expect(preRestoreCount()).toBe(before); // no safety backup either
    await expectUntouched();
  });
}

test("restore refuses a backup whose SHA256SUMS does not list every file", async () => {
  for (const left of ["db.dump", "media.tar", "backup.info"]) {
    const partial = forge({ sums: (lines) => lines.filter((l) => !l.endsWith(`  ${left}`)) });
    const result = await stack.script("restore", [partial, "--yes", "--force"]);
    expect(result.code, result.output).toBe(1);
    expect(result.output).toContain(`does not list ${left}`);
  }
  const empty = forge({ sums: () => [] });
  expect((await stack.script("restore", [empty, "--yes", "--force"])).code).toBe(1);
  await expectUntouched();
});

test("a photo archive that lists fine but cannot be unpacked stops before anything is replaced", async () => {
  // Checksums regenerated, so only unpacking can notice: a file where a folder has to be, and a name used twice.
  const broken: [string, TarEntry[]][] = [
    ["a file where a folder is needed", [{ name: "x", data: "1" }, { name: "x/y", data: "2" }]],
    ["the same name twice", [{ name: "same.png", data: "1" }, { name: "same.png", data: "2" }]],
  ];
  for (const [what, entries] of broken) {
    const before = preRestoreCount();
    const photos = await stack.mediaListing();
    const copy = forge({ tar: makeTar(entries) });
    const result = await stack.script("restore", [copy, "--yes", "--force"]);
    expect(result.code, `${what}: ${result.output}`).toBe(1);
    expect(result.output, what).toContain("nothing was changed");
    expect(await stack.mediaListing(), what).toEqual(photos);
    expect(preRestoreCount(), what).toBe(before);
    await expectUntouched(); // the database and every photo are as they were
  }
});

test("restore refuses a database dump that cannot be read, even with matching checksums", async () => {
  const copy = forge();
  const dump = readFileSync(path.join(copy, "db.dump"));
  writeFileSync(path.join(copy, "db.dump"), dump.subarray(0, Math.floor(dump.length / 2)));
  writeFileSync(
    path.join(copy, "SHA256SUMS"),
    ["db.dump", "media.tar", "backup.info"].map((f) => `${sha256(readFileSync(path.join(copy, f)))}  ${f}`).join("\n") + "\n",
  );
  const result = await stack.script("restore", [copy, "--yes", "--force"]);
  expect(result.code, result.output).toBe(1);
  await expectUntouched();
});

test("restored photos are readable by the API, whoever unpacked them", async () => {
  // A photo archive from a setup that wrote private files: restore sets explicit modes instead of keeping them (or the
  // operator's umask of 077, which would lock the API out when it runs as another user).
  const odd = forge({ tar: makeTar([{ name: "private-one.png", data: "1", mode: 0o600 }, { name: "private-two.png", data: "2", mode: 0o400 }]) });
  const result = await stack.script("restore", [odd, "--yes", "--force"]);
  expect(result.code, result.output).toBe(0);
  expect(await stack.mediaListing()).toEqual(["644 private-one.png", "644 private-two.png"]); // readable, swapped, no leftovers

  const back = await stack.script("restore", [backup, "--yes", "--force"]); // and back to the real thing
  expect(back.code, back.output).toBe(0);
  expect((await stack.mediaListing()).some((l) => l.includes(".restore"))).toBe(false);
  await signInAgain();
  await expectUntouched();
});

test("backup --stop-api makes a backup with the API stopped and starts it again", async () => {
  const result = await stack.script("backup", ["--stop-api"], { env: { BACKUP_NAME: "consistent" } });
  expect(result.code, result.output).toBe(0);
  expect(result.output).not.toContain("warning");
  const info = readFileSync(path.join(stack.backupDir, "consistent", "backup.info"), "utf8");
  expect(info).toContain("recipes=4");
  expect(info).toContain("photo_files=6");
  expect((await owner.health()).status()).toBe(200); // running again
});

test("BACKUP_NAME cannot look like a timestamp, which retention would prune", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "rb-name-"));
  const result = await stack.script("backup", [], { env: { BACKUP_DIR: dir, BACKUP_NAME: "20240101-120000" } });
  expect(result.code).toBe(2);
  expect(result.output).toContain("looks like a timestamp");
  expect(readdirSync(dir)).toEqual([]);
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
