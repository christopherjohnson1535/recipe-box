# Deploy at home with Tailscale

Recipe Box runs on your PC and the iPad reaches it over HTTPS through Tailscale. No domain, no open ports on your
router, and only devices signed in to your Tailscale account can connect.

You need: Docker on the PC ([[Getting Started]]), a free Tailscale account, and about 15 minutes.

## 1. Start Recipe Box
In the repo folder, edit `.env`:
```sh
POSTGRES_PASSWORD=<output of: openssl rand -hex 24>
COOKIE_SECURE=true
WEB_BIND=127.0.0.1
```
Then `docker compose up -d` (add `-f docker-compose.yml -f deploy/compose.prod.yml` to use the published images, and
`IMAGE_TAG=<release tag>` in `.env` to pin a release once one exists; the default `latest` is the newest build of `main`, see [Cutting a release](https://github.com/christopherjohnson1535/recipe-box/blob/main/docs/DEPLOY.md#cutting-a-release-owner)). Check `docker compose ps`: `db`, `api`, `web` healthy.

Use `openssl rand -hex 24` for the password: it goes into `DATABASE_URL` as-is, so symbols such as `@` or `/` would break it. Postgres fixes the password the first time the `pgdata` volume starts; changing it later in `.env` does not change it.

`WEB_BIND` stays `127.0.0.1` on purpose: Tailscale talks to the app from the same PC, and nothing else on your Wi-Fi
can then reach it without HTTPS.

## 2. Turn on HTTPS in Tailscale
1. Install Tailscale on the PC and on the iPad (App Store) and sign in to the same account on both.
2. Open the **DNS** page of the Tailscale admin console. Turn on **MagicDNS** if it is off.
3. Under **HTTPS Certificates**, choose **Enable HTTPS** and accept the notice: the names of your machines and your
   tailnet are published in public certificate transparency logs. Rename the PC in the admin console first if its
   name says something you would rather not publish.

## 3. Publish the app to your tailnet
On the PC:
```sh
tailscale serve --bg 3000
tailscale serve status
```
`--bg` keeps it running after you close the terminal and across reboots. The command prints your address,
`https://<pc-name>.<tailnet-name>.ts.net`. To stop sharing: `tailscale serve reset`.

## 4. Open it on the iPad
Make sure the Tailscale app shows **Connected**, open the address in **Safari**, create the admin account, then
Share → **Add to Home Screen** ([[Using on iPad]]).

## Check it
- `https://<pc-name>.<tailnet-name>.ts.net/api/health` shows `"db":"ok"`.
- The sign-in cookie is `Secure`: `curl -si -X POST https://<address>/api/auth/login -H 'content-type: application/json' -d '{"username":"you","password":"..."}' | grep -i set-cookie` prints an `rb_session` line like `HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=...`. It must contain `; Secure`.

## If something is off
| Symptom | Cause and fix |
|---|---|
| The address does not load on the iPad | Tailscale is off on the iPad, or the PC is asleep. |
| Browser warns about the certificate | **Enable HTTPS** (step 2) was skipped, or you used the short name (`https://pc`) instead of the full `.ts.net` name. |
| Sign in works, the next page asks again | `COOKIE_SECURE=true` but you opened a plain `http://` address (for example `http://<pc-ip>:3000`). Use the HTTPS address. Run `docker compose up -d` after any `.env` change. |
| You also want it on the home Wi-Fi without Tailscale | Not possible with `COOKIE_SECURE=true`; open it through Tailscale instead. |

Do not run `tailscale funnel` for this: it puts the site on the public internet. If you ever do, create the admin
account first, because the first visitor to a fresh server becomes admin.

_Not run on real hardware by the issue author: the commands come from Tailscale's documentation for `tailscale serve`
and HTTPS certificates. Tell us if any step differs on your machine._
