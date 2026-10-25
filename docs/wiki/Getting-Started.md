# Getting started

You need Docker (Docker Desktop on Windows or macOS).

```sh
git clone https://github.com/christopherjohnson1535/recipe-box.git
cd recipe-box
cp .env.example .env     # set POSTGRES_PASSWORD to something long and random
docker compose up -d --build
```

Open http://localhost:3000. The first visit asks you to create the **admin** account. Household members are added
by the admin in **Settings → Household**.

## Reaching it from an iPad on the same Wi‑Fi
Set `WEB_BIND=0.0.0.0` in `.env`, run `docker compose up -d`, and open `http://<your-computer's-IP>:3000`.
Recipes work, but installing to the Home Screen, offline use, the camera and keep-screen-awake need HTTPS —
see [[Deploying]] (Tailscale is the easiest way at home: [[Deploy-Tailscale]]). Keep `COOKIE_SECURE=false` while you use this plain `http://` address.

## Stopping and updating
- Stop: `docker compose down` (your recipes stay in Docker volumes)
- Update: `git pull && docker compose up -d --build`

## Checking everything works
`docker compose ps` should show `db`, `api` and `web` as **healthy**, and http://localhost:3000/api/health should say
`"db":"ok"`. For a full check (login, photo upload, restart) see the Health section of [[Deploying]].
