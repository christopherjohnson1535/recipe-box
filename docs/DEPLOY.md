# Deploying Recipe Box

The same containers run everywhere. Pick a target; all of them use `docker-compose.yml` and a `.env` file.

| Target | Good for | HTTPS (needed for iPad install/offline/camera/wake lock) | Step-by-step |
|---|---|---|---|
| A. Your PC / home server | Free; recipes stay at home | Tailscale (no domain, private to your devices) or Caddy + a domain + port forwarding | [Tailscale](wiki/Deploy-Tailscale.md) |
| B. Small VPS (Hetzner, DigitalOcean, Lightsail…) | Reachable anywhere; ~$5/month | Caddy profile, automatic Let's Encrypt | [VPS + Caddy](wiki/Deploy-VPS-Caddy.md) |
| C. Managed container host (Fly.io; Azure Container Apps, Railway, Render work the same way) | No server to patch | Provided by the host | [Fly.io](wiki/Deploy-Fly.md) |

The three walkthroughs below are short versions of the wiki pages. Read [HTTPS and `COOKIE_SECURE`](#https-and-cookie_secure)
first: the setting must match how you reach the site.

## Common steps
```sh
git clone https://github.com/christopherjohnson1535/recipe-box.git && cd recipe-box
cp .env.example .env
# edit .env: POSTGRES_PASSWORD (`openssl rand -hex 24`: letters and digits only), and the target-specific values below
```
Build on the host (`docker compose up -d --build`) or use the images CI publishes to GHCR:
```sh
docker compose -f docker-compose.yml -f deploy/compose.prod.yml up -d
```
Images: `ghcr.io/christopherjohnson1535/recipe-box-api` and `…-web`, built for linux/amd64 and linux/arm64. Both
packages are public, so `docker pull` needs no login.

| Tag | Points at | Use it for |
|---|---|---|
| `v0.1.0` (also `0.1.0`), once a release exists | that release, never moves | a deployment you update on purpose (recommended once a release exists) |
| `0.1` | the newest `0.1.x` release | patch updates on `pull` |
| `latest` | the newest build of `main` | trying the newest work |
| `sha-<short>` | one `main` commit | rolling back to a specific build |

Choose the tag with `IMAGE_TAG` in `.env` (read by `deploy/compose.prod.yml`; default `latest`, which works before any release exists). Once a release is published, pin to it:
```sh
IMAGE_TAG=v0.1.0
```
To upgrade, change `IMAGE_TAG`, then `docker compose -f docker-compose.yml -f deploy/compose.prod.yml pull` and
`… up -d` (migrations run on API start; take a backup first, see below). To roll back, set the previous tag and run
the same two commands; a release whose migrations changed the schema needs a restore from that backup instead.

Raspberry Pi: use a 64-bit OS (Raspberry Pi OS 64-bit or Ubuntu arm64) on a Pi 4 or 5; Docker pulls the arm64 image
on its own. A 32-bit OS (armv7) has no image: build on the Pi with `docker compose up -d --build` instead.

## HTTPS and `COOKIE_SECURE`
`COOKIE_SECURE` (default `false`) decides whether the `rb_session` sign-in cookie carries the `Secure` flag. It does not
look at `X-Forwarded-Proto` or the address you typed, so set it to match how people reach the site. Two more settings
tell the sign-in throttle who is calling when a proxy sits in front (see "Proxy headers" below):

| How you open Recipe Box | `COOKIE_SECURE` | `WEB_BIND` | `TRUST_PROXY_HEADERS` |
|---|---|---|---|
| `http://localhost:3000` on the same machine, or `http://<pc-ip>:3000` on your Wi-Fi (no install, no offline) | `false` | `127.0.0.1` / `0.0.0.0` | `false` |
| `https://<pc>.<tailnet>.ts.net` (Tailscale serve) | `true` | `127.0.0.1` | `false` (see below) |
| `https://recipes.example.com` (Caddy profile) | `true` | `127.0.0.1` | `true` |
| Managed host (HTTPS from the host), e.g. Fly | `true`, on the `api` service | not used | `false` unless you have confirmed the host's header (see below); set `TRUSTED_PROXIES` on the `api` to the host's private network |

- `true` and then opening the plain `http://` address: the browser refuses to keep a `Secure` cookie from an
  insecure page, so sign-in appears to succeed and the next page asks you to sign in again. Use the HTTPS address, or
  set `false` for a LAN-only setup.
- `false` behind HTTPS: everything works, but the cookie can also travel over plain HTTP. Do not leave it that way on
  a public site.
- Check what your server sends (use your own address and a real account):
  `curl -si -X POST https://<your-address>/api/auth/login -H 'content-type: application/json' -d '{"username":"you","password":"…"}' | grep -i '^set-cookie'`
  The line looks like `rb_session=...; HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=...`. It must contain `; Secure` when
  `COOKIE_SECURE=true`, and not when it is `false`.
- The API refuses to start if `COOKIE_SECURE=true` is combined with `IMPORT_ALLOW_HOST` (a test-only setting). After
  a change to `.env`, run `docker compose up -d` again so the `api` container is recreated.

**Proxy headers (sign-in throttling, #33).** Wrong passwords are slowed per username and per client address. The API
uses the TCP peer as the address, and reads `X-Forwarded-For` only when the peer is in `TRUSTED_PROXIES`
(comma-separated IPs or CIDR networks; Compose defaults to the private Docker ranges, which only the `web` container
can reach; empty trusts none). The Compose default is `10.0.0.0/8,172.16.0.0/12,192.168.0.0/16` (also in
`.env.example`). A visitor whose own address is in those ranges (for example on your home LAN) is treated as a trusted
hop, so no address is counted for them and only the per-username throttle applies. From a trusted peer it walks the header from the right and takes the first address that
is not itself trusted. If the peer is trusted but no client can be told (no header, a garbled one, only trusted
hops), no address is counted and only the per-username throttle applies, so nobody can lock out the household by
sharing one proxy address.
- `TRUST_PROXY_HEADERS` (on `web`, default `false`): when `true`, the Next web container forwards only the right-most
  `X-Forwarded-For` entry (the one the proxy in front of it added) to the API and drops every other client-address
  header. Set it `true` only when a proxy you control always sets that header and nothing else can reach port 3000,
  so keep `WEB_BIND=127.0.0.1`: a client reaching port 3000 directly could otherwise choose its own address.
- `false` is always safe: the web container sends no address and only the per-username throttle applies.

**Claim the admin account first.** The first visit to a new server creates the admin account, for whoever gets
there first. On a public address (B, C) open it and finish setup yourself before you share the address or leave it
unattended.

## A. Home PC / server
1. Docker Desktop (Windows/macOS) or Docker Engine (Linux).
2. `.env`: `POSTGRES_PASSWORD` from `openssl rand -hex 24` (it goes into `DATABASE_URL` unescaped; Postgres fixes it on the first start of the `pgdata` volume), then `docker compose up -d` (or the prod file above).
   Browsing `http://localhost:3000` on the PC needs nothing else.
3. HTTPS without a domain, **Tailscale** (full page: [Deploy-Tailscale](wiki/Deploy-Tailscale.md)):
   - Install Tailscale on the PC and on the iPad and sign in to the same account.
   - Admin console → DNS: turn on **MagicDNS**, then under **HTTPS Certificates** choose **Enable HTTPS**. The names of
     your machines then appear in public certificate logs, so give the PC a name you do not mind being public.
   - `.env`: `COOKIE_SECURE=true`. Leave `WEB_BIND=127.0.0.1` (`tailscale serve` proxies to `127.0.0.1` only) and
     `TRUST_PROXY_HEADERS=false` (Tailscale's docs do not say it sets `X-Forwarded-For`).
     `docker compose up -d`.
   - On the PC: `tailscale serve --bg 3000`. It prints the `https://<pc-name>.<tailnet>.ts.net` address; open it on
     the iPad (Tailscale must be on there). `tailscale serve status` shows it; `tailscale serve reset` removes it.
   - Only devices in your tailnet can reach it. Do not use `tailscale funnel` unless you want the site public.
4. HTTPS with a domain from home: point a DNS name at your home IP, forward ports 80 and 443 to the PC, set
   `PUBLIC_HOSTNAME`, `COOKIE_SECURE=true`, `WEB_BIND=127.0.0.1`, then `docker compose --profile https up -d`.
   This fails if your ISP blocks 80/443 or shares one address between customers; use Tailscale then.
5. Windows: the PC must stay on; set Docker Desktop to start on login.

## B. VPS
Full page: [Deploy-VPS-Caddy](wiki/Deploy-VPS-Caddy.md).
1. Create a small Linux VM (1 vCPU / 1–2 GB RAM is enough), install Docker Engine.
2. Point a DNS name (e.g. `recipes.example.com`) at the VM's IP (an `A` record, plus `AAAA` for IPv6). Open ports 80
   and 443 only, plus 22 for SSH.
3. `.env`: `PUBLIC_HOSTNAME=recipes.example.com`, `COOKIE_SECURE=true`, `WEB_BIND=127.0.0.1`, `TRUST_PROXY_HEADERS=true`, and optionally `IMAGE_TAG=<release tag>` (default `latest`).
4. `docker compose -f docker-compose.yml -f deploy/compose.prod.yml --profile https up -d`.
5. `PUBLIC_HOSTNAME` must be set: Caddy has nothing to serve without it. With it empty, `docker compose --profile https up`
   stops with "PUBLIC_HOSTNAME is empty" (the `hostname-check` service).
   The certificate is issued on the first request, a few seconds after the DNS name resolves to the VM
   (`docker compose logs caddy`). Keep the `caddy_data` volume: it holds the certificate and account.
6. Open the address and create the admin account at once (see above).
7. Updates: set `IMAGE_TAG` to the new release (or just pull `latest`), then `docker compose -f docker-compose.yml -f deploy/compose.prod.yml pull && … up -d`.

Docker publishes a container port straight past `ufw`/`iptables` rules of the host firewall. That is why `WEB_BIND`
stays `127.0.0.1` here and the `db` and `api` services publish nothing: only Caddy listens on the internet.

## C. Managed container hosts
Run three things from the same images: Postgres (the host's managed Postgres), `api` (a persistent volume at
`/data/media`, private) and `web` (public HTTPS, `API_INTERNAL_URL` pointing at the api's private address). The API
has no public port. Set `COOKIE_SECURE=true` on the `api`, keep `TRUST_PROXY_HEADERS` off on the `web`, and set `TRUSTED_PROXIES` on the `api` to the host's private network. Walkthrough with ready-made config for **Fly.io**:
[Deploy-Fly](wiki/Deploy-Fly.md) and `deploy/fly/`. Other hosts need the same four settings:
- `DATABASE_URL` for the managed database, `MEDIA_DIR=/data/media` on a volume that user `10001` can write (the image
  runs as that user; a fresh volume is owned by root, so `chown 10001:10001 /data/media` once).
- `BIND_ADDR`: `0.0.0.0:8080` by default. Hosts whose private network is IPv6 (Fly) need `[::]:8080`.
- One `api` instance: photos live on that volume, which cannot be shared between instances.
- Health checks: `GET /api/health` on the api (port 8080) and `GET /login` on the web (port 3000).

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

## Google Tasks (optional)
Lets each member send the grocery list to their own Google Tasks (GRO-5). Without these settings the app runs as
usual and only that button is off. Everything below is free; no Google verification is needed for a household.

1. In the [Google Cloud console](https://console.cloud.google.com/) create a project (any name).
2. **APIs & Services > Library**: enable the **Google Tasks API**.
3. **OAuth consent screen** (shown as **Google Auth platform > Branding / Audience** in newer consoles): user type
   **External**, publishing status **Testing**. Fill in the app name and your email. Under **Audience > Test users** add
   the Google account of every household member who will use the export (up to 100). Only listed accounts can
   connect. Under **Data Access** adding the scope `https://www.googleapis.com/auth/tasks` is optional; the app asks for it.
4. **Credentials > Create credentials > OAuth client ID**, type **Web application**. Under **Authorised redirect URIs**
   add `<PUBLIC_URL>/api/integrations/google/callback`, for example
   `https://recipes.example.com/api/integrations/google/callback`. Google accepts `http://` only for `localhost`, so a
   real deployment needs HTTPS (it needs it for the iPad anyway, see above). Copy the client ID and secret.
5. Set four variables in `.env` (all four or none; the API refuses to start with only some of them and says which are
   missing) and restart the API:
   ```sh
   GOOGLE_CLIENT_ID=...apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=...
   PUBLIC_URL=https://recipes.example.com   # how people reach the site; no trailing slash
   TOKEN_ENCRYPTION_KEY=...   # the output of `openssl rand -base64 32` (exactly 32 bytes)
   ```
   `PUBLIC_URL` must match the redirect URI character for character (scheme, host and port). Keep
   `TOKEN_ENCRYPTION_KEY` safe like the database password: it seals each member's Google refresh token in the
   database, so a database backup alone does not hold usable tokens. Restoring onto a server with a different key (or
   changing the key) does not break anything else; it only means members connect Google again.
6. Each member opens the Google section of **Settings** and connects. Google warns that the app is unverified (it is
   in Testing); that is expected for a test user: **Continue**, then allow access to Google Tasks.

**Refresh tokens expire after 7 days in Testing.** Google's rule: a project with an External consent screen and
publishing status *Testing* is issued a refresh token that expires in 7 days
([Using OAuth 2.0 to Access Google APIs, "Refresh token expiration"](https://developers.google.com/identity/protocols/oauth2);
[Manage App Audience](https://support.google.com/cloud/answer/15549945): "Authorizations by a test user will expire
seven days from the time of consent"). So about a week after connecting, sending the list fails with *not connected*:
the API treats Google's `invalid_grant` answer as a lost connection, forgets the dead token and the app offers
to connect again; one click and a tap on Google's consent page fix it. Two ways to live with it:
- **Reconnect when asked** (about weekly). Nothing else is needed, and nothing is lost: the Groceries list in
  Google Tasks stays and is refilled on the next send.
- **Publish the app** (consent screen > **Publish app**, status *In production*). Tokens then stop expiring after 7 days.
  Because Google treats the Tasks scope as a sensitive scope (the consent screen's Data Access page labels it) and the app is not verified, Google keeps showing the "unverified app" warning
  at connect time and caps the number of accounts that may ever connect at 100 for the life of the project
  ([Manage App Audience](https://support.google.com/cloud/answer/15549945)); that is plenty for a household. Both
  routes follow Google's documentation; the automated tests use a local stand-in for Google, so neither has been
  tried against live Google.

**Disconnecting.** A member disconnects in the same Settings section: the API revokes the token at Google
and deletes it (and the remembered task list) from the database, even if Google could not be reached to revoke it. The
`Groceries` list in Google Tasks is left as it is; delete it in the Tasks app if you want it gone. A member can also
remove Recipe Box under *Google Account > Security > Third-party access*. Deleting a member in Recipe Box deletes
their connection too. To switch the feature off for everyone, empty the four variables and restart: stored tokens are
then unreadable and ignored.

## Backups
`sh scripts/backup.sh` and `sh scripts/restore.sh backups/<time>` (OPS-6). User-facing guide, with scheduling and
off-site copies: wiki page `docs/wiki/Backup-and-Restore.md`. Reference:

- **What a backup is.** A folder `backups/<UTC time>/` with `db.dump` (`pg_dump --format=custom`, no owners or grants),
  `media.tar`, `backup.info` (counts and versions, derived from the dump itself) and `SHA256SUMS`. Created with mode
  700/600. The folder is written under `.partial-*` and renamed on success; both files are read back in full first
  (`pg_restore -f /dev/null` on the dump, `tar -xOf` on the photos).
- **Consistency.** The dump is one snapshot; the photos are archived right after it, while the API runs. A photo
  uploaded in between is in the archive with no recipe (harmless); a photo deleted in between leaves a recipe whose
  image is missing. Photos are written once (temp file, then rename) and never modified, so archiving does not see torn
  files; GNU tar's exit 1 ("file changed as we read it" / file vanished) is tolerated with a warning, any other tar
  error fails the backup. `sh scripts/backup.sh --stop-api` stops the API for the duration (restarting it afterwards,
  also on failure) and is exactly consistent; use it before upgrades and moves. In `direct` mode it checks that nothing
  is connected instead (stop the API yourself).
- **No secrets.** The dump excludes the `sessions` table data (token hashes). `.env`, `POSTGRES_PASSWORD` and
  `ANTHROPIC_API_KEY` are never read. It does contain accounts with argon2 password hashes and all recipes: private,
  but not secret-free. The test suite greps every backup file for the stack's database password, API key and the
  users' passwords.
- **Settings** (environment, also for cron): `BACKUP_DIR` (default `backups`, relative to the repo folder),
  `BACKUP_KEEP` (default 14 timestamped backups; `0` = keep all; only `YYYYMMDD-HHMMSS` folders are pruned, after a
  successful run), `BACKUP_NAME` (explicit folder name, never pruned; a name that looks like a timestamp is refused), `BACKUP_MODE` (`compose`, the default, uses
  the `db` and `api` services of whatever `COMPOSE_FILE` selects, so the production override works too; `direct`
  uses `DATABASE_URL` + `MEDIA_DIR` and local `psql`/`pg_dump`/`pg_restore` 16+, for installs without Docker).
- **Restore safety.** In this order: verifies `SHA256SUMS` (which must list `db.dump`, `media.tar` and `backup.info`);
  rejects a photo archive with absolute or `..` member names or anything but regular files and directories (checked with
  `tar -tvf`); reads the whole dump (`pg_restore -f /dev/null`); exit 3 for a backup with a database version above the
  running one (newest row of `_sqlx_migrations`, compared with what the running API applied) or from a newer PostgreSQL
  major; exit 3 when the target holds any user, recipe or photo file unless `--force`; direct mode also checks
  `MEDIA_DIR` (absolute, not `/`, an existing folder with no sub-folders, else exit 2 or 3); asks for `yes` unless
  `--yes`. Then, before anything is replaced, unpacks the photos into `.restore-incoming` inside the photo folder (same
  filesystem, a full trial extraction that also checks the file count; modes set to 755/644, ownership copied from
  the photo folder when run as root); only then stops `api`, takes the `backups/pre-restore-<time>` safety backup
  (`BACKUP_KEEP=0`, so it never prunes, and after the stop so no write is lost), replaces the database, swaps the
  photos by renames (`.restore-old` holds the previous ones until the swap worked and is put back on failure), starts
  `api`, and compares users, recipes and photo files with the backup (exit 1 on a mismatch).
  The database step runs `DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION CURRENT_USER;` and the
  archive (rendered to SQL by `pg_restore -f`, in a temp file first) inside one `psql --single-transaction`, so the
  result is exactly the backup: tables a newer release added are gone, and a failure leaves the database untouched.
  The API migrates an older backup when it starts. The API is restarted even when the restore fails. A leftover
  `.restore-old` (a crash mid-swap) makes the next restore refuse until you look at it. Exit codes: 0 done, 1 failed or
  cancelled, 2 usage, 3 refused.
- **Scheduling** is cron / Task Scheduler on the host (examples in the wiki page). There is deliberately no backup
  container in the Compose file: it would need the Docker socket, which is root on the host, to do what one cron line
  does.
- **Fly.io and other managed hosts**: see `docs/wiki/Deploy-Fly.md`, "Upgrade and backups"; the Compose-based scripts do not apply there.
- **Tests.** `e2e/tests/backup/backup-restore.spec.ts` (Playwright, TypeScript) seeds a stack (accounts, recipes with
  several photos, a deleted recipe), runs the real scripts, wipes the stack's volumes, restores and asserts every
  recipe, every photo's bytes, search, tags and trash are identical, every table's rows and the schema's shape match
  (including the singleton settings table), an older backup removes tables added later, unsafe or unpackable photo
  archives and incomplete checksum files change nothing, plus the refusals above and retention. Direct-mode-only cases
  (`e2e/tests/backup/direct-mode.spec.ts`: `MEDIA_DIR` guard, tar warnings) run in the native run only. CI job
  `backup` runs it against `docker-compose.backup-e2e.yml` (`cd e2e && npm run test:backup:compose`); without Docker
  `npm run test:backup` runs the same file against local Postgres and a cargo-built API (`BACKUP_MODE=direct`).
  Not covered: restoring a backup made by a real older release image (the test fakes "a newer release" by adding
  objects after the backup); photo files changing mid-archive other than through a stand-in `tar`.
- The in-app zip export (ACC-5) is a different feature: portable recipes and photos, no accounts.

Admins can also download every recipe and photo as one zip from **Settings > Export and import**, and restore such a
zip there (it adds recipes; it does not replace the database). The zip is uploaded to a temporary file, so the largest
one accepted is `MAX_BACKUP_MB` (default 512); a reverse proxy in front of the web container must allow a request
that large (the bundled Caddy does). An import answers only when it has finished, and the web container waits about
five minutes for that (Node's default); a bigger archive still completes on the server, so check the recipe list
before trying again. Only one import runs at a time. This is a portable copy of your recipes, not a replacement for `backup.sh`:
it leaves out accounts and settings.

## Health
- `GET /api/health` through the web port → `{"status":"ok","db":"ok"}`.
- `docker compose ps` shows `healthy` for `db` and `api`.
- Logs: `docker compose logs -f api web`.
- End-to-end check: the Playwright suite in `e2e/` (see `e2e/README.md`) drives a throwaway stack from `docker-compose.e2e.yml`,
  including a restart that checks uploaded images survive. CI runs it on every pull request. For a live stack, the
  health check above plus signing in and opening a recipe is enough.
