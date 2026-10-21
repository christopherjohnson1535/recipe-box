# Fix ledger

R4-01 fixed — page-styling.test.ts now allows only literal double-quoted `className="…"` outside `components/ui` (exempt by exact path), fails on `className={…}`, single quotes, template literals, spreads carrying className and `*Class` helpers/props, scans `.ts` and `lib/` too; self-test has every bypass from the finding.
R4-02 fixed — tokens.test.ts collects every `(--x)` / `var(--x)` read by `components/ui/*.tsx` and `globals.css`, fails if undefined, and fails on unread component tokens.
R4-03 fixed — added the missing pairs (chip hover, drop cap, ink and ink-muted on panel, input hover border, chip hover underline, alert rule, ghost underline); a test fails when a `-fg`/`-bg` component token has no pairing; `--button-ghost-underline` now `--color-rule-strong`.
R4-04 fixed — `ContentsEntry` wraps the kicker in `<div className="label">`, restoring 14px dots and 1.35 line height.
R4-05 fixed — tests assert the evening dark media query and `color-scheme: dark`, day `@theme static` with no media query; dead `delete` line removed.
R4-06 fixed — tokens.test.ts checks `themeColor` in layout.tsx and the manifest colours against the resolved `--color-paper` of day and evening.
R4-07 skipped — `<strong>` is acceptable emphasis semantics for the issue numbers.
R4-08 fixed — `Contents` label is optional and home no longer passes one, so the list takes its name from its section.
R4-09 fixed — moot: any `className={…}` is now a violation, with a message to use a ui component.
R4-10 fixed (SkipLink only) — `min-h-control` + `items-center` on focus; nav focus-ring clipping left as on `main`.
R4-11 skipped — unused variants kept; they carry tokens and pairs under test and no new ones are added.
D-01 fixed — new `ChipRow` in `ui/Chip.tsx` wraps chips with `flex-wrap`; home uses it, no horizontal scroller.
D-02 skipped — the narrower article column (max-w-measure-wide) inside the page is deliberate editorial framing.
D-03 skipped — trailing dots were chosen so no line starts with a dot; a leading separator only moves the orphan.
D-04 skipped — placeholder pages are replaced by their feature issues (#3, #7, #8, #13).
D-05 skipped — CSS columns would order entries top-to-bottom per column and scramble reading and focus order.
D-06 skipped — the selected chip already has a non-colour cue (the 2px accent underline).
D-07 fixed — `--cream-300` to #cdc3b0 and `--umber-700` to #463e33 in primitives; style lock updated; `--color-rule` stays decorative.
D-08 fixed — component token `--photo-filter` (none by day, `brightness(0.9) contrast(1.02)` in dark) applied in `LeadPhoto` and the contents thumbnail.
D-09 skipped — Add recipe is the page's primary action.
D-11 fixed — `PageHeader` gains `reserveDeck` (hidden non-breaking line at deck height); home sets it.
D-12 fixed — phone masthead nav loses its negative margin and items use `ps-0 pe-3` on phone, so the underline starts at the gutter.
D-13 skipped — italic placeholders are the documented style (docs/UI.md).
D-14 fixed — `overflow-wrap: anywhere` on h1–h3 became `break-word` and the redundant `break-words` on the entry link was removed, so only words longer than the line break.
D-15..D-22 (P2) deferred — not in scope for #2; revisit in Phase 1 design QA (#9).
R4-01 follow-up (orchestrator) — the stricter guard flagged the JS `class` keyword in lib/api.ts; `class` now only counts as a prop or key (`class=` / `class:`), with self-tests for both.
