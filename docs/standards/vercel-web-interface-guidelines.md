# Web Interface Guidelines (Vercel) — checklist summary

Source: https://vercel.com/design/guidelines (fetched 2026-10-17). This is a condensed summary for audits; read the
source for the full text. The "Copywriting (Vercel-specific)" items are Vercel's house style and advisory for Recipe Box.

## Interactions
- Every flow keyboard-operable (WAI-ARIA patterns). Visible focus via :focus-visible / :focus-within; sticky UI never covers focus.
- Focus traps in modals; move and restore focus per WAI-ARIA.
- Hit targets ≥ 24px (44px on mobile), matching the visual.
- Mobile inputs ≥ 16px font. Never disable zoom. Inputs keep focus/value after hydration. Never block paste.
- Loading buttons show a spinner and keep their label. Spinners/skeletons: 150–300 ms show-delay, 300–500 ms minimum display.
- State in the URL (tabs, filters, panels, pagination) so share/refresh/Back work. Restore scroll on Back/Forward.
- Optimistic UI with rollback or Undo. Destructive actions confirmed or undoable.
- Ellipsis "…" on items that open follow-ups and on loading labels.
- touch-action: manipulation on controls; set -webkit-tap-highlight-color.
- Tooltips: delay the first, peers instant. overscroll-behavior: contain in modals/drawers; none on <html> for pointer: fine.
- Autofocus the primary input on desktop. Everything that looks interactive is interactive.
- Drag: disable selection, inert elsewhere; every gesture has a click/keyboard alternative.
- Navigation uses <a>/<Link>. Async updates (toasts, validation) announced with aria-live="polite".
- Keyboard shortcuts localized; platform-specific symbols.

## Animations
- Reduced-motion variant. Prefer CSS > WAAPI > JS. Animate transform/opacity only. Animate only to clarify or delight.
- Easing fits what changes; animations interruptible; no autoplay > 5 s without controls; correct transform-origin.
- Never `transition: all`. SVG: animate <g> with transform-box: fill-box.

## Layout
- Optical alignment (±1px). Deliberate alignment to grid/baseline/edge. Balanced text+icon pairs.
- Test mobile, laptop, ultra-wide (50% zoom). Safe areas via env(). No unnecessary scrollbars. Let CSS layout size things, not JS.

## Content
- Inline help over tooltips. Skeletons match final layout. Accurate <title> per page.
- Every screen has a next step or recovery path. Empty, sparse, dense and error states designed.
- Curly quotes; single "…" character; tidy rag (no widows); tabular numerals for numbers.
- Status = colour + text. Icons have text equivalents; icon-only buttons have aria-label; hidden labels keep accessible names.
- Native elements before ARIA; hierarchical headings; skip link. scroll-margin-top on anchor targets.
- Handle short, average and very long user content. Locale-aware dates, numbers. Language from Accept-Language/navigator.
- translate="no" on brand names, code, identifiers (file names). Non-breaking spaces for units/shortcuts.

## Forms
- Enter submits (single control / last control); textarea Cmd/Ctrl+Enter.
- Every control labelled; clicking the label focuses it; checkbox/radio share one hit target with the label.
- Submit enabled until submission starts, then disabled + spinner (+ idempotency key). Don't pre-disable submit.
- Accept any input, validate with feedback; errors next to fields; focus first error on submit.
- Meaningful name/autocomplete; spellcheck off for codes/usernames/paths; correct type/inputmode.
- Placeholders end with "…" and show an example. Warn before leaving with unsaved data.
- Password managers supported on auth fields, kept away from others. Trim values. <select> has explicit bg + color.

## Performance
- Test Safari / low-power. Minimize re-renders. Profile throttled. Batch DOM reads/writes.
- Mutations < 500 ms. Prefer uncontrolled inputs. Virtualize large lists or content-visibility: auto.
- Lazy-load below-fold images, explicit image dimensions. Preconnect to origins. Preload critical fonts; subset fonts.
- Heavy work in Web Workers. Looping <video> instead of GIFs.

## Design
- Layered shadows (ambient + direct); borders + shadows; concentric radii (child < parent).
- Tint borders/shadows/text toward the background hue. Colour-blind-safe chart palettes. Check contrast (APCA where possible).
- Hover/active/focus higher contrast than rest. theme-color meta matches background. color-scheme set correctly.
- Avoid text-smoothing glitches after scaling; avoid gradient banding.

## Copywriting (Vercel-specific — advisory)
- Active voice, second person, concise, action-oriented, consistent terms, numerals for counts, space between number and unit.
- Errors framed positively and explain the fix. Specific labels, not "Continue".
- (Vercel uses Title Case and "&"; Recipe Box keeps sentence case and "and".)
