# Recipe Box

A household recipe website. Save recipes from **links** and **photos** (cookbook pages, handwritten cards,
screenshots — even a picture of the dish), find them by search and tags, and cook from an **iPad** with a
screen-stays-on cooking mode that also works offline.

> Status: **scaffold**. Accounts, recipe storage, photos and the container stack work; importers, cooking mode and
> the PWA are tracked as [issues](../../issues) by phase ([milestones](../../milestones)).

| | |
|---|---|
| Backend | Rust · axum · sqlx · Postgres — `backend/` |
| Frontend | Next.js 16 · React 19 · Tailwind — `frontend/` |
| Run | Docker Compose: `db`, `api`, `web` (+ optional `caddy` for HTTPS) |
| Docs | [Wiki](../../wiki) · [Requirements](docs/REQUIREMENTS.md) · [Spec](docs/SPEC.md) · [API](docs/API.md) · [Deploy](docs/DEPLOY.md) |

## Quick start
Needs Docker (Docker Desktop on Windows/macOS).
```sh
git clone https://github.com/christopherjohnson1535/recipe-box.git
cd recipe-box
cp .env.example .env          # set POSTGRES_PASSWORD at least
docker compose up -d --build
```
Open http://localhost:3000 — the first visit asks you to create the admin account. Add household members later in
Settings.

To use it from an iPad on your home network set `WEB_BIND=0.0.0.0` in `.env`. Installing it to the Home Screen,
offline use, the camera and keep-screen-awake need **HTTPS** — see [docs/DEPLOY.md](docs/DEPLOY.md).

## Photo import (optional AI)
Reading recipes from photos uses an AI vision model. Set `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` in `.env`.
Without it the app still works: a photo is saved next to an empty form to type in.

## Development
```sh
# API (needs a Postgres; DATABASE_URL in env)
cd backend && cargo run
# Web
cd frontend && npm install && API_INTERNAL_URL=http://localhost:8080 npm run dev
```
Checks, conventions and how work is picked up issue-by-issue: [CLAUDE.md](CLAUDE.md). The project is built with
the software factory process in [docs/FACTORY.md](docs/FACTORY.md).

## Backup
`sh scripts/backup.sh` → `backups/<time>/` · `sh scripts/restore.sh backups/<time>`

## Licence
MIT — see [LICENSE](LICENSE).
