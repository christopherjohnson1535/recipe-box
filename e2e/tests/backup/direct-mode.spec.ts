import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createBackupStack, type BackupStack } from "../../support/backup-stack.ts";
import { tarShimEnv } from "../../support/tar-shim.ts";

// The parts of backup and restore that only exist without Docker (BACKUP_MODE=direct, which the native stack uses) or
// need a stand-in for the host's tar. Skipped by the config when the stack is Compose. Own empty stack: no story needed.

test.describe.configure({ mode: "serial" });

let stack: BackupStack;
let backup: string;

test.beforeAll(async () => {
  stack = createBackupStack();
  await stack.fresh();
  const made = await stack.script("backup", [], { env: { BACKUP_NAME: "empty-household" } });
  expect(made.code, made.output).toBe(0);
  backup = path.join(stack.backupDir, "empty-household");
});

test.afterAll(async () => {
  await stack?.stop();
});

test("restore will not empty a folder that is not the photo folder", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "rb-notmedia-"));
  mkdirSync(path.join(home, "Documents"));
  writeFileSync(path.join(home, "Documents", "tax.pdf"), "precious");
  const cases: [string, number, string][] = [
    ["relative/photos", 2, "absolute"],
    ["/", 2, "must not be /"],
    ["//", 2, "must not be /"],
    [`${home}/../${path.basename(home)}`, 2, "parts"],
    [path.join(home, "missing"), 2, "not a folder"],
    [home, 3, "does not look like the photo folder"],
  ];
  for (const [dir, code, text] of cases) {
    const result = await stack.script("restore", [backup, "--yes", "--force"], { env: { MEDIA_DIR: dir } });
    expect(result.code, `${dir}: ${result.output}`).toBe(code);
    expect(result.output, dir).toContain(text);
  }
  expect(readFileSync(path.join(home, "Documents", "tax.pdf"), "utf8")).toBe("precious");
  rmSync(home, { recursive: true, force: true });
});

test("a photo that changes while it is archived is a warning, not a failure", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "rb-changed-"));
  const result = await stack.script("backup", [], { env: { ...tarShimEnv("changed"), BACKUP_DIR: dir, BACKUP_NAME: "busy" } });
  expect(result.code, result.output).toBe(0);
  expect(result.output).toContain("changed or was deleted while the photos were archived");
  expect(readdirSync(path.join(dir, "busy")).sort()).toEqual(["SHA256SUMS", "backup.info", "db.dump", "media.tar"]);
});

test("a backup whose photo archive cannot be read back is not kept", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "rb-readback-"));
  const result = await stack.script("backup", [], { env: { ...tarShimEnv("unreadable"), BACKUP_DIR: dir } });
  expect(result.code).toBe(1);
  expect(result.output).toContain("cannot be read back");
  expect(readdirSync(dir)).toEqual([]); // not even a half-written folder
});
