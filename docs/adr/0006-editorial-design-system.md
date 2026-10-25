# 0006. Editorial design system with three token layers

Status: Accepted; palette and font parts superseded by [0009](0009-riviera-charcoal-saffron.md) · Date: 2026-10-22 (recorded after the fact; the decision predates this record)

## Context
The app is used in the kitchen on an iPad at arm's length. It should feel like a printed cookbook, stay legible and accessible, and let the look change in one place instead of page by page.

## Decision
The UI follows an editorial magazine style (serif type, hairline rules, cream paper, one claret accent), documented in docs/UI.md and locked in `.tastemaker/style-lock.md`. Colours come from three layers of tokens (primitives, semantic themes, component tokens; docs/THEMING.md). Pages only arrange `src/components/ui/*` components with layout utilities. Fonts come from open-licensed `@fontsource` packages, never `next/font/google`, and the design must not copy any publication's name, logo or typeface. Accessibility minimums: visible focus, contrast of at least 4.5:1, 44 px touch targets.

## Consequences
- Guard tests fail on page-level styling, a theme missing a token, or low contrast, so the look cannot drift silently.
- A new theme (for example the proposed Evening Edition) is a token set, not a rewrite.
- Contributors must learn the component set before building UI.
- The October 2026 redesign proposals (docs/design/redesign-2026-10/) build on this system rather than replace it.
