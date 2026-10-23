# Recipe Box task runner (https://just.systems). `just` lists the recipes; `just check` runs the lint, type, format and test checks plus the audits (see `check`).
# Works on Linux, macOS and Windows via Git Bash. Toolchains: rust-toolchain.toml (Rust), .nvmrc (Node).

set windows-shell := ["bash", "-cu"]

# Backend integration tests need Postgres; override by exporting TEST_DATABASE_URL. See `just db`.
export TEST_DATABASE_URL := env('TEST_DATABASE_URL', 'postgres://recipes:recipes@127.0.0.1:5432/recipes_test')

# List the recipes
default:
    @just --list

# One-time setup: install dependencies, fetch factory skills, install git hooks if lefthook is present
setup: install-frontend
    sh scripts/factory/fetch-skills.sh
    cd backend && cargo fetch --locked
    if command -v lefthook >/dev/null 2>&1; then lefthook install; else echo "lefthook not installed: skipping git hooks (optional)"; fi

# Install frontend dependencies from the lockfile
install-frontend:
    npm --prefix frontend ci

# Lint, format, type checks and tests for both trees, plus the audits. Not run locally: coverage ratchet, zizmor,
# CodeQL, image scan, compose smoke test (CI only).
check: check-backend check-frontend audit

# Dependency audits: cargo deny + npm audit (same as the CI security workflow). Skips a tool that is not installed.
audit:
    @if cargo deny --version >/dev/null 2>&1; then cd backend && cargo deny --config deny.toml check; else echo "skipping cargo deny: cargo-deny not installed (cargo install cargo-deny --locked); CI runs it"; fi
    cd frontend && npm audit --omit=dev --audit-level=high

# Backend: format, clippy, tests (needs Postgres, see `just db`)
check-backend:
    cd backend && cargo fmt --check
    cd backend && cargo clippy --all-targets -- -D warnings
    @just test-backend

# Frontend: lint, typecheck, tests, production build
check-frontend:
    cd frontend && npm run lint
    cd frontend && npx tsc --noEmit
    cd frontend && npx vitest run
    cd frontend && npm run build

# Backend tests (cargo-nextest when installed, else cargo test)
test-backend:
    cd backend && if cargo nextest --version >/dev/null 2>&1; then cargo nextest run; else cargo test; fi

# Frontend tests (vitest)
test-frontend:
    cd frontend && npx vitest run

# Format the Rust code
fmt:
    cd backend && cargo fmt

# End-to-end tests (Playwright, e2e/ package)
e2e:
    npm --prefix e2e test

# Regenerate docs/openapi.json from the API code (the checked-in file is replaced only if the binary succeeds)
openapi:
    @if [ ! -f backend/src/bin/openapi.rs ]; then echo "No openapi binary yet (planned in issue #47)." >&2; exit 1; fi
    cd backend && cargo run --bin openapi > ../docs/openapi.json.tmp && mv ../docs/openapi.json.tmp ../docs/openapi.json || { rm -f ../docs/openapi.json.tmp; exit 1; }

# Start the whole stack in containers (http://localhost:3000)
up:
    @if [ ! -f .env ]; then cp .env.example .env && echo "created .env from .env.example"; fi
    docker compose up -d --build

# Stop the stack (data volumes are kept)
down:
    docker compose down

# Follow container logs; pass a service name to narrow, e.g. `just logs api`
logs *service:
    docker compose logs -f --tail=100 {{ service }}

# How to get a Postgres for the backend tests
db:
    @echo "Backend tests need Postgres 16 with a recipes_test database and a role that can create schemas and the citext extension."
    @echo "Quickest way (Docker):"
    @echo "  docker run -d --name recipe-box-test-db -p 5432:5432 -e POSTGRES_USER=recipes -e POSTGRES_PASSWORD=recipes -e POSTGRES_DB=recipes_test postgres:16-alpine"
    @echo "Then TEST_DATABASE_URL defaults to: $TEST_DATABASE_URL"
