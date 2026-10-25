# Deploy on Fly.io (managed host)

No server to patch: Fly runs the published images, gives you HTTPS, and hosts Postgres. Three pieces:

| Piece | Fly | Public? |
|---|---|---|
| `recipe-box-web-<you>` | app from `deploy/fly/web.fly.toml` | yes, `https://recipe-box-web-<you>.fly.dev` |
| `recipe-box-api-<you>` | app from `deploy/fly/api.fly.toml`, 1 machine, a 1 GB volume for photos | no, only `recipe-box-api-<you>.internal:8080` |
| Postgres | Fly Managed Postgres cluster | no |

Fly is a paid service and Managed Postgres is billed separately; check Fly's pricing page before you start. Other
hosts (Azure Container Apps, Railway, Render) need the same settings, listed at the end.

## 1. Prepare
1. Install `flyctl` (fly.io/docs/flyctl/install) and run `fly auth login`.
2. Pick two app names (they are global): `recipe-box-api-<you>` and `recipe-box-web-<you>`. In `deploy/fly/api.fly.toml`
   set `app`; in `deploy/fly/web.fly.toml` set `app` and the host in `API_INTERNAL_URL`. Pick a region near you and set
   `primary_region` in both files.
3. The files pin `:v0.1.0`; use the newest release tag on the GitHub releases page.

## 2. API app, volume and database
```sh
fly apps create recipe-box-api-<you>
fly volumes create media --size 1 --region iad -a recipe-box-api-<you>
fly mpg create                      # asks for organisation, region, plan, volume size
fly mpg attach <cluster-id> -a recipe-box-api-<you>
```
`attach` stores the cluster's connection string as the app secret `DATABASE_URL`. Use the same region for the volume
and the cluster. Optional, for photo import: `fly secrets set AI_PROVIDER=anthropic ANTHROPIC_API_KEY=... -a recipe-box-api-<you>`
(and remove `AI_PROVIDER` from the toml's `[env]`).
```sh
fly deploy -c deploy/fly/api.fly.toml
```
The API runs as user 10001 and a new Fly volume belongs to root, so give the user the folder once:
```sh
fly ssh console -a recipe-box-api-<you> -C "chown 10001:10001 /data/media"
fly machine restart -a recipe-box-api-<you>
```
Check: `fly logs -a recipe-box-api-<you>` shows the API listening, migrations done, no permission errors; `fly checks list`
shows `health` passing.

## 3. Web app
```sh
fly apps create recipe-box-web-<you>
fly deploy -c deploy/fly/web.fly.toml
```
Fly prints `https://recipe-box-web-<you>.fly.dev`. Open it **right away** and create the admin account: the first
visitor to a new server becomes admin.

## 4. Check it
- `https://recipe-box-web-<you>.fly.dev/api/health` shows `"db":"ok"`.
- Sign in, add a recipe with a photo, then `fly machine restart -a recipe-box-api-<you>`: the photo is still there.
- `COOKIE_SECURE=true` is set on the api (the toml). The cookie check from [[Deploy-Tailscale]] must show `Secure`.
- Add to Home Screen on the iPad ([[Using on iPad]]). A custom domain: `fly certs add recipes.example.com -a recipe-box-web-<you>`.

## Upgrade and backups
Change the tag in both toml files and run both `fly deploy` commands. Take a backup first: the scripts in
[[Backup and Restore]] expect the Compose stack, so on Fly use the cluster's backups for the database and
`fly ssh sftp` / `fly ssh console` to copy `/data/media`.

## Settings any other host needs
- `DATABASE_URL` for the managed database; `MEDIA_DIR=/data/media` on a persistent volume the container user (10001)
  can write; one `api` instance only (photos live on that volume).
- `COOKIE_SECURE=true` on the `api`; `BIND_ADDR=[::]:8080` where the private network is IPv6 (Fly), else the default.
- `web`: public HTTPS to port 3000; `API_INTERNAL_URL` = the api's private URL. The `api` has no public address.
- Health checks: `GET /api/health` (api, 8080) and `GET /login` (web, 3000).

| Symptom | Cause and fix |
|---|---|
| Web shows "The Recipe Box server isn't responding" | `API_INTERNAL_URL` host wrong, or the api is not listening on IPv6 (`BIND_ADDR`). |
| Photo upload fails after deploy | Volume still owned by root: run the `chown` step above. |
| Api crash-loops with a database error | `fly secrets list -a recipe-box-api-<you>` should show `DATABASE_URL`; re-run `fly mpg attach`. |

_Not run from scratch by the issue author (no Fly account was available). Commands were checked against Fly's
documentation where it covers them; the `chown` step, `.internal` addressing and `fly.toml` keys come from Fly's
general behaviour and need a first real run. Please report any step that differs._
