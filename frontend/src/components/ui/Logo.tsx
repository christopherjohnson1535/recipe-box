import { cx } from "./cx";

/** The Recipe Box wordmark, set in the display serif. The bowl mark lives on in public/icon.svg for app icons. */
export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span
      translate="no"
      className={cx("font-display text-ink", size === "lg" ? "text-wordmark-lg" : "text-wordmark")}
    >
      Recipe Box
    </span>
  );
}
