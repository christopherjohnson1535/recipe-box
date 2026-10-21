import { cx } from "./ui/cx";

/** The Recipe Box wordmark, set in the display serif. The bowl mark lives on in public/icon.svg for app icons. */
export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span
      translate="no"
      className={cx(
        "font-display leading-none text-ink",
        size === "lg" ? "text-[clamp(2.75rem,2rem+4vw,4rem)]" : "text-[1.875rem] sm:text-[2.125rem]",
      )}
    >
      Recipe Box
    </span>
  );
}
