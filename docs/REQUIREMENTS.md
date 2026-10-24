# Recipe Box — requirements

Draft 2026-10-21 for the owner to confirm. IDs are referenced by `docs/SPEC.md`, issues and pull requests.

## Overview
A household recipe website. Recipes come in from a link, a photo (cookbook page, handwritten card, screenshot,
or a picture of a dish) or by typing, and are cooked from on an iPad in the kitchen or read on any computer.
It runs as two containers — a dedicated backend API and a dedicated frontend — plus a database, and can be
deployed to a home server or a cloud host without code changes.

**Goals**
1. Save a recipe from a web link in one step, without the ads and life story.
2. Turn a photo of a cookbook page, recipe card or screenshot into an editable recipe.
3. Cook from the iPad: big text, screen stays on, works offline, installs as an app icon.
4. One shared recipe box for the household, findable by search and tags.
5. Deploy anywhere containers run; the owner can move hosts later without a rewrite.

**Non-goals (for now)**
- Public sharing, social features, or a recipe marketplace.
- Nutrition calculation, meal-kit ordering, grocery delivery.
- A native iOS app (the PWA covers the iPad).

## Current workflow and pain points
Today recipes live in many places:
1. Bookmarks to recipe blogs → long pages full of ads; links rot; sites change.
2. Cookbooks on the shelf → no search; can't take one to the store or a friend's house.
3. Handwritten family cards → fragile, one copy, hard to read.
4. Screenshots from Instagram/TikTok/apps → lost in the camera roll.
5. Cooking from a phone/iPad → the screen dims and locks with messy hands; text is small.

Pain points the app removes: no single searchable place · ads and clutter around the actual recipe · retyping
from paper · single fragile copies · the screen locking mid-recipe · no access without internet in the kitchen.

## Functional requirements
Priority: **Must** = first usable version, **Should** = next, **Could** = nice to have.

### 1. Recipes (REC)
| ID | Requirement | Priority |
|---|---|---|
| REC-1 | A recipe has title, photo, description, ingredients (list), steps (list), servings, prep/cook/total time, tags, notes, source link/credit | Must |
| REC-2 | Create, edit and delete recipes; delete with a 10-second Undo instead of a confirmation | Must |
| REC-3 | Ingredient lists support section headings (e.g. "For the sauce") | Should |
| REC-4 | Scale servings (×½, ×2, custom) and the ingredient amounts update | Should |
| REC-5 | Mark favourites per household member | Could |
| REC-6 | Personal "made it" log with date and notes | Could |

### 2. Find (FND)
| ID | Requirement | Priority |
|---|---|---|
| FND-1 | Home shows all recipes as cards with photo, title, total time, tags; newest first | Must |
| FND-2 | Search by title, ingredient, tag and notes; results as you type (< 300 ms for 2,000 recipes) | Must |
| FND-3 | Filter by tag; tags are created freely and listed with counts | Must |
| FND-4 | Sort by newest, title, total time | Should |

### 3. Import from a link (LNK)
| ID | Requirement | Priority |
|---|---|---|
| LNK-1 | Paste a URL → the server reads the page's structured recipe data (schema.org `Recipe` JSON-LD / microdata) and shows a draft to review before saving | Must |
| LNK-2 | Draft includes the main photo (downloaded and stored, so it survives the site changing) and the source link | Must |
| LNK-3 | Pages without structured data: AI extraction from the page text when AI is configured; otherwise a clear message and the "paste text" option | Should |
| LNK-4 | Sites that block servers (403, bot checks): offer "paste the recipe text" which goes through the same extraction | Must |
| LNK-5 | Warn when the same source URL was already saved and link to it | Must |
| LNK-6 | Save from the iPad/iPhone share sheet via an Apple Shortcut, and from desktop via a bookmarklet (iOS doesn't support the web Share Target API) | Should |
| LNK-7 | Only public http(s) addresses are fetched; private/internal addresses are refused | Must |

### 4. Import from a photo (PHO)
| ID | Requirement | Priority |
|---|---|---|
| PHO-1 | Upload one or more photos (JPEG, PNG, HEIC from iPhone/iPad, WebP), or take one with the iPad camera | Must |
| PHO-2 | With AI configured: read the recipe from cookbook pages, handwritten cards and screenshots into a draft to review | Must |
| PHO-3 | Multi-page recipes: several photos become one recipe | Should |
| PHO-4 | Photo of a dish: AI suggests a likely recipe, clearly labelled "guessed from a photo" | Should |
| PHO-5 | Without AI configured: the photo is saved and shown beside an empty form so it can be typed in; the UI says AI import is off | Must |
| PHO-6 | AI provider is pluggable and configured by environment variable; the app runs fully without it | Must |
| PHO-7 | The original photo is kept with the recipe (viewable full size) | Should |

### 5. Kitchen / iPad (KIT)
| ID | Requirement | Priority |
|---|---|---|
| KIT-1 | Responsive layout: iPad portrait/landscape, phone, desktop | Must |
| KIT-2 | Cooking mode: large text, one step at a time or full list, tap ingredients/steps to tick them off | Must |
| KIT-3 | Screen stays awake in cooking mode (Screen Wake Lock; works in iPadOS 18.4+ home-screen apps) | Must |
| KIT-4 | Installable to the Home Screen with icon and full-screen launch (PWA manifest) | Must |
| KIT-5 | Works offline: recipes opened before (and favourites) are readable without internet; edits made offline are clearly blocked or queued | Should |
| KIT-6 | Step timers detected from text ("bake 25 minutes") with a tap-to-start timer | Could |

### 6. Household and access (ACC)
| ID | Requirement | Priority |
|---|---|---|
| ACC-1 | One shared recipe box; household members sign in with their own username and password | Must |
| ACC-2 | No public sign-up: the first account is created at setup; an admin adds/removes members | Must |
| ACC-3 | Sessions last 30 days on a device so the iPad stays signed in | Must |
| ACC-4 | Each recipe records who added and last edited it | Should |
| ACC-5 | Export all recipes (JSON + photos) and import that export back | Should |

### 7. Deploy and operate (OPS)
| ID | Requirement | Priority |
|---|---|---|
| OPS-1 | Separate backend and frontend containers; database in its own container with a named volume | Must |
| OPS-2 | One `docker compose up -d` starts everything locally; configuration only through environment variables / `.env` | Must |
| OPS-3 | Images build for both amd64 and arm64 (PC, Raspberry Pi, cloud) and are published by CI to a registry | Should |
| OPS-4 | HTTPS in deployed setups (needed for the PWA, offline, camera and wake lock): a reverse-proxy option with automatic certificates | Must |
| OPS-5 | Health endpoints and container health checks; database migrations run automatically on start | Must |
| OPS-6 | Backup and restore of the database and photos with one documented command each | Must |
| OPS-7 | Deploy guide covering: home PC/server, a small VPS, and a managed container host | Must |

## Non-functional requirements
| Area | Requirement |
|---|---|
| Data safety | Deleting a recipe is undoable briefly; photos are never lost on edit; backups are restorable and tested |
| Privacy / security | Passwords hashed (argon2/bcrypt); httpOnly secure session cookies; AI keys only on the backend; uploads size-limited and re-encoded; no telemetry |
| Network safety | Link import fetches only public addresses (no internal network access); timeouts and size caps |
| Platforms | iPadOS/iOS Safari 18+, current Chrome/Edge/Firefox/Safari on desktop; Windows PC for development |
| Performance | Home list and search usable within 1 s on the iPad over home Wi‑Fi for 2,000 recipes; link import < 10 s typical; photo import < 30 s |
| Visual style | Editorial magazine look in the tradition of literary weeklies such as The New Yorker: display and text serifs, generous white space, narrow measure, small-caps kickers, italic decks, hairline rules, near-monochrome palette with one sparing accent; an "evening edition" dark mode. Original design — no publication's name, logo, mascot or proprietary typeface. Details in `docs/UI.md` |
| Accessibility | Keyboard reachable, visible focus, labels on all inputs, contrast ≥ 4.5:1, works with Dynamic Type / zoom to 200% |
| Reliability | Containers restart on failure; a failed import never creates a half-saved recipe |
| Portability | No host-specific code; same images run on a PC, a Pi and a cloud VM |
| Maintainability | Typed code, automated tests in CI, readable `.env.example`, README with setup in under 10 minutes |
| Copyright | Recipes are for private household use; the source link and author credit are kept with imported recipes |

## Phased roadmap
1. **Phase 1 — Recipe box (MVP).** REC-1/2, FND-1/2/3, LNK-1/2/4/5/7, ACC-1/2/3, KIT-1, OPS-1/2/5/6.
   Done when a household member signs in, pastes a recipe link, reviews and saves it, and finds it again by
   search — all running from `docker compose up`.
2. **Phase 2 — Photos and AI.** PHO-1/2/5/6, LNK-3, PHO-3/4/7. Done when a photographed cookbook page becomes a
   saved recipe on the iPad (or, without an AI key, a photo-plus-form).
3. **Phase 3 — Kitchen.** KIT-2/3/4/5, REC-3/4. Done when the iPad runs it from the Home Screen in cooking mode
   with the screen awake, and a previously opened recipe loads in airplane mode.
4. **Phase 4 — Deploy.** OPS-3/4/7, ACC-4/5, LNK-6. Done when the stack runs on a chosen host over HTTPS with
   CI-built images and a tested backup/restore.

After that: the remaining Should / Could items (favourites, made-it log, timers, sort).

## Decisions taken (from the owner, 2026-10-21)
- Users: the owner plus household members, one shared box → ACC-1/2.
- Photo AI: decide later → pluggable provider, app fully usable without it (PHO-5/6). Claude is the first
  provider; cost is about a cent or less per photo at typical sizes
  ([Claude vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)).
- Photo types: cookbook pages, handwritten cards, screenshots and dish photos → PHO-2/4.
- iPad: cooking mode, Home Screen install, offline, camera import → KIT-2–5, PHO-1.
- Deploy target: not decided → portable containers + guide for several targets (OPS-7).

## External constraints found
- **Screen Wake Lock** works in Home Screen web apps from iOS/iPadOS 18.4
  ([WebKit bug 254545](https://bugs.webkit.org/show_bug.cgi?id=254545)).
- **PWA features need HTTPS** (service worker, wake lock, camera access outside `localhost`) → OPS-4. A plain
  `http://192.168.x.x` address on the home network will run the site but not install/offline features.
- **iOS has no web Share Target**: a web app can't appear in the iPad share sheet → Apple Shortcut instead (LNK-6).
- **iOS can evict offline data** of web apps under storage pressure; offline is a cache, the server stays the source
  of truth ([MagicBell PWA iOS guide](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)).
- **Claude vision limits**: up to 10 MB / 8000×8000 px per image; long edge above ~1568–2576 px is downscaled, so
  the backend resizes before sending ([Claude vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)).
- **Many recipe sites block automated requests**; structured data is common but not universal → LNK-3/4.

## Open questions (defaulted — say if any default is wrong)
- [ ] Domain name for HTTPS? Default: none yet; the guide covers Caddy with a domain and Tailscale without one.
- [ ] Should members be able to delete others' recipes? Default: yes, any member can edit or delete (shared box).
- [ ] Units: keep as written, or convert metric ↔ US? Default: keep as written (conversion is a Could later).
- [ ] Import existing recipes from another app (Paprika, etc.)? Default: not now.
