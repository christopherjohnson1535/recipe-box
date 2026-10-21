# FINAL test report: issue #7 import screen

Built app at http://127.0.0.1:3000 with the real API (AI off: `/api/import/capabilities` = `{ai:false,provider:none}`).
No internet and the SSRF guard blocks loopback, so success paths and some errors are `page.route` fulfilments that follow
docs/API.md (marked "mock"); everything else hit the real backend. Saves went to the real `POST /api/recipes`; all test
recipes were deleted via the API afterwards. Screenshots: `shots/import/` (gitignored; 4 sizes x light/dark x 6 states).

## E2E table

| Step | Result | Evidence |
|---|---|---|
| Link success (mock) -> review shows title, description, servings, times, 2 sections of ingredients and steps, notes, source, photo, tags, warnings; heading takes focus | PASS | `e2e-review.png` |
| Edit title -> Save -> lands on `/recipes/<id>`; `GET` shows sourceType=link, sourceUrl, imageId, tags, ingredient and step sections intact | PASS | API read-back |
| `duplicateOf` (mock) -> alert, "Open the existing recipe" links `/recipes/<id>`, "Import anyway" shows the form | PASS | `e2e-duplicate.png` |
| blocked_address (real, `http://10.0.0.1/`) -> "That address can't be imported", no offers | PASS | |
| fetch_failed (real, `https://www.example.com/`) -> "could not be loaded" + paste-text offer | PASS | |
| validation (real, `not a url`) -> inline field error "must be an http(s) URL." | PASS (copy, see P2-2) | |
| site_blocked (mock 502) -> note + "Paste the recipe text instead" switches to Text, keeps URL in source field, textarea focused, `?mode=text` | PASS | |
| no_recipe_found 422, ai_disabled 422 (url), 413, 415, 502 with HTML body, 401, network abort (all mock) -> each shows a titled message and next step | PASS | |
| Text real endpoint | PARTIAL | AI off: "Read the text" is disabled, so the real 501 "Coming soon" cannot be reached from the UI (API returns 501 `not_implemented`; mapped in unit tests only). See P2-3 |
| `?mode=photo` opens Photo tab; real photo import -> "Coming soon" + "Type it in" | PASS | `e2e-photo-real.png` |
| `?mode=text` opens Text tab | PASS | |
| `?url=` auto-starts exactly once (1 request); bare `example.com/pancakes` gets `https://` | PASS | |
| Photo picker: 2 previews, remove one, cap at 6 | PASS | `e2e-photo2.png` |
| 7th photo refused (stays 6) | PASS | message text present |
| ai_disabled photo (mock 422 + photoImageIds) -> photos beside/above empty form, type a title, Save keeps photoImageIds, sourceType=photo | PASS | `e2e-aidisabled.png` |
| "Stop waiting and edit" during 5 s delayed import -> back to input, URL kept, button enabled, late answer ignored | PASS | |
| Leaving mid-review -> `beforeunload` dialog | PASS | |
| Keyboard: ArrowRight/Left/Home/End move and select tabs with wrap; Tab goes to URL field; Enter submits | PASS | |

## WARN lines
- WARN scrollY=21 at load on ai_disabled review state at 390 px (light and dark): focus moves to the heading and scrolls.
- WARN horizontal overflow at 390 px on ai_disabled review: `Start over with a different photo` button right edge at 408 px (page `body.scrollWidth` 408; `documentElement` stays 390 so the page does not scroll, but the button is cut off visibly in the full-page shot).
- No other state (link empty, pending, review, site_blocked, photo with 2 previews) scrolled on load or overflowed at 390. No interactive element under 44 px in any state.

## Problems (ranked)

**P0**: none.

**P1**
1. Phone (390): the "Start over with a different photo" ghost button runs off the right edge in the ai_disabled state (408 px). Screenshot `ai_disabled-phone-light.png`. Likely `frontend/src/components/ui/Button.tsx` (`whitespace-nowrap` on a long ghost label) or the "Start over" row in `frontend/src/components/import/ImportScreen.tsx`. Let the label wrap or shorten it ("Start over").
2. Phone (390): in the site_blocked alert the "Paste the recipe text instead" button is wider than its note and sticks out past the alert's right edge (about 380 vs 374 px). Screenshot `site_blocked-phone-light.png`. Likely `ui/Alert.tsx` padding plus `whitespace-nowrap` buttons in `ImportScreen.tsx`; allow wrapping or stack full width.

**P2**
1. "Start over with a different link/photo" ghost button is indented about 10 px from the content edge (its padding), so it does not align with the form fields. All review shots. `ImportScreen.tsx` / `ui/Button.tsx` ghost variant.
2. Real validation message reads "must be an http(s) URL." (lower case, no subject), passed through from the API in `import-errors.ts` (`validation` case). Use a fixed friendly line such as "Paste a full web address that starts with http:// or https://".
3. With AI off the Text tab's "Read the text" button is disabled, so the 501 "Coming soon" path for text cannot be triggered in the UI; fine by design but the acceptance line "works with text endpoint returning 501" is only covered by unit tests. `ImportPanels.tsx`.
4. ai_disabled/photo review at 390 and 820 px stacks the original photos above the form at full width, pushing the form about 700 px down; consider a smaller strip or thumbnails below `lg`. `ImportScreen.tsx` photo grid.
5. Focus ring on a tab is a square box overlapping the tab rule (`focus-tab-ipad-light.png`); visible and OK, just slightly heavy.

## Visual review (looked at)
Light iPad: all six states; light phone: site_blocked, photo-2, ai_disabled; dark desktop: review. Editorial style matches docs/UI.md (display headline, kickers, hairlines, one red accent, no rounded cards). Dark review is legible with correct contrast, nothing clipped except the P1 items. Not viewed individually: the remaining dark/landscape/desktop shots (same layouts, no overflow metrics).
