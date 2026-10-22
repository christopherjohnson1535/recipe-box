import type { SelectHTMLAttributes } from "react";
import { cx } from "./cx";

/** Native `<select>` (so iPadOS shows its wheel picker), set like Input but only as wide as its longest option. */
export function Select({
  className,
  quietOnPhone,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & {
  /** Below 640px, drop the box for an underlined, label-style control so it can sit on a line of its own. */
  quietOnPhone?: boolean;
}) {
  return (
    <select
      className={cx(
        "min-h-control min-w-0 rounded-control border border-(--input-border) bg-(--input-bg) px-3 text-body text-(--input-fg)",
        "transition-[border-color] duration-150 ease-out hover:border-(--input-border-hover)",
        "disabled:cursor-not-allowed disabled:opacity-55",
        quietOnPhone &&
          "max-sm:rounded-none max-sm:border-0 max-sm:border-b max-sm:border-(--input-border) max-sm:bg-transparent max-sm:ps-0 max-sm:text-small",
        className,
      )}
      {...rest}
    />
  );
}
