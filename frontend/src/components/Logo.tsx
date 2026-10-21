/** The Recipe Box mark (a steaming bowl) + wordmark. Same drawing as public/icon.svg. */
export function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5 font-display text-xl font-semibold tracking-tight text-text">
      <svg viewBox="0 0 512 512" width="32" height="32" aria-hidden="true">
        <rect width="512" height="512" rx="112" fill="var(--accent)" />
        <g fill="var(--on-accent)">
          <path d="M112 264H400A144 144 0 0 1 112 264Z" />
          <rect x="200" y="414" width="112" height="26" rx="13" />
        </g>
        <path
          d="M208 216c-26-28 26-52 0-84M304 216c-26-28 26-52 0-84"
          fill="none"
          stroke="var(--on-accent)"
          strokeWidth="28"
          strokeLinecap="round"
        />
      </svg>
      <span translate="no">Recipe Box</span>
    </span>
  );
}
