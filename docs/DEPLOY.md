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
Images: `ghcr.io/christopherjohnson1535/recipe-box-api` and `…-web`, built for linux/amd64 and linux/arm64. Both
packages are public, so `docker pull` needs no login.

| Tag | Points at | Use it for |
|---|---|---|
| `v0.1.0` (also `0.1.0`) | that release, never moves | a deployment you update on purpose (recommended) |
| `0.1` | the newest `0.1.x` release | patch updates on `pull` |
| `latest` | the newest build of `main` | trying the newest work |
| `sha-<short>` | one `main` commit | rolling back to a specific build |

Choose the tag with `IMAGE_TAG` in `.env` (read by `deploy/compose.prod.yml`; default `latest`):
```sh
IMAGE_TAG=v0.1.0
```
To upgrade, change `IMAGE_TAG`, then `docker compose -f docker-compose.yml -f deploy/compose.prod.yml pull` and
`… up -d` (migrations run on API start; take a backup first, see below). To roll back, set the previous tag and run
the same two commands; a release whose migrations changed the schema needs a restore from that backup instead.

Raspberry Pi: use a 64-bit OS (Raspberry Pi OS 64-bit or Ubuntu arm64) on a Pi 4 or 5; Docker pulls the arm64 image
on its own. A 32-bit OS (armv7) has no image: build on the Pi with `docker compose up -d --build` instead.

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
5. Updates: set `IMAGE_TAG` to the new release, then `docker compose -f docker-compose.yml -f deploy/compose.prod.yml pull && … up -d`.

## C. Managed container hosts
Run three services from the same images: Postgres (use the host's managed Postgres if offered), `api` (env from
`.env.example`, a persistent volume at `/data/media`, internal only) and `web` (`API_INTERNAL_URL` = the api's
internal URL, public HTTPS port 3000). Set `COOKIE_SECURE=true`. Host-specific walkthroughs live in the wiki once
tested (issue: deploy guides).

## Cutting a release (owner)
Releases are tags `vMAJOR.MINOR.PATCH` on `main`. Pushing one runs CI, which publishes the images and the GitHub release.

One-time setup, before the first tag: GitHub → your profile → Packages → `recipe-box-api` → Package settings →
Change visibility → Public; the same for `recipe-box-web`. (The packages exist after the first green `main` run.)
Until then the release job's anonymous pull fails and no release is created.

1. Move the `[Unreleased]` entries in `CHANGELOG.md` under a new `## [0.1.0] - <date>` heading, add the compare
   link at the bottom, and merge that PR.
2. Tag the merge commit and push the tag:
   ```sh
   git switch main && git pull
   git tag v0.1.0 && git push --tags
   ```
3. Watch the CI run for the tag. After the usual checks and e2e pass, `images` pushes `v0.1.0`, `0.1.0` and `0.1` for
   both platforms and checks the manifest lists amd64 and arm64; `release` then pulls each image without logging in,
   on both platforms, and creates the GitHub release with notes generated from merged PR labels
   (`.github/release.yml`).
4. Check by hand once (any machine, logged out of ghcr.io):
   `docker buildx imagetools inspect ghcr.io/christopherjohnson1535/recipe-box-api:v0.1.0` lists `linux/amd64` and
   `linux/arm64`; on the Pi, `docker pull ghcr.io/christopherjohnson1535/recipe-box-api:v0.1.0` works.

The `images` job pushes before the `release` job runs, so a run that fails at `release` (for example because the
packages are still private) leaves the images for that tag published but no GitHub release. Fix the cause and re-run
the failed job; `release` skips creating a release that already exists. `release` also fails if the tagged commit is
not on `main`. If the problem is in the code, do not move the tag once its images are published: that breaks the
"never moves" promise in the tag table above for anyone who pulled it. Tag `v0.1.1` instead. Moving a tag
(`git tag -f ... && git push -f origin <tag>`) is only acceptable when no image was published for it.

## Sign-in throttling and proxies
Wrong passwords are slowed down on sign-in and on "change my password": 5 wrong attempts per username (a name that
does not exist counts too) or 20 per client address lock that name or address for 30 seconds, doubling with each
further wrong attempt up to 15 minutes; a correct password starts the name over. Counts live in the API's memory, so
a restart clears them.

"Client address" needs care behind proxies, because a browser can send any `X-Forwarded-For` it likes:
- The API believes `X-Forwarded-For` only from peers in `TRUSTED_PROXIES` (default in compose: the private Docker
  networks, where only the web container can connect; empty when you run the API yourself). It takes the right-most
  address that is not itself a trusted proxy.
- The web container passes on a client address only when `TRUST_PROXY_HEADERS=true`, and then takes the right-most
  `X-Forwarded-For` entry, which is the one your proxy added. Set it to `true` for the `https` profile (Caddy
  overwrites the header with the real client) or any proxy that does the same; keep it `false` when port 3000 is
  reached directly. Never turn it on if clients can bypass the proxy.
- With it `false` the API cannot tell visitors apart (they all arrive from the web container, a trusted proxy), so it
  applies no per-address limit at all and relies on the per-username limit, which protects each account. Nobody can
  lock everyone else out by guessing. The same holds for LAN clients behind a proxy that sends no usable
  `X-Forwarded-For`. If the peer is not in `TRUSTED_PROXIES`, it is the client and is limited as one address.
- **Warning:** with `TRUST_PROXY_HEADERS=true`, the web container believes the right-most `X-Forwarded-For` entry,
  so anyone who can reach port 3000 directly can pick their own address and so dodge, or aim, the per-address limit.
  With the `https` profile keep `WEB_BIND=127.0.0.1` (Caddy reaches the web container over the Docker network) and
  do not publish port 3000 elsewhere. The software cannot check this for you.

## Backups
`sh scripts/backup.sh` writes `backups/<time>/db.dump` + `media.tar`; copy that folder off the machine.
`sh scripts/restore.sh backups/<time>` restores (asks for confirmation). Test a restore after setting up.

## Health
- `GET /api/health` through the web port → `{"status":"ok","db":"ok"}`.
- `docker compose ps` shows `healthy` for `db` and `api`.
- Logs: `docker compose logs -f api web`.
- End-to-end check: the Playwright suite in `e2e/` (see `e2e/README.md`) drives a throwaway stack from `docker-compose.e2e.yml`,
  including a restart that checks uploaded images survive. CI runs it on every pull request. For a live stack, the
  health check above plus signing in and opening a recipe is enough.
