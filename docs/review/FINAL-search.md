# FINAL test: issue #5 search, tag filters, sorting

Built branch `issue-5-search` at http://127.0.0.1:3000. 15 recipes seeded through `POST /api/recipes` and deleted afterwards
(existing recipes untouched). Playwright/Chromium scripts were scratch files. Screenshots: `shots/search/` (32 files, gitignored).

## E2E table
| Step | Result | Evidence |
|---|---|---|
| Type "butter" at 60 ms/char | PASS | 0 `q=` requests while typing; one navigation after the pause; URL `?q=butter` |
| History growth while typing | PASS | `history.length` 2 -> 2 (replace) |
| Focus, caret, value kept | PASS | active element `#q`, value `butter`, caret 6 |
| Count text | PASS | "4 recipes match “butter”" with 4 cards (displayed uppercase by CSS) |
| Back after submitted search | PASS | returns to `/`, input emptied, full list |
| Ingredient word `buttermilk` | PASS | Buttermilk Pancakes, Buttermilk Biscuits |
| Partial title `lasag` | PASS | Weeknight Lasagne, Lasagna Soup |
| Tag name `dinner`, `DIN` | PASS | 12 results each, case-insensitive |
| `"cold butter"` | PASS | only Buttermilk Biscuits |
| `soup -tomato` | PASS | Tomato Soup excluded |
| `soup or stew` | PASS | Beef Stew plus all soups |
| Nasty: `'` `%` `_` `\` `&\|!():*` emoji `' OR 1=1 --` `"` `-` `or` `a:*b` `<->` | PASS | no 5xx, no error UI, empty state or sensible hits |
| `100%`, `Mac_` literal | PASS | find "100% Whole Wheat Bread" and "Mac_and Cheese" only |
| Tag chip + query | PASS | `?q=soup&tag=dinner&sort=title` -> 2 results, "2 recipes match “soup” tagged dinner" |
| Chips keep q and sort; counts | PASS | every chip href carries `q`/`sort`; counts shown |
| Sort A–Z / Quickest | PASS | DOM order equals API order; null minutes last; in URL |
| Best match while searching; Newest | PASS | options Best match, Newest, A–Z, Quickest; `sort=newest` in URL |
| Keyboard | PASS | Tab reaches input, Search, sort, chips; focused select + ArrowDown changes sort |
| Empty results + Clear search | PASS | "No recipes match"; Clear search returns to `/`, input emptied |
| No JavaScript | PASS | form GET -> `/?q=soup&tag=dinner&sort=title`; hidden tag and sort kept; Enter works |
| Race: first response delayed 1.5 s | PASS | final URL, input and results all `lasagna soup` (1 result); no stale overwrite |
| API 500 once, Retry | NOT TESTED | the list call is made by the Next server, not the browser; `route.fulfil` on `/api/recipes*` never sees it. A browser-fulfilled 500 on the RSC request makes Next hard-navigate and the page renders normally. No way to force a server-side API failure without stopping the API. Covered only by code review fix Q-03. No error-state screenshots exist. |

## WARN lines
- No scrollY-on-load and no horizontal overflow at any size/scheme/scene (home, search, tag+search, empty).
- 390 px light: result title links are 358 x 31 px (below 44 px); the whole card row may be the real tap area. Input, Search button, sort select and chips are >= 44 px. `RecipeCard` is not part of #5.

## Screenshots looked at
Light phone (home, search), light iPad (tag+search, empty), dark desktop (search). Editorial style holds: Caslon headline, red kickers, hairline rules, italic decks, evening palette legible, two-column contents on desktop. Result count line and empty state read well.

## Problems
- P1: Error state (Retry, text and focus kept) is not verified end to end; needs a test hook that makes the API fail (for example a test-only `API_INTERNAL_URL` pointing at a stub) or a vitest/RSC test. File: `frontend/src/app/(app)/page.tsx`.
- P2: On phone, 15 tag chips take 5 rows (~250 px) before the first result; consider a horizontal scroll row or a "More" fold. Screenshot `light-search-phone.png`. File: `frontend/src/components/ui/Chip.tsx` / `page.tsx`.
- P2: Result title tap height 31 px at 390 px (row may be fully clickable; verify). `light-search-phone.png`. File: `frontend/src/components/RecipeCard.tsx`.
- P2: No pending/loading cue while a search is in flight (Q-09, skipped by design). `SearchControls.tsx`.
- P2: Results without description or tags render as bare title rows ("Undo Me Soup"), looks uneven beside full cards. Existing data, `RecipeCard.tsx`.
- P2: Chip counts are global while results are filtered (Q-10, accepted).

No P0.
