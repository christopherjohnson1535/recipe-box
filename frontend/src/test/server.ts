import { setupServer } from "msw/node";
import { handlers } from "./handlers";

/** One server for the whole suite; started in vitest.setup.ts. Override per test with `server.use(...)`. */
export const server = setupServer(...handlers);
