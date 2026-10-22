# 0003. All outbound fetches go through safe_fetch

Status: Accepted · Date: 2026-10-22 (recorded after the fact; the decision predates this record)

## Context
Link import makes the server fetch a URL chosen by a user. Left unchecked this is server-side request forgery: a request to a private, loopback or link-local address could reach the home network or cloud metadata.

## Decision
Every outbound fetch of a user-supplied address goes through `backend/src/import/safe_fetch.rs`. It resolves the host and allows only public IP addresses, re-checks them on every redirect, and enforces a 15 s timeout and a 5 MB cap. No other code calls the HTTP client with a user-supplied URL. This is one of the rules in CLAUDE.md that never bend, and changes to it get an independent security review.

## Consequences
- One small module carries the SSRF defence, so it can be reviewed and tested thoroughly (including with local fixture servers, never the real network).
- Imports from a site on the owner's own LAN will be refused; that is intended.
- New features that fetch URLs must reuse `safe_fetch`, not add a second client.
