# Recipe Box — web (Next.js)

The browser-facing app: Next.js 16 (App Router, React 19, TypeScript strict, Tailwind 4), built as a
`standalone` server. It talks to the Rust API in `../backend` — see `../docs/SPEC.md` and `../docs/API.md`.

## Run locally

```sh
npm install
API_INTERNAL_URL=http://localhost:8080 npm run dev   # http://localhost:3000
```

The API must be running (`cargo run` in `../backend`, or `docker compose up api db`). Without it, pages show a
“Can’t reach the Recipe Box server” message instead of crashing.

## Scripts

Node is pinned in `../.nvmrc` (22). From the repo root, `just check-frontend` runs lint, typecheck, tests and build.

| Script | What it does |
|---|---|
| `npm run dev` | dev server with hot reload |
| `npm run build` | production build (`.next/standalone`) |
| `npm start` | `next start` (local only; the container runs `node server.js`) |
| `npm run lint` | ESLint (`eslint-config-next`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (jsdom + Testing Library) |

## Environment

| Var | Default | Notes |
|---|---|---|
| `API_INTERNAL_URL` | `http://localhost:8080` in code, `http://api:8080` in the image | Where the web server reaches the API. Read **at request time**, so the same image runs on any host. |
| `PORT` / `HOSTNAME` | `3000` / `0.0.0.0` in the image | standard Next standalone vars |

## How `/api` and `/media` reach the API

The browser only talks to this origin, so the `rb_session` cookie just works. `src/app/api/[...path]/route.ts` and
`src/app/media/[...path]/route.ts` stream each request to `API_INTERNAL_URL` (`src/lib/forward.ts`): same method,
path, query, headers (cookie, content-type) and body; every `Set-Cookie` comes back unchanged. If the API is down
they answer `502 { "error": { "code": "api_unreachable" } }`.

We use route handlers rather than `next.config.ts` `rewrites` because rewrite destinations are baked in at build
time, which would tie an image to one API address.

Server Components call the API directly with `serverApi()` (`src/lib/server-api.ts`), forwarding the visitor’s
cookies. Client components use `api` from `src/lib/api.ts` (relative `/api/...`).

## Auth flow

- `src/proxy.ts` (Next 16’s middleware) sends visitors without an `rb_session` cookie to `/login?next=…`.
- The `(app)` layout confirms the session with `GET /api/auth/me`; a 401 goes to `/login`.
- `/login` and `/setup` check `GET /api/setup` and send each other the right way when `needsSetup` changes.

## Structure

```
src/
  app/
    (auth)/login, (auth)/setup     sign-in and first-run admin setup
    (app)/                          signed-in shell (header + nav)
      page.tsx                      recipe list: search, tag chips, cards
      recipes/[id]                  read view; edit/ cook/ and recipes/new are placeholders
      import/, settings/            placeholders for the LNK/PHO and ACC issues
    api/[...path], media/[...path]  runtime proxy to the API
    globals.css                     design tokens (light + dark) — retheme here
  components/ui/                    Button, Input, Field/Label, Card, Badge/Chip, EmptyState, PageHeader, Alert
  components/                       app-level pieces (header, recipe card, error states)
  lib/                              api client, proxy logic, helpers (+ *.test.ts)
  proxy.ts                          cookie gate
public/                             manifest.webmanifest, icons, apple-touch-icon
```

Pages compose `src/components/ui/*` plus layout utilities; colours, radii, fonts and spacing come from the CSS
variables in `globals.css`. Fonts are self-hosted via `@fontsource-variable` (Inter, Source Serif 4).

## Container

`Dockerfile`: `node:22-bookworm-slim` deps → build → standalone runner as the non-root `node` user on port 3000.
