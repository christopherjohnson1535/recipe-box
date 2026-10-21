# Review R4 (UI + code): issue #7 import screen

Checked: vitest (import + recipe-form: 65 pass), tsc clean. Backend codes/statuses in `error.rs` match `import-errors.ts`
(blocked_address, site_blocked, fetch_failed, no_recipe_found, validation, too_large 413, unsupported_media 415,
ai_disabled + photoImageIds, not_implemented 501, network 0). Data safety holds: draft carries sourceType, sourceUrl,
imageId, photoImageIds through `RecipeForm` `buildInput`; nothing saves before the Save button; duplicate form is not
mounted until "Import anyway"; `startDirty` warns on reload. No Must findings.

Counts: Must 0, Should 5, Nice 6.

## Should

**I-01 Should** `import-errors.ts:553-556`, `ImportScreen.tsx:286-302`. Backend `internal` (500: "Something went wrong.") and proxy
`api_unreachable` fall to the default: title "The import failed", message is the server's, no next step. Fails "every
message has a next step". Fix: default message = `${server message} Try again, or type the recipe in.` and offer `type-in`.

**I-02 Should** `import-errors.ts:540-541`. `unauthenticated` says "Sign in again" with no link (the other-tab sign-out case).
Fix: add an offer `sign-in` rendering `ButtonLink href="/login"` (check the login route name).

**I-03 Should** `ImportScreen.tsx:512-517,91` (`field` is a boolean). Text mode: a `sourceUrl: …` validation error is
shown under "Recipe text" and focus goes to the textarea, but the bad value is in the source field. Fix: parse the
`name:` prefix and map `url`->import-url, `text`->import-text, `sourceUrl`->import-source; make `field` an id/name. (Text
endpoint is 501 today, so it bites when #text lands.)

**I-04 Should** `ImportScreen.tsx:219-230`. Review layout is one column below `lg`: on iPad portrait and at 390px
all original photos (full width, up to 6 x ~700px tall) sit above the form; the user scrolls thousands of px to reach
Title. Fix: below `lg` cap the gallery (`max-h-96 object-contain` on the img or a `<details>` around it) so the form is
reachable; keep side-by-side at `lg`.

**I-05 Should** `ImportScreen.tsx:275,233,242`. Mid-request tab switch: photo import running (about 20 s), user taps
Link: the pending note and "Stop waiting" vanish (`busy === mode`), the Link button looks idle, and starting a link
import silently discards the photo answer (its photos are already stored server-side). If they just wait, the review
replaces the screen and the button reads "Start over with a different link" (uses current `mode`, not the origin).
Fix: show `Pending` whenever `busy !== null` (message from `busy`), and store `from` in `Review` for that label.

## Nice

**I-06 Nice** `Pending.tsx:7`, `ImportScreen.tsx:275`. `role="status"` is inserted already filled; VoiceOver on iPad often
skips it. Fix: keep an always-present `<div role="status">` wrapper in ImportScreen and render the message into it.

**I-07 Nice** `ImportScreen.tsx:78-84`. Address bar keeps `?url=`; Back from the saved recipe or a reload re-fetches the
page (duplicate Alert then protects, so only wasted work). Fix: after starting, `history.replaceState(null,"","/import?mode=link")`.

**I-08 Nice** `ImportScreen.tsx:122-125,166-169,205`. Focus is dropped to body after "Stop waiting", "Go back", and
"Start over" (the focused button unmounts). Fix: focus `#import-url` / the tab after these.

**I-09 Nice** `import-errors.ts:516`, `PhotoPicker.tsx:126`. Photo validation is `field: false`, so `PhotoPicker`'s `error`
prop and its role=alert are never used (dead path); "Choose at least one photo" appears in an Alert below the button.
Fix: drop the `error` prop, or set `field` for photo and focus `#import-photos` (the focus line hardcodes `import-text`).

**I-10 Nice** `Pending.tsx`, `components.css:49`, `tokens.test.ts:105`. `--progress-fg` is accent for an aria-hidden
decorative pulse, and `Pending` re-implements Alert's border/bg. Justifiable but thin; `Alert` with a bar child
and `--link-fg` would drop a token and a test row.

**I-11 Nice** (accepted trade-off) `RecipeForm.tsx` `draftKey={null}`. A photo/text draft is lost if iPadOS reloads the tab
or the user taps an in-app link (no prompt for in-app navigation); the photos stay on the server unreferenced. A stash
would not help (the form is not mounted after reload), so leave it; note in the PR. Tests missing for Tabs arrow
keys, PhotoPicker, tab-switch and double-submit (Enter is blocked while busy because the disabled submit button blocks
implicit submission).
