# Redesign proposals (October 2026)

The Phase 1 UI got the editorial direction right (Libre Caslon Display + Newsreader, cream paper, one claret
accent) but reads flat: no focal point per screen, no illustration, motion limited to colour-only hovers. These
proposals keep the New Yorker restraint and add what was missing. Each one is a GitHub issue in the
**Phase 2 — Photos and AI** milestone.

| # | Proposal | Screenshot | Issue |
|---|---|---|---|
| E | Detail kit: motion tokens, spot icons, Day/Evening editions, save stamp, skeletons | `5-detail-kit.jpg` | #38 (build first) |
| A | Homepage as a magazine cover | `1-cover-homepage.jpg` | #39 |
| B | Recipe page as a feature spread | `2-recipe-spread.jpg` | #40 |
| C | iPad cook mode, Evening Edition | `3-ipad-cook-mode.jpg` | #41 (design for #13) |
| D | Import as a darkroom (live scan + draft) | `4-import-darkroom.jpg` | #42 |
| F | Illustrated plates: one print treatment for every photo | plates in A and B | #43 |

## Files
- `*.jpg`: screenshots at 2× (desktop 1280 px wide; cook mode at iPad landscape 1180 × 820).
- `proposals.src.html`: the mockup source with every animation. It expects the fonts to be inlined where it
  says `/*FONTS*/`; without them it falls back to Georgia. The plates are drawn on `<canvas>` as stand-ins for
  real photos (`drawPlate()`).

## Motion rules these proposals assume (to be written into `docs/UI.md` by issue E)
- Motion marks a change of state or place. Nothing loops except an active timer, a scan in progress, or the
  in-season ticker.
- One easing curve (`--ease-out`), durations 150–900 ms.
- `prefers-reduced-motion: reduce` removes movement entirely; colour changes stay.
- Arrival staggers run once per visit and never on Back.

## Palette additions
Chrome stays ink + claret. Illustration and status may use three print inks: mustard `#d9a21b` (attention,
"uncertain" in import), fern `#3f6b45`, tomato `#d2492a`. Each needs contrast checks in `tokens.test.ts` before use
as text.
