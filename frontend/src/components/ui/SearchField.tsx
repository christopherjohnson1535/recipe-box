import type { ComponentProps } from "react";
import { cx } from "./cx";

/** The home search box set in display type: no frame, a rule beneath. Takes the same props as `<input>`. */
export function SearchField({ className, ...rest }: ComponentProps<"input">) {
  return (
    <input
      className={cx(
        "min-h-control w-full min-w-0 rounded-none border-0 border-b border-(--input-border) bg-transparent px-0 py-2 font-display text-[clamp(1.75rem,1.2rem+2vw,2.75rem)] leading-tight text-(--input-fg) placeholder:text-(--input-placeholder) placeholder:italic",
        "transition-[border-color] duration-150 ease-out hover:border-(--input-border-hover)",
        className,
      )}
      {...rest}
    />
  );
}

/** The sort menu beside the search field: a native select (iPadOS wheel picker) set as a quiet label. */
export function SearchSort({ className, ...rest }: ComponentProps<"select">) {
  return (
    <select
      className={cx(
        "label-quiet min-h-control min-w-0 rounded-none border-0 border-b border-(--input-border) bg-transparent ps-0 pe-1 text-(--input-fg)",
        "transition-[border-color] duration-150 ease-out hover:border-(--input-border-hover) [&>option]:bg-(--input-bg) [&>option]:text-(--input-fg)",
        className,
      )}
      {...rest}
    />
  );
}
