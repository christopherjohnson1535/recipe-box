# Deploy on a VPS with a domain (Caddy)

A small rented Linux server, a domain name, and Caddy fetching and renewing the Let's Encrypt certificate for you.
About $5 a month plus the domain.

## 1. Server and DNS
1. Create a VM with Ubuntu 24.04 (1 vCPU, 1-2 GB RAM). Add your SSH key.
2. In your domain's DNS, add an `A` record (and `AAAA` if the VM has IPv6) for `recipes.example.com` pointing at the
   VM. Wait until `dig +short recipes.example.com` shows the VM's address.
3. Firewall: allow only ports 22, 80 and 443 (the provider's firewall, or `ufw allow 22,80,443/tcp && ufw enable`).
   Port 80 must stay open: Let's Encrypt and the redirect to HTTPS use it.
4. Install Docker Engine from Docker's apt repository (docs.docker.com/engine/install/ubuntu).

## 2. Configure
```sh
git clone https://github.com/christopherjohnson1535/recipe-box.git && cd recipe-box
cp .env.example .env
```
Edit `.env`:
```sh
POSTGRES_PASSWORD=<output of: openssl rand -hex 24>
PUBLIC_HOSTNAME=recipes.example.com
COOKIE_SECURE=true
WEB_BIND=127.0.0.1
TRUST_PROXY_HEADERS=true
IMAGE_TAG=latest
```
Use `openssl rand -hex 24` for the password: it goes into `DATABASE_URL` as-is, so symbols such as `@` or `/` would break it. Postgres fixes the password the first time the `pgdata` volume starts; changing `POSTGRES_PASSWORD` later does not change it.

`IMAGE_TAG=latest` is the newest build of `main` and works today. Once a release exists, pin to a release tag such as `v0.1.0` so updates happen only when you choose (tag table and release steps: [Cutting a release](https://github.com/christopherjohnson1535/recipe-box/blob/main/docs/DEPLOY.md#cutting-a-release-owner)).

`PUBLIC_HOSTNAME` is required. Left empty, `docker compose --profile https up` stops with "PUBLIC_HOSTNAME is empty".
`TRUST_PROXY_HEADERS=true` is right here because Caddy's `reverse_proxy` adds the visitor's address to `X-Forwarded-For` and is the only way in (`WEB_BIND=127.0.0.1`); the web container passes on just that last entry, so each visitor is throttled by their own address and a forged `X-Forwarded-For` from a browser is ignored. Leave `TRUSTED_PROXIES` at its default (the private Docker network).
People behind one home or office NAT share a public IP, so they also share one address bucket.
`WEB_BIND=127.0.0.1` matters: Docker publishes ports around the host firewall, so a `0.0.0.0` web port would be open
to the internet without HTTPS.

## 3. Start
```sh
docker compose -f docker-compose.yml -f deploy/compose.prod.yml --profile https up -d
docker compose ps
docker compose logs caddy | tail
```
The log shows the certificate being obtained a few seconds after the first request. If it does not, the usual causes
are DNS not pointing at the VM yet, or port 80/443 blocked.

## 4. Claim the admin account
Open `https://recipes.example.com` straight away and create the admin account. The first visitor to a new server
becomes admin, so do this before you tell anyone the address.

Then on the iPad: Safari → the address → Share → **Add to Home Screen** ([[Using on iPad]]).

## Check it
- `curl -sI https://recipes.example.com | head -1` is `HTTP/2 200` (or a redirect to `/login`);
  `curl -sI http://recipes.example.com` redirects to `https://`.
- `https://recipes.example.com/api/health` shows `"db":"ok"`; the response has `strict-transport-security`.
- The `rb_session` `Set-Cookie` line contains `; Secure` (see the `curl ... | grep -i set-cookie` check in [[Deploy-Tailscale]]).

## Keep it healthy
- Update: set a newer `IMAGE_TAG`, then the same `pull` and `up -d` commands (take a backup first, [[Backup and Restore]]).
- Do not delete the `caddy_data` volume (`docker compose down -v` does): it holds the certificate, and Let's Encrypt
  limits how often you can request a new one.
- Home server with a domain instead of a VPS: same steps, plus forward ports 80 and 443 on the router to the PC. If
  your ISP blocks them or shares one address between customers, use [[Deploy-Tailscale]].

| Symptom | Cause and fix |
|---|---|
| Browser says the connection is not private | Certificate not issued yet; read `docker compose logs caddy`. |
| Sign in works, next page asks again | `COOKIE_SECURE` is `true` but you are on `http://`. Use the `https://` address. |
| Sign in shows no error but nothing changes after editing `.env` | Run `docker compose up -d` so `api` is recreated with the new value. |

_Not run on a real VPS by the issue author. The Compose setup was checked with `docker compose config`; follow the
steps and report anything that differs._
