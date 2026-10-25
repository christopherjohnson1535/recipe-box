/** A hairline either side of "or", between two ways of doing the same thing (password form, then Google). */
export function OrDivider() {
  return (
    <p aria-hidden="true" className="label flex items-center gap-4 text-ink-muted before:h-px before:flex-1 before:bg-(--rule-hair) after:h-px after:flex-1 after:bg-(--rule-hair)">
      or
    </p>
  );
}
