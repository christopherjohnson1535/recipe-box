import type { HTMLAttributes } from "react";
import { cx } from "./cx";

/** A bordered panel on the page: a hairline frame, square corners, no shadow. */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("border border-rule bg-paper", className)} {...rest} />;
}
