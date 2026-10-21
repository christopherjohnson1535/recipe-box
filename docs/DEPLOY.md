# Deploying Recipe Box

The same containers run everywhere. Pick a target; all of them use `docker-compose.yml` and a `.env` file.

| Target | Good for | HTTPS (needed for iPad install/offline/camera/wake lock) |
|---|---|---|
| A. Your PC / home server | Free; recipes stay at home | Tailscale (no domain) or Caddy + a domain + port forwarding |
| B. Small VPS (Hetzner, DigitalOcean, Lightsail…) | Reachable anywhere; ~$5/month | Caddy profile, automatic Let's Encrypt |
| C. Managed container host (Fly.io, Railway, Render, Azure Container Apps) | No server to patch | Provided by the host |

## Common steps
```sh
git clone https://github.com/christopherjohnson1535/recipe-box.git && cd recipe-box
cp .env.example .env
# edit .env: POSTGRES_PASSWORD (long random), and the target-specific values below
```
Build on the host (`docker compose up -d --build`) or use the images CI publishes to GHCR:
```sh
docker compose -f docker-compose.yml -f deploy/compose.prod.yml up -d
```
Images: `ghcr.io/christopherjohnson1535/recipe-box-api` and `…-web`, tags `latest` (main), `sha-<short>`, and
release versions. Both are built for amd64 and arm64 (Raspberry Pi 4/5 works).

## A. Home PC / server
1. Docker Desktop (Windows/macOS) or Docker Engine (Linux).
2. `.env`: `WEB_BIND=0.0.0.0` so the iPad can reach `http://<pc-ip>:3000`.
3. HTTPS without a domain — **Tailscale**: install Tailscale on the PC and the iPad, then on the PC run
   `tailscale serve --bg 3000`. Open the `https://<pc-name>.<tailnet>.ts.net` address on the iPad; set
   `COOKIE_SECURE=true`. Only your devices can reach it.
4. HTTPS with a domain: point a DNS name at your home IP, forward ports 80/443 to the PC, set `PUBLIC_HOSTNAME` and
   `COOKIE_SECURE=true`, then `docker compose --profile https up -d`.
5. Windows: the PC must stay on; set Docker Desktop to start on login.

## B. VPS
1. Create a small Linux VM (1 vCPU / 1–2 GB RAM is enough), install Docker Engine.
2. Point a DNS name (e.g. `recipes.example.com`) at the VM's IP. Open ports 80 and 443 only.
3. `.env`: `PUBLIC_HOSTNAME=recipes.example.com`, `COOKIE_SECURE=true`, `WEB_BIND=127.0.0.1`.
4. `docker compose -f docker-compose.yml -f deploy/compose.prod.yml --profile https up -d`.
5. Updates: `docker compose -f docker-compose.yml -f deploy/compose.prod.yml pull && … up -d`.

## C. Managed container hosts
Run three services from the same images: Postgres (use the host's managed Postgres if offered), `api` (env from
`.env.example`, a persistent volume at `/data/media`, internal only) and `web` (`API_INTERNAL_URL` = the api's
internal URL, public HTTPS port 3000). Set `COOKIE_SECURE=true`. Host-specific walkthroughs live in the wiki once
tested (issue: deploy guides).

## Backups
`sh scripts/backup.sh` writes `backups/<time>/db.dump` + `media.tar`; copy that folder off the machine.
`sh scripts/restore.sh backups/<time>` restores (asks for confirmation). Test a restore after setting up.

## Health
- `GET /api/health` through the web port → `{"status":"ok","db":"ok"}`.
- `docker compose ps` shows `healthy` for `db` and `api`.
- Logs: `docker compose logs -f api web`.
- End-to-end check: `SMOKE_USER=<you> SMOKE_PASSWORD=<pw> sh scripts/smoke.sh` logs in through the web port, uploads a
  small test image, restarts the stack and confirms the image survived (`SMOKE_RESTART=0` skips the restart). CI runs
  the same script on a fresh stack with `SMOKE_SETUP=1`. On Windows run it from Git Bash.
