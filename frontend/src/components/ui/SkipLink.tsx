/** First focusable element on every page: jumps keyboard users past the masthead to `#main`. */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="label sr-only bg-(--button-primary-bg) px-4 py-3 text-(--button-primary-fg) focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
    >
      Skip to content
    </a>
  );
}
