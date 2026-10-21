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
