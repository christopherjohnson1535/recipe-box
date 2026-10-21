# FINAL test: design system (#2), after fix wave

Shots: `shots/after1/` (pre-fix: `shots/build/`). Full shoot.py run, 8 pages x 2 schemes x 4 sizes.

## WARN lines
None (no scrolled-on-load pages, no horizontal overflow).

## Checks
| Check | Result | Screenshot |
|---|---|---|
| D-01 tag index wraps, nothing clipped | PASS. Pre-fix "QU..." clipped at iPad and phone "BREAKFAST" clipped; now wraps to 2 rows (iPad), 4 rows (phone), 2 rows (landscape) | light-home-ipad, light-home-phone, light-home-ipad-landscape |
| D-07 hairlines slightly stronger | PASS. Rule colour (217,209,195) -> (205,195,176) | light-home-phone |
| D-08 dark photos dimmer | PASS. Plate/background visibly darker (plate ~E8E0D0 -> ~D5CDBD) | dark-recipe-desktop |
| D-11 no header jump (tag, no-match) | PASS. PIL: ink rows at y=28,58,68,74,133,176 identical to unfiltered; buttons at y=297 in all three. Pre-fix tag/no-match differed from y=249 | light/dark-home-tag-ipad, light/dark-home-nomatch-ipad |
| D-12 phone nav underline at gutter | PASS. Underline x 8 -> 16 | light-home-phone, light-recipe-phone |
| D-14 phone titles no mid-word break | PASS. Recipe title wraps on words; list titles clamp with ellipsis only | light-recipe-phone, light-home-phone |
| R4-04 contents kickers uppercase labels with dots | PASS. Uppercase, red, dotted separators | light-home-ipad |
| Regressions vs build (home, recipe, login, landscape) | None seen | various |

## Notes
- Empty-tag/no-match states keep an empty gap where the subtitle sat (intentional, keeps layout stable).
- Landscape contents grid leaves empty space under the short right column items (normal for 2-column flow).

## Problems
None.
