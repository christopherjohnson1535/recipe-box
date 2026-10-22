import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, openSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { API_PORT, BASE_URL, FIXTURE_HOST, FIXTURE_PORT, WEB_PORT } from "./env.ts";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const E2E_DIR = path.join(ROOT, "e2e");
export const FIXTURES_DIR = path.join(ROOT, "backend/tests/fixtures");
const LOG_DIR = path.join(E2E_DIR, ".stack");

export async function waitFor(url: string, what: string, ms = 180_000, proc?: ChildProcess) {
  const end = Date.now() + ms;
  let last = "";
  while (Date.now() < end) {
    if (proc && proc.exitCode !== null) throw new Error(`${what} exited with code ${proc.exitCode}; see ${LOG_DIR}`);
    try {
      const res = await fetch(url);
      if (res.ok) return;
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = String(e);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${what} did not become healthy at ${url} within ${ms / 1000}s (${last})`);
}

function run(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, log: string, wait: boolean) {
  mkdirSync(LOG_DIR, { recursive: true });
  const fd = openSync(path.join(LOG_DIR, log), "w");
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", fd, fd], detached: !wait });
  if (!wait) return child;
  return new Promise<ChildProcess>((resolve, reject) => {
    child.on("exit", (code) => (code === 0 ? resolve(child) : reject(new Error(`${cmd} ${args.join(" ")} failed (${code}); see ${LOG_DIR}/${log}`))));
  });
}

export type NativeStack = { stop: () => Promise<void> };

/**
 * Native mode: a throwaway database on the local Postgres, the API from backend/target (debug build, built on demand)
 * and the frontend from `next build` + `next start`. Needs Postgres (E2E_PG_ADMIN_URL), Rust and Node, no Docker.
 */
export async function startNativeStack(): Promise<NativeStack> {
  const pgAdmin = process.env.E2E_PG_ADMIN_URL ?? "postgres://recipes:recipes@127.0.0.1:5432/postgres";
  const dbName = `recipes_e2e_${process.pid}_${Date.now().toString(36)}`;
  const psql = (sql: string) => execFileSync("psql", [pgAdmin, "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: "pipe" });
  psql(`CREATE DATABASE ${dbName}`);
  const dbUrl = pgAdmin.replace(/\/[^/]*$/, `/${dbName}`);
  const media = path.join(LOG_DIR, `media-${dbName}`);
  rmSync(media, { recursive: true, force: true });

  const children: ChildProcess[] = [];
  const stop = async () => {
    for (const c of children) {
      try {
        if (c.pid) process.kill(-c.pid, "SIGTERM");
      } catch {
        /* already gone */
      }
    }
    await new Promise((r) => setTimeout(r, 500));
    try {
      psql(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    } catch (e) {
      console.warn(`could not drop ${dbName}: ${String(e)}`);
    }
    rmSync(media, { recursive: true, force: true });
  };

  try {
    const backend = path.join(ROOT, "backend");
    await run("cargo", ["build", "--bin", "recipe-box-api"], backend, {
        CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS ?? "3",
        // Password hashing (argon2) is ~100x slower unoptimised, which would dominate every login in the suite.
        CARGO_PROFILE_DEV_PACKAGE_argon2_OPT_LEVEL: "3",
        CARGO_PROFILE_DEV_PACKAGE_blake2_OPT_LEVEL: "3",
      }, "cargo-build.log", true);
    const bin = path.join(process.env.CARGO_TARGET_DIR ?? path.join(backend, "target"), "debug/recipe-box-api");
    const api = (await run(
      bin,
      [],
      backend,
      {
        DATABASE_URL: dbUrl,
        MEDIA_DIR: media,
        BIND_ADDR: `127.0.0.1:${API_PORT}`,
        AI_PROVIDER: "none",
        ANTHROPIC_API_KEY: "",
        COOKIE_SECURE: "false",
        IMPORT_ALLOW_HOST: `${FIXTURE_HOST}:${FIXTURE_PORT}`,
        RUST_LOG: "info",
      },
      "api.log",
      false,
    )) as ChildProcess;
    children.push(api);
    await waitFor(`http://127.0.0.1:${API_PORT}/api/health`, "the API", 120_000, api);

    const frontend = path.join(ROOT, "frontend");
    if (!existsSync(path.join(frontend, "node_modules"))) throw new Error("run `npm ci` in frontend/ first");
    const webEnv = { API_INTERNAL_URL: `http://127.0.0.1:${API_PORT}`, NEXT_TELEMETRY_DISABLED: "1" };
    await run("npm", ["run", "build"], frontend, webEnv, "web-build.log", true);
    const web = (await run("npx", ["next", "start", "-H", "127.0.0.1", "-p", String(WEB_PORT)], frontend, webEnv, "web.log", false)) as ChildProcess;
    children.push(web);
    await waitFor(`${BASE_URL}/api/health`, "the web server (and its proxy to the API)", 120_000, web);
  } catch (e) {
    await stop();
    throw e;
  }
  return { stop };
}
