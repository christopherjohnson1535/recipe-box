/** Decorative rule. `double` is the thick-over-thin masthead rule; `hair` a 1px hairline. */
export function Rule({ variant = "hair" }: { variant?: "hair" | "double" }) {
  return variant === "double" ? (
    <div className="rule-double w-full" aria-hidden="true" />
  ) : (
    <div className="h-px w-full bg-(--rule-hair)" aria-hidden="true" />
  );
}
