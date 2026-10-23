# Deploying

Full guide: [`docs/DEPLOY.md`](https://github.com/christopherjohnson1535/recipe-box/blob/main/docs/DEPLOY.md).

| Option | Cost | HTTPS |
|---|---|---|
| Home PC / server | free | Tailscale (`tailscale serve --bg 3000`) or Caddy + domain |
| Small VPS | ~$5/mo | `docker compose --profile https up -d` with `PUBLIC_HOSTNAME` |
| Managed container host | varies | provided by the host |

Prebuilt images: `ghcr.io/christopherjohnson1535/recipe-box-api` and `recipe-box-web` (amd64 + arm64).
Use them with `docker compose -f docker-compose.yml -f deploy/compose.prod.yml up -d`.

Why HTTPS matters: iPad Home Screen install, offline, the camera and keep-screen-awake only work on secure origins.

## Health
- http://localhost:3000/api/health (or your HTTPS address) should show `"db":"ok"`.
- `docker compose ps` shows `db`, `api` and `web` as **healthy**. Logs: `docker compose logs -f api web`.
- Full check: the Playwright suite in `e2e/` (`e2e/README.md`) runs against a throwaway test stack, not your live one;
  it covers sign-in, recipes, photos, link import and a restart. For your own stack, the health address above plus
  signing in and opening a recipe is the quick check.
