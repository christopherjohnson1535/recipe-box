import type { SelectHTMLAttributes } from "react";
import { cx } from "./cx";

/** Native `<select>` (so iPadOS shows its wheel picker), set like Input but only as wide as its longest option. */
export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        "min-h-control min-w-0 rounded-control border border-(--input-border) bg-(--input-bg) px-3 text-body text-(--input-fg)",
        "transition-[border-color] duration-150 ease-out hover:border-(--input-border-hover)",
        "disabled:cursor-not-allowed disabled:opacity-55",
        className,
      )}
      {...rest}
    />
  );
}
