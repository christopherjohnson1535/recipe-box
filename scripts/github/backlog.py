"""The Recipe Box backlog: labels, milestones and one issue per feature slice.

`python3 scripts/github/sync_backlog.py <owner/repo>` creates whatever is missing on GitHub (idempotent: issues are
matched by title). Edit this file to add work, then re-run. Issue bodies point at docs/ so a fresh session has the
full context. Pass `size="S|M|L"` and/or `read=[...]` to `issue()` to add a `## Context pack` section (tier plus the
requirement IDs, SPEC sections, endpoints and files to read first).
"""

LABELS = {
    "area:backend": ("1d76db", "Rust API (backend/)"),
    "area:frontend": ("0e8a16", "Next.js app (frontend/)"),
    "area:ops": ("5319e7", "Containers, CI, deploy"),
    "area:docs": ("c5def5", "Docs and wiki"),
    "phase:1": ("fbca04", "Phase 1 — Recipe box (MVP)"),
    "phase:2": ("f9d0c4", "Phase 2 — Photos and AI"),
    "phase:3": ("fef2c0", "Phase 3 — Kitchen / iPad"),
    "phase:4": ("d4c5f9", "Phase 4 — Deploy"),
    "priority:must": ("b60205", "Needed for the phase to be done"),
    "priority:should": ("d93f0b", "Next after the musts"),
    "priority:could": ("cccccc", "Nice to have"),
    "type:feature": ("a2eeef", "Feature slice"),
    "type:bug": ("d73a4a", "Something isn't working"),
    "type:quality": ("bfdadc", "Review, QA, hardening (factory stages 4–6)"),
    "good first session": ("7057ff", "Small, self-contained; a good warm-up for a new session"),
}

MILESTONES = [
    ("Phase 1 — Recipe box", "Sign in, paste a link, review, save, find it again — all from docker compose up."),
    ("Phase 2 — Photos and AI", "A photographed cookbook page becomes a saved recipe (or photo + form without AI)."),
    ("Phase 3 — Kitchen", "iPad Home Screen app, cooking mode with the screen awake, opened recipes work offline."),
    ("Phase 4 — Deploy", "Runs on a chosen host over HTTPS with CI-built images and tested backup/restore."),
    ("Later", "Remaining Should / Could items."),
]

M1, M2, M3, M4, ML = (m[0] for m in MILESTONES)

COMMON = (
    "\n\n---\n**Before you start:** read `CLAUDE.md`, then the requirement IDs above in `docs/REQUIREMENTS.md`, "
    "the SPEC sections named here in `docs/SPEC.md`, and `docs/API.md` for any endpoint. Branch "
    "`issue-<n>-<slug>`, PR with `Closes #<n>`."
)


def issue(title, milestone, labels, goal, reqs, scope, owned, acceptance, size=None, read=None):
    if size not in (None, "S", "M", "L"):
        raise ValueError(f"size must be S, M or L, got {size!r}")
    if isinstance(read, str):
        read = [read]
    pack = ""
    if size or read:
        pack = "\n\n## Context pack"
        if size:
            pack += f"\n**Size:** {size}"
        if read:
            pack += "\n**Read first:**\n" + "\n".join(f"- {r}" for r in read)
    body = (
        f"## Goal\n{goal}\n\n"
        f"**Requirements:** {reqs}\n\n"
        f"## Scope and notes\n{scope}\n\n"
        f"## Owned paths\n{owned}"
        f"{pack}\n\n"
        "## Acceptance\n"
        + "\n".join(f"- [ ] {a}" for a in acceptance)
        + "\n- [ ] Checks pass for every tree touched (see `CLAUDE.md`)\n- [ ] Docs / wiki page updated"
        + COMMON
    )
    return {"title": title, "milestone": milestone, "labels": labels + ["type:feature"], "body": body}


ISSUES = [
    # ---------------- Phase 1 ----------------
    issue(
        "Verify the container stack end to end (first green CI)", M1,
        ["area:ops", "phase:1", "priority:must", "good first session"],
        "`docker compose up -d --build` brings up db, api and web healthy on a clean machine, and CI's `compose` job is green.",
        "OPS-1, OPS-2, OPS-5",
        "The scaffold's Dockerfiles were written in a sandbox without a Docker daemon, so they have never been built. "
        "Build both images, fix what breaks (cargo-chef caching, standalone copy, healthcheck binary, non-root "
        "permissions on the media volume), and confirm the web container's runtime proxy reaches the API "
        "(`/api/health` through port 3000). Try it on Windows Docker Desktop too.",
        "`backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml`",
        ["Both images build for linux/amd64 and linux/arm64 (buildx)", "`docker compose up --wait` healthy; setup + login work through :3000",
         "Media uploads survive `docker compose down && up` (volume)", "CI `compose` and `images` jobs green on main"],
    ),
    issue(
        "Design system: tokens, UI components, light/dark, docs/UI.md", M1,
        ["area:frontend", "phase:1", "priority:must"],
        "An editorial magazine look (in the tradition of The New Yorker — original, no trademarks) that reads well on an iPad in a kitchen, built from tokens so later themes are one file.",
        "KIT-1",
        "Factory build wave 2 (`.claude/skills/factory-build`). The editorial direction, fonts and base tokens were set "
        "during the scaffold (`docs/UI.md`, `.tastemaker/style-lock.md`) — keep them and build on them: "
        "three token layers (primitives → semantic → component) as described in `.claude/skills/factory-plan/SKILL.md` §2; "
        "`src/components/ui/*` are the only readers of component tokens. Light + 'evening edition' dark via "
        "`prefers-color-scheme`. Add guard tests: every theme defines every token, contrast ≥ 4.5:1, pages don't style "
        "themselves. Extend `docs/UI.md`; write `docs/THEMING.md`. Never use a publication's name, logo, mascot or "
        "proprietary typeface.",
        "`frontend/src/app/globals.css`, `frontend/src/styles/**`, `frontend/src/components/ui/**`, `frontend/src/app/layout.tsx`, `docs/UI.md`, `docs/THEMING.md`, `.tastemaker/**`",
        ["Every scaffold page uses only ui components + layout utilities", "Guard tests pass", "Screenshots at iPad portrait, landscape, phone, desktop in light and dark reviewed"],
    ),
    issue(
        "Recipe editor: create and edit with ingredients, steps, sections, tags, photo", M1,
        ["area:frontend", "phase:1", "priority:must"],
        "Type in a recipe or fix an imported draft comfortably on an iPad or desktop.",
        "REC-1, REC-2, REC-3",
        "Pages `/recipes/new` and `/recipes/[id]/edit`. One shared `RecipeForm` component (also used by the import "
        "review screen) taking a `RecipeInput`/`RecipeDraft`. Ingredient and step lists: add, remove, reorder "
        "(buttons, not drag-only), optional section headings, paste a block of lines to split into items. Tags with "
        "suggestions from `GET /api/tags`. Photo via `POST /api/media` with preview. Unsaved-changes warning. "
        "API is already implemented (`POST/PUT /api/recipes`).",
        "`frontend/src/app/recipes/new/**`, `frontend/src/app/recipes/[id]/edit/**`, `frontend/src/components/recipe-form/**`",
        ["Create, edit and save round-trip all fields", "Paste multi-line text → one item per line", "Keyboard-only usable; errors shown per field", "Vitest for the list-editing logic"],
    ),
    issue(
        "Recipe page: read view, delete with 10-second undo", M1,
        ["area:frontend", "phase:1", "priority:must"],
        "A clean, ad-free recipe page that's pleasant to read and easy to act on.",
        "REC-1, REC-2, ACC-4",
        "`/recipes/[id]`: hero photo, title, times, servings, tags, ingredients (with sections), numbered steps, notes, "
        "source link + credit, added/edited by. Actions: Cook (→ cooking mode), Edit, Delete. Delete calls "
        "`DELETE /api/recipes/:id` then shows a toast with Undo (`POST /api/recipes/:id/restore`) for 10 s. Print styles.",
        "`frontend/src/app/recipes/[id]/page.tsx` and its components folder",
        ["Undo restores within 10 s", "Long titles/ingredient lists don't overflow at 390 px", "Print view hides chrome"],
    ),
    issue(
        "Search, tag filters and sorting", M1,
        ["area:backend", "area:frontend", "phase:1", "priority:must"],
        "Find any recipe in a few keystrokes.",
        "FND-1, FND-2, FND-3, FND-4",
        "Backend: implement `q` (Postgres `websearch_to_tsquery('simple', q)` on `recipes.search`, plus title "
        "`ILIKE` prefix fallback) and `sort=newest|title|time` in `GET /api/recipes`; add tests. Frontend: home page "
        "search-as-you-type (debounced, URL `?q=` so back works), tag chips with counts, sort menu, result count, "
        "empty-results state. Target < 300 ms for 2,000 recipes — add a test that seeds 2,000 rows and times the query.",
        "`backend/src/routes/recipes.rs` (list only), `backend/tests/search.rs`, `frontend/src/app/page.tsx`, `frontend/src/components/search/**`",
        ["Ingredient words find recipes (e.g. 'buttermilk')", "Tag + query combine", "2,000-recipe timing test passes"],
    ),
    issue(
        "Link import (backend): safe fetch, schema.org Recipe parsing, photo download, duplicate check", M1,
        ["area:backend", "phase:1", "priority:must"],
        "Paste a recipe URL and get a clean draft back.",
        "LNK-1, LNK-2, LNK-5, LNK-7",
        "Implement `POST /api/import/url` (currently 501) per `docs/API.md` and SPEC 'Feature notes → Link import'. "
        "`import/safe_fetch.rs`: http(s) only, resolve host and refuse non-global IPs, re-check every redirect "
        "(max 5), 15 s timeout, 5 MB cap, browser-like UA. Map 401/403/429/503 and bot-check pages to `site_blocked`. "
        "`import/jsonld.rs`: JSON-LD (`@graph`, arrays, `HowToSection`, ISO 8601 durations, image variants, "
        "keywords → tags) with microdata fallback. Download the main image through safe_fetch into media. "
        "`duplicateOf` from normalised source URL. Fixture HTML files from 5+ real recipe sites saved under "
        "`backend/tests/fixtures/` (strip to the relevant markup).",
        "`backend/src/import/**`, `backend/src/routes/imports.rs` (url route), `backend/tests/import_url.rs`, `backend/tests/fixtures/**`",
        ["Parses fixtures from 5+ sites correctly", "Refuses 127.0.0.1, 10.x, 169.254.169.254, ::1 and redirects to them", "Duplicate URL returns duplicateOf", "No network in tests (local test server)"],
    ),
    issue(
        "Import screen: link / photo / text → review draft → save", M1,
        ["area:frontend", "phase:1", "priority:must"],
        "One place to bring a recipe in, see what was found, fix it and save.",
        "LNK-1, LNK-4, LNK-5, PHO-1, PHO-5",
        "`/import` with three modes. Link: paste URL → `POST /api/import/url` → review in the shared `RecipeForm`; "
        "on `site_blocked` offer 'paste the recipe text'; on `duplicateOf` link to the existing recipe. Text: textarea "
        "→ `POST /api/import/text`. Photo: file picker that also offers the camera on iPad "
        "(`accept=\"image/*\"`, `capture` optional), up to 6 photos, recipe/dish mode → `POST /api/import/photo`; on "
        "`ai_disabled` show the photos beside an empty form. Show `GET /api/import/capabilities` state. Loading states "
        "with honest timing ('reading the photo can take ~20 s'). Accept `?url=` to pre-fill (used by the Shortcut/"
        "bookmarklet issue).",
        "`frontend/src/app/import/**`, `frontend/src/components/import/**`",
        ["Each error code from docs/API.md has a clear message and next step", "Works with the text/photo endpoints still returning 501 (shows 'coming soon')", "iPad camera path tested on a real device or noted"],
    ),
    issue(
        "Household members: admin user management", M1,
        ["area:backend", "area:frontend", "phase:1", "priority:must"],
        "The admin adds and removes family members; anyone can change their own password.",
        "ACC-2, ACC-4",
        "Implement the users routes in `docs/API.md` (currently 501): list, create, delete (not yourself, not the last "
        "admin; sessions of the deleted user end), password change (admin or self; ends the user's other sessions). "
        "Settings page sections: My account, Household (admin only), AI import status.",
        "`backend/src/routes/users.rs`, `backend/tests/users.rs`, `frontend/src/app/settings/**`",
        ["Member can't reach admin routes (403)", "Last-admin and self-delete refused", "Password change logs out other devices"],
    ),
    issue(
        "Phase 1 review and design QA (factory stages 4–6)", M1,
        ["area:backend", "area:frontend", "phase:1", "priority:must"],
        "Independent review of Phase 1 before building on it.",
        "All Phase 1 IDs",
        "Run `factory-verify` (reviewers: backend security — auth, sessions, uploads, SSRF; frontend UI audit; "
        "integration build + smoke through compose), then fix waves (ledger in the run folder and PR), then `factory-test` "
        "(adapt `scripts/factory/shoot.py` pages to Recipe Box) and `factory-design-qa`. Known small item from the "
        "scaffold check: the API prints a backtrace when its port is in use — make it a one-line error.",
        "Whatever the fix waves own",
        ["Every Must fixed; Shoulds fixed or skipped with a reason", "Screenshot set reviewed (iPad + phone + desktop, light + dark)"],
    ),
    # ---------------- Phase 2 ----------------
    issue(
        "AI provider: Anthropic Claude implementation (pluggable)", M2,
        ["area:backend", "phase:2", "priority:must"],
        "With an API key set, the backend can turn images or text into a structured recipe draft.",
        "PHO-6, PHO-2, LNK-3",
        "Implement `AnthropicProvider` behind the `AiProvider` trait in `backend/src/import/ai.rs` using the Messages "
        "API over reqwest (`ANTHROPIC_API_KEY`, `AI_MODEL`). Resize images to ≤ 1568 px long edge JPEG before sending "
        "(see Claude vision docs). Ask for JSON matching `RecipeDraft`; validate and coerce; never trust it blindly. "
        "Timeouts, one retry on 429/5xx, clear `ai_error` messages. `NoneProvider` returns `ai_disabled`. "
        "Tests with a mocked HTTP server; no real key in CI.",
        "`backend/src/import/ai.rs`, `backend/src/config.rs` (AI vars only), `backend/tests/ai.rs`",
        ["Mocked provider round-trip test", "Key never logged", "Works with AI_PROVIDER=none (capabilities false)"],
    ),
    issue(
        "Photo import endpoint: multi-photo, HEIC, originals, dish mode, no-AI fallback", M2,
        ["area:backend", "phase:2", "priority:must"],
        "Cookbook pages, recipe cards and screenshots become drafts; a dish photo becomes a guessed recipe.",
        "PHO-1, PHO-2, PHO-3, PHO-4, PHO-5, PHO-7",
        "Implement `POST /api/import/photo` per `docs/API.md`: 1–6 files, store each as an image first (originals "
        "kept → `photoImageIds`), HEIC/HEIF support (libheif in the container or decode another way — document the "
        "choice), call the provider with all pages in order, `mode=dish` adds the 'guessed' warning. Without AI: 422 "
        "`ai_disabled` carrying `photoImageIds`. Saving a recipe with `photoImageIds` fills `recipe_photos`. Scaffold notes: the global body limit is `MAX_UPLOAD_MB` for every route, so give this route its own larger limit (6 × MAX_UPLOAD_MB); `AppError` needs a way to carry extra fields (`photoImageIds`) in the error body.",
        "`backend/src/routes/imports.rs` (photo route), `backend/src/import/photo.rs`, `backend/src/routes/media.rs` (HEIC), `backend/Dockerfile` (libheif if needed), `backend/tests/import_photo.rs`",
        ["iPhone HEIC sample decodes", "Two-page recipe merges into one draft (mock provider)", "No-AI path returns stored photo ids"],
    ),
    issue(
        "Paste-text import (and AI fallback for pages without structured data)", M2,
        ["area:backend", "phase:2", "priority:should"],
        "Paste any recipe text (or import a page with no schema.org data) and get a draft.",
        "LNK-3, LNK-4",
        "Implement `POST /api/import/text` through the AI provider. In the URL importer, when no structured recipe is "
        "found and AI is on, extract readable text from the HTML (strip nav/ads/scripts, cap ~20k chars) and send it "
        "to the provider; keep the source URL.",
        "`backend/src/routes/imports.rs` (text route), `backend/src/import/readable.rs`, `backend/tests/import_text.rs`",
        ["Text with headings becomes sections", "No-AI returns ai_disabled", "URL fallback only runs when JSON-LD/microdata found nothing"],
    ),
    # ---------------- Phase 3 ----------------
    issue(
        "Cooking mode: big text, step-by-step, tick off, screen stays awake", M3,
        ["area:frontend", "phase:3", "priority:must"],
        "Cook from the iPad with messy hands: readable from a distance and the screen never locks.",
        "KIT-2, KIT-3",
        "`/recipes/[id]/cook`: full-screen layout, large type, ingredients checklist and steps; toggle between all "
        "steps and one-at-a-time (big next/previous targets, swipe, arrow keys). Tick state kept per recipe in "
        "localStorage (try/catch). Screen Wake Lock (`navigator.wakeLock.request('screen')`), re-acquired on "
        "`visibilitychange`; show a small indicator and a fallback note when unsupported (iPadOS < 18.4).",
        "`frontend/src/app/recipes/[id]/cook/**`, `frontend/src/components/cook/**`",
        ["Wake lock verified on an iPad home-screen app (or noted)", "Readable at arm's length (≥ 22 px body)", "Works landscape and portrait"],
    ),
    issue(
        "Scale servings", M3,
        ["area:frontend", "phase:3", "priority:should", "good first session"],
        "Make half or double a recipe and see the amounts change.",
        "REC-4",
        "Parse leading quantities in ingredient text (integers, decimals, fractions like 1/2 and ½, ranges 2–3, "
        "mixed numbers 1 1/2) and scale them; leave unparseable lines unchanged. Show on the recipe page and in "
        "cooking mode. Pure function with thorough vitest cases.",
        "`frontend/src/lib/scale.ts`, `frontend/src/lib/scale.test.ts`, small UI hooks in the recipe and cook pages",
        ["Fractions render nicely (1½ not 1.5)", "Unparseable lines untouched", "20+ test cases"],
    ),
    issue(
        "Installable PWA: manifest, icons, iOS home-screen polish", M3,
        ["area:frontend", "phase:3", "priority:must"],
        "Add Recipe Box to the iPad Home Screen and launch it full screen like an app.",
        "KIT-4",
        "Finish `manifest.webmanifest` (name, short_name, start_url, display standalone, theme/background colours), "
        "real icon set incl. maskable and `apple-touch-icon`, iOS status-bar meta, safe-area insets. Requires HTTPS — "
        "test via Tailscale serve or the Caddy profile.",
        "`frontend/public/**`, `frontend/src/app/layout.tsx` (head only), `frontend/src/app/manifest*`",
        ["Lighthouse installable", "Launches standalone on iPad", "No content under the notch/home indicator"],
    ),
    issue(
        "Offline: service worker caches opened recipes and their photos", M3,
        ["area:frontend", "phase:3", "priority:should"],
        "A recipe opened before still loads in the kitchen with no internet.",
        "KIT-5",
        "Serwist service worker: precache the app shell; runtime-cache `GET /api/recipes/:id`, the recipe page and "
        "`/media/*` for recipes opened (network-first, cache fallback); cap cache size. Offline banner; disable "
        "save/import buttons offline with an explanation. iOS may evict caches — server stays the source of truth.",
        "`frontend/src/app/sw.ts`, `frontend/next.config.ts` (serwist only), `frontend/src/components/offline/**`",
        ["Airplane-mode test on iPad: opened recipe loads", "Logged-out state never served from cache", "Cache size capped"],
    ),
    # ---------------- Phase 4 ----------------
    issue(
        "HTTPS deploy guides: Tailscale, Caddy + domain, one managed host", M4,
        ["area:ops", "area:docs", "phase:4", "priority:must"],
        "Follow one page and end up with Recipe Box on HTTPS on the iPad.",
        "OPS-4, OPS-7",
        "Test and document: (1) home PC + `tailscale serve`, (2) VPS + Caddy profile with a domain, (3) one managed host "
        "(Fly.io or Azure Container Apps) using the GHCR images and managed Postgres. Update `docs/DEPLOY.md` and the "
        "wiki 'Deploying' pages with exact commands and screenshots where helpful.",
        "`docs/DEPLOY.md`, `docs/wiki/**`, `deploy/**`",
        ["Each guide run once from scratch", "COOKIE_SECURE behaviour verified", "Wiki updated"],
    ),
    issue(
        "Release process and multi-arch images", M4,
        ["area:ops", "phase:4", "priority:should", "good first session"],
        "Tag a version and get pinned, tested images to deploy.",
        "OPS-3",
        "Confirm the CI `images` job publishes amd64 + arm64 to GHCR, make the packages public, add a "
        "`CHANGELOG.md`, document `git tag v0.x.y && git push --tags`, and set `IMAGE_TAG` usage in the deploy guide.",
        "`.github/workflows/**`, `CHANGELOG.md`, `docs/DEPLOY.md`",
        ["v0.1.0 tag produces both images", "Images pull anonymously", "Raspberry Pi (arm64) pull works or noted"],
    ),
    issue(
        "Backup and restore: verify and automate", M4,
        ["area:ops", "phase:4", "priority:must"],
        "Never lose the family recipes.",
        "OPS-6",
        "`scripts/backup.sh` / `restore.sh` exist but are untested. Test a full backup → wipe volumes → restore cycle; "
        "fix permissions issues; add an optional scheduled backup (cron example / compose service) and retention; "
        "document copying backups off the machine.",
        "`scripts/backup.sh`, `scripts/restore.sh`, `docs/DEPLOY.md`, `docs/wiki/Backup-and-Restore.md`",
        ["Round trip restores recipes and photos", "Restore asks before replacing", "Docs updated"],
    ),
    issue(
        "Export and import all recipes (zip)", M4,
        ["area:backend", "area:frontend", "phase:4", "priority:should"],
        "Take all recipes and photos out as a file, and bring them back in.",
        "ACC-5",
        "Implement `GET /api/export` and `POST /api/import/export` (currently 501) per `docs/API.md`; stream the zip; "
        "import skips existing ids and validates every entry. Settings page buttons (admin).",
        "`backend/src/routes/export.rs`, `backend/tests/export.rs`, `frontend/src/app/settings/export/**`",
        ["Export → fresh install → import reproduces everything", "Malformed zip rejected cleanly"],
    ),
    issue(
        "Save from the share sheet (Apple Shortcut) and a desktop bookmarklet", M4,
        ["area:frontend", "area:docs", "phase:4", "priority:should"],
        "Save the recipe you're looking at in Safari with one tap.",
        "LNK-6",
        "iOS has no web Share Target, so: an Apple Shortcut that takes a shared URL and opens "
        "`https://<host>/import?url=<encoded>`; a bookmarklet doing the same on desktop. Settings page shows the "
        "bookmarklet (drag to bookmarks bar) and a link/instructions for the Shortcut. Wiki page with steps.",
        "`frontend/src/app/settings/share/**`, `docs/wiki/Save-from-Safari.md`",
        ["Shortcut tested on iPad", "Bookmarklet works in Chrome/Edge/Safari"],
    ),
    # ---------------- Later ----------------
    issue(
        "Favourites per household member", ML,
        ["area:backend", "area:frontend", "priority:could"],
        "Star recipes and filter to your favourites.",
        "REC-5",
        "Table `favourites(user_id, recipe_id)`, `PUT/DELETE /api/recipes/:id/favourite`, `favourite=true` list filter, "
        "star button on cards and recipe page; favourites are also kept offline (KIT-5).",
        "new migration, `backend/src/routes/favourites.rs`, frontend star component",
        ["Per-user, not shared", "Filter works with search"],
    ),
    issue(
        "'Made it' log", ML,
        ["area:backend", "area:frontend", "priority:could"],
        "Remember when you cooked something and what you'd change.",
        "REC-6",
        "Table `cook_log(id, recipe_id, user_id, cooked_on, note)`, endpoints, a 'Made it' button in cooking mode and a "
        "history list on the recipe page.",
        "new migration, `backend/src/routes/cook_log.rs`, frontend components",
        ["Entries show who and when"],
    ),
    issue(
        "Step timers detected from text", ML,
        ["area:frontend", "priority:could", "good first session"],
        "Tap '25 minutes' in a step to start a timer.",
        "KIT-6",
        "Detect durations in step text (minutes/hours/ranges), render as buttons in cooking mode, run timers with a "
        "visible countdown and a sound/vibration at the end; several timers at once.",
        "`frontend/src/lib/timers.ts` (+ test), `frontend/src/components/cook/timers/**`",
        ["Detection unit tests", "Timer keeps running when the screen is in another step"],
    ),
]
