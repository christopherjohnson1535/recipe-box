/** Where the stack under test lives. Fixed ports so the config (read by every worker) and globalSetup agree. */
export const STACK: "native" | "compose" = process.env.E2E_STACK === "compose" ? "compose" : "native";

export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3146);
export const API_PORT = Number(process.env.E2E_API_PORT ?? 8146);
export const FIXTURE_PORT = Number(process.env.E2E_FIXTURE_PORT ?? 4146);

export const BASE_URL = `http://127.0.0.1:${WEB_PORT}`;

/** The host:port the API is told it may fetch (IMPORT_ALLOW_HOST), and the origin tests put in import URLs. */
export const FIXTURE_HOST = STACK === "compose" ? "fixture" : "127.0.0.1";
export const FIXTURE_ORIGIN = `http://${FIXTURE_HOST}:${FIXTURE_PORT}`;

export const COMPOSE_FILE = "docker-compose.e2e.yml";

/** The first admin, created once in globalSetup. Tests create their own members and never change this account. */
export const ADMIN = { username: "e2e-admin", displayName: "E2E Admin", password: "e2e-admin-password" } as const;
