import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

const icons = {
  up: "M6 15l6-6 6 6",
  down: "M6 9l6 6 6-6",
  remove: "M6 6l12 12M18 6L6 18",
  heading: "M6 5v14M18 5v14M6 12h12",
} as const;

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> & {
  icon: keyof typeof icons;
  /** Spoken name and tooltip; icons never stand alone. */
  label: string;
  /** No outline, for a control that sits inside another element (the remove cross on a tag). */
  quiet?: boolean;
};

/** 44px square icon button with an outline: row controls in the recipe editor. */
export function IconButton({ icon, label, quiet, className, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex size-control shrink-0 items-center justify-center rounded-control border text-(--button-ghost-fg)",
        "transition-[border-color,color] duration-150 ease-out hover:text-(--button-ghost-hover) disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:text-(--button-ghost-fg)",
        quiet ? "border-transparent" : "border-(--input-border) hover:border-(--input-border-hover)",
        className,
      )}
      {...rest}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={icons[icon]} />
      </svg>
    </button>
  );
}
