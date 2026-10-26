/** First focusable element on every page: jumps keyboard users past the masthead to `#main`. */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="label sr-only print:hidden bg-(--button-primary-bg) px-4 text-(--button-primary-fg) focus:not-sr-only focus:inline-flex focus:min-h-control focus:items-center focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:[--focus-ring:var(--color-band-accent)]"
    >
      Skip to content
    </a>
  );
}
