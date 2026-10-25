# Deploying

Full guide: [`docs/DEPLOY.md`](https://github.com/christopherjohnson1535/recipe-box/blob/main/docs/DEPLOY.md).

| Option | Cost | HTTPS | Guide |
|---|---|---|---|
| Home PC / server | free | Tailscale (`tailscale serve --bg 3000`), or Caddy + a domain | [[Deploy-Tailscale]] |
| Small VPS | ~$5/mo | `docker compose --profile https up -d` with `PUBLIC_HOSTNAME` | [[Deploy-VPS-Caddy]] |
| Managed container host | varies | provided by the host | [[Deploy-Fly]] |

**Set `COOKIE_SECURE` to match the address you use:** `true` for every HTTPS setup above, `false` only for a plain
`http://` address on your own network. With `true`, opening the site over `http://` signs you out on every page.
Details and a check: `docs/DEPLOY.md`, "HTTPS and COOKIE_SECURE". On a public address, create the admin account
yourself before anyone else finds it.

Prebuilt images: `ghcr.io/christopherjohnson1535/recipe-box-api` and `recipe-box-web` (amd64 + arm64, public, no
login). Use them with `docker compose -f docker-compose.yml -f deploy/compose.prod.yml up -d`. Pin a release with
`IMAGE_TAG=v0.1.0` in `.env` (default `latest` = newest `main` build); a Raspberry Pi needs a 64-bit OS. Tags and the
release steps: `docs/DEPLOY.md`.

Why HTTPS matters: iPad Home Screen install, offline, the camera and keep-screen-awake only work on secure origins.

## Health
- http://localhost:3000/api/health (or your HTTPS address) should show `"db":"ok"`.
- `docker compose ps` shows `db`, `api` and `web` as **healthy**. Logs: `docker compose logs -f api web`.
- Full check: the Playwright suite in `e2e/` (`e2e/README.md`) runs against a throwaway test stack, not your live one;
  it covers sign-in, recipes, photos, link import and a restart. For your own stack, the health address above plus
  signing in and opening a recipe is the quick check.
