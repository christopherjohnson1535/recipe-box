# AI photo import (optional)

Reading recipes from photos (and from pasted text or pages without recipe data) uses an AI vision model.
Recipe Box works fully without it.

## Turn it on (Claude)
1. Create an API key at https://console.anthropic.com.
2. In `.env`: `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY=<your key>` (optionally `AI_MODEL`).
3. `docker compose up -d` to restart the API. Settings shows "AI import: on".

A wrong or expired key doesn't stop the server from starting: the first photo import says "The AI service rejected
the API key" and your photos are kept so you can type the recipe in.

## What it does
- **Cookbook pages, cards, screenshots:** up to 6 photos become one draft, in the order you chose them.
- **A photo of the dish:** Claude suggests a likely recipe, marked "Guessed from a photo of the dish". The photo
  becomes the recipe's picture.
- Everything comes back as a draft to check; nothing is saved until you press Save. The original photos stay with
  the recipe.
- If the AI service is busy, Recipe Box tries once more, then tells you to try again in a minute.

## Cost and privacy
Photos are resized to at most 1568 px on the long edge before sending; a typical page costs roughly a cent or less. Photos and text go to the AI
provider only when you import with AI. The key stays on the server and never reaches the browser.
See the [Claude vision docs](https://platform.claude.com/docs/en/build-with-claude/vision).

## iPhone and iPad photos (HEIC)
HEIC photos are read with libheif (`heif-convert`), which is installed in the API container. Running the API
outside Docker? Install it (`apt install libheif-examples`, `brew install libheif`) or point `HEIF_CONVERT` at it.

_Status: photo and text import work; link import falls back to AI for pages without recipe data — see [[Roadmap]]._
