/** Decorative rule. `double` is the thin double rule of the masthead and ingredient sidebar (1px, 3px gap, 1px); `hair` a 1px hairline. */
export function Rule({ variant = "hair" }: { variant?: "hair" | "double" }) {
  return variant === "double" ? (
    <div className="rule-double w-full" aria-hidden="true" />
  ) : (
    <div className="h-px w-full bg-(--rule-hair)" aria-hidden="true" />
  );
}
