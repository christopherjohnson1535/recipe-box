import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, openSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { waitFor } from "./stack.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LOG_DIR = path.join(ROOT, "e2e/.stack");

export const BACKUP_API_PORT = Number(process.env.E2E_BACKUP_API_PORT ?? 8147);
const COMPOSE_FILE = path.join(ROOT, "docker-compose.backup-e2e.yml");

export type ScriptResult = { code: number; output: string };

/**
 * A throwaway Recipe Box (database + API + photo folder) that the backup scripts are pointed at.
 *  - compose (E2E_STACK=compose, what CI runs): docker-compose.backup-e2e.yml with real named volumes. The scripts run
 *    in their normal mode and stop and start the API themselves.
 *  - native (default): a throwaway database on local Postgres, a cargo-built API and a temp photo folder. The scripts
 *    run with BACKUP_MODE=direct; this class stops the API around a restore, as an operator without Docker would.
 */
export interface BackupStack {
  readonly apiUrl: string;
  /** Where backups are written (BACKUP_DIR for every script run). */
  readonly backupDir: string;
  /** Strings from the stack's configuration that must never end up inside a backup. */
  readonly secrets: string[];
  /** An empty, healthy stack. Destroys whatever the stack held, volumes included. */
  fresh(): Promise<void>;
  script(name: "backup" | "restore", args: string[], opts?: { input?: string; env?: Record<string, string> }): Promise<ScriptResult>;
  /** One value from the database. */
  sql(query: string): Promise<string>;
  stop(): Promise<void>;
}

export function createBackupStack(): BackupStack {
  return process.env.E2E_STACK === "compose" ? new ComposeStack() : new NativeStack();
}

function cleanEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const k of ["BACKUP_MODE", "BACKUP_DIR", "BACKUP_KEEP", "BACKUP_NAME", "DATABASE_URL", "MEDIA_DIR", "COMPOSE_FILE", "COMPOSE_PROJECT_NAME"]) delete env[k];
  return { ...env, ...extra };
}

function runScript(name: string, args: string[], env: NodeJS.ProcessEnv, input?: string): Promise<ScriptResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("sh", [`scripts/${name}.sh`, ...args], { cwd: ROOT, env, stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (d: Buffer) => (output += d.toString()));
    child.stderr.on("data", (d: Buffer) => (output += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? -1, output }));
    child.stdin.on("error", () => undefined); // a script that exits before reading its input (usage error) is not a failure here
    child.stdin.end(input ?? ""); // an empty input means "no answer" to the confirmation prompt
  });
}

class ComposeStack implements BackupStack {
  readonly apiUrl = `http://127.0.0.1:${BACKUP_API_PORT}`;
  readonly backupDir = mkdtempSync(path.join(tmpdir(), "rb-backups-"));
  readonly secrets = ["backup-e2e-db-secret-5b1f", "sk-ant-backup-e2e-key-9c2d"];
  private readonly env = { COMPOSE_FILE, BACKUP_E2E_API_PORT: String(BACKUP_API_PORT), BACKUP_MODE: "compose" };

  private compose(args: string[], stdio: "inherit" | "pipe" = "inherit") {
    return execFileSync("docker", ["compose", ...args], { cwd: ROOT, env: cleanEnv(this.env), stdio, encoding: "utf8" });
  }

  async fresh() {
    this.compose(["down", "--volumes", "--remove-orphans"]);
    this.compose(["up", "-d", "--build", "--wait", "--wait-timeout", "300"]);
  }

  script(name: "backup" | "restore", args: string[], opts: { input?: string; env?: Record<string, string> } = {}) {
    return runScript(name, args, cleanEnv({ ...this.env, BACKUP_DIR: this.backupDir, ...opts.env }), opts.input);
  }

  async sql(query: string) {
    return this.compose(["exec", "-T", "db", "psql", "-U", "recipes", "-d", "recipes", "-X", "-q", "-t", "-A", "-c", query], "pipe").trim();
  }

  async stop() {
    this.compose(["down", "--volumes", "--remove-orphans"]);
    rmSync(this.backupDir, { recursive: true, force: true });
  }
}

class NativeStack implements BackupStack {
  readonly apiUrl = `http://127.0.0.1:${BACKUP_API_PORT}`;
  readonly backupDir = mkdtempSync(path.join(tmpdir(), "rb-backups-"));
  private readonly admin = process.env.E2E_PG_ADMIN_URL ?? "postgres://recipes:recipes@127.0.0.1:5432/postgres";
  private readonly dbName = `recipes_backup_e2e_${process.pid}`;
  private readonly dbUrl = this.admin.replace(/\/[^/]*$/, `/${this.dbName}`);
  private readonly media = path.join(mkdtempSync(path.join(tmpdir(), "rb-media-")), "media");
  readonly secrets = [decodeURIComponent(new URL(this.admin).password)].filter((p) => p.length >= 8);
  private api: ChildProcess | undefined;

  private psql(url: string, query: string) {
    return execFileSync("psql", [url, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", query], { encoding: "utf8" }).trim();
  }

  private async startApi() {
    const bin = process.env.RB_API_BIN ?? path.join(ROOT, "backend/target/debug/recipe-box-api");
    mkdirSync(LOG_DIR, { recursive: true });
    const log = openSync(path.join(LOG_DIR, "backup-api.log"), "a");
    this.api = spawn(bin, [], {
      cwd: path.join(ROOT, "backend"),
      env: cleanEnv({
        DATABASE_URL: this.dbUrl,
        MEDIA_DIR: this.media,
        BIND_ADDR: `127.0.0.1:${BACKUP_API_PORT}`,
        AI_PROVIDER: "none",
        ANTHROPIC_API_KEY: "",
        COOKIE_SECURE: "false",
        RUST_LOG: "info",
      }),
      stdio: ["ignore", log, log],
    });
    await waitFor(`${this.apiUrl}/api/health`, "the API", 120_000, this.api);
  }

  private async stopApi() {
    const api = this.api;
    this.api = undefined;
    if (!api || api.exitCode !== null) return;
    const exited = new Promise<void>((r) => api.once("exit", () => r()));
    api.kill("SIGTERM");
    await exited;
  }

  async fresh() {
    await this.stopApi();
    this.psql(this.admin, `DROP DATABASE IF EXISTS ${this.dbName} WITH (FORCE)`);
    this.psql(this.admin, `CREATE DATABASE ${this.dbName}`);
    rmSync(this.media, { recursive: true, force: true });
    mkdirSync(this.media, { recursive: true });
    await this.startApi();
  }

  async script(name: "backup" | "restore", args: string[], opts: { input?: string; env?: Record<string, string> } = {}) {
    const env = cleanEnv({ BACKUP_MODE: "direct", DATABASE_URL: this.dbUrl, MEDIA_DIR: this.media, BACKUP_DIR: this.backupDir, ...opts.env });
    if (name === "backup") return runScript(name, args, env, opts.input);
    await this.stopApi(); // without Docker the script cannot stop the API; the operator does
    try {
      return await runScript(name, args, env, opts.input);
    } finally {
      await this.startApi();
    }
  }

  async sql(query: string) {
    return this.psql(this.dbUrl, query);
  }

  async stop() {
    await this.stopApi();
    this.psql(this.admin, `DROP DATABASE IF EXISTS ${this.dbName} WITH (FORCE)`);
    rmSync(this.backupDir, { recursive: true, force: true });
    rmSync(path.dirname(this.media), { recursive: true, force: true });
  }
}
