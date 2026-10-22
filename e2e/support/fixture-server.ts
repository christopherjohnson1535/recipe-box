// Tiny HTTP server for link import: serves backend/tests/fixtures/*.html at /<name>.html and a PNG at /images/*.
// Standalone on purpose (node:* imports only, explicit .ts imports elsewhere): globalSetup starts it in-process and
// docker-compose.e2e.yml runs it with `node support/fixture-server.ts` (Node 22.18+ strips the types).
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";

// 2x2 red PNG
export const TEST_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP4z8AARAwQCgAf7gP9i18U1AAAAABJRU5ErkJggg==",
  "base64",
);

export function startFixtureServer(dir: string, port: number, host = "127.0.0.1"): Promise<Server> {
  const server = createServer((req, res) => {
    void (async () => {
      const name = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
      if (name.startsWith("/images/")) {
        res.writeHead(200, { "content-type": "image/png" }).end(TEST_PNG);
        return;
      }
      const m = /^\/([a-z0-9-]+\.html)$/.exec(name);
      try {
        if (!m?.[1]) throw new Error("not a fixture");
        const body = await readFile(path.join(dir, m[1]));
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(body);
      } catch {
        res.writeHead(404, { "content-type": "text/plain" }).end("not found");
      }
    })();
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(server));
  });
}

if (process.argv[1] && path.basename(process.argv[1]) === "fixture-server.ts") {
  const dir = process.env.FIXTURE_DIR ?? "/fixtures";
  const port = Number(process.env.FIXTURE_PORT ?? 4146);
  await startFixtureServer(dir, port, "0.0.0.0");
  console.log(`fixture site on :${port} serving ${dir}`);
}
