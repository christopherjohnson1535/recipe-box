# AI photo import (optional)

Reading recipes from photos (and from pasted text or pages without recipe data) uses an AI vision model.
Recipe Box works fully without it.

## Turn it on (Claude)
1. Create an API key at https://console.anthropic.com.
2. In `.env`: `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY=<your key>` (optionally `AI_MODEL`).
3. `docker compose up -d` to restart the API. Settings shows "AI import: on".

## Cost and privacy
Photos are resized before sending; a typical page costs roughly a cent or less. Photos and text go to the AI
provider only when you import with AI. The key stays on the server and never reaches the browser.
See the [Claude vision docs](https://platform.claude.com/docs/en/build-with-claude/vision).

_Status: Phase 2 — see [[Roadmap]]._
