# Security policy

## Reporting a vulnerability
Please report privately, not in a public issue with details.

<!-- Owner: enable Settings → Code security → Private vulnerability reporting -->
GitHub private vulnerability reporting is the intended channel. If the **Report a vulnerability** button is not
shown yet, use the interim channel below.

1. Go to the repository's **Security** tab and choose **Report a vulnerability** (GitHub private vulnerability
   reporting).
2. Describe what you found, how to reproduce it, and what an attacker could do. A failing request or a short
   proof of concept is ideal.

Interim channel, until private reporting is enabled (or if you cannot use the button): open a minimal public issue
that says only "I have a security report, please contact me privately", with no details about the problem, and the
owner will arrange a private channel.

## What to expect
Recipe Box is maintained by one person in spare time, so these are intentions, not guarantees:
- Acknowledgement within 7 days.
- A first assessment (accepted, needs more information, or not a vulnerability) within 14 days.
- A fix for confirmed high-severity issues as soon as practical, and credit in the release notes if you want it.
- Please give a reasonable time to fix before disclosing publicly.

## Supported versions
Only the latest `main` (and the latest tagged release, once releases exist) receives security fixes.
Self-hosters should update by pulling `main` or the newest release and rebuilding. See [docs/DEPLOY.md](docs/DEPLOY.md).

## Scope
In scope, because they protect the household's data:
- **Authentication and sessions**: login, setup, the `rb_session` cookie, session expiry, admin-only routes,
  anything reachable without a session that should not be.
- **Link import and `safe_fetch`** (`backend/crates/adapters/http-fetch/src/safe_fetch.rs`): server-side request forgery, reaching
  private or loopback addresses, redirect handling, size and time limits.
- **Image uploads**: decoding and re-encoding, oversized or malformed files, path handling in the media store.
- **Household data**: one household member reading, changing or deleting data they should not, and leaking
  recipes, photos or accounts to the outside.
- **Secrets**: API keys or the database password reaching the browser, logs or the repository.
- Container and deployment defaults in `docker-compose.yml` and `deploy/`.

Out of scope: findings that need an already-compromised server or admin account, denial of service by
overloading a home server, missing hardening headers with no demonstrated impact, and vulnerabilities in
third-party services (report those upstream).

Recipe Box has no telemetry and, with `AI_PROVIDER=none`, makes no calls to AI services.
