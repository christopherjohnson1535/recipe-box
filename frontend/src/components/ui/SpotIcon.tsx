import type { ReactNode } from "react";
import type { SpotName } from "./spot-icons";

// One line weight, one small accent detail each. `line` is drawn in --spot-line, `detail` in --spot-detail.
const DRAWINGS: Record<SpotName, { line: ReactNode; detail: string }> = {
  soups: { line: <path d="M4 11h16c0 4.4-3.6 8-8 8s-8-3.6-8-8zM9 21h6" />, detail: "M9.5 3.5l1 2.5M13.5 3.5l1 2.5" },
  vegetarian: { line: <path d="M5 19C5 10 10 5 19 5c0 9-5 14-14 14z" />, detail: "M5 19l8-8" },
  baking: { line: <path d="M3.5 11h17l-2 8h-13z" />, detail: "M8 11V6.5h8V11" },
  quick: { line: <circle cx="12" cy="12" r="9" />, detail: "M12 7v5l3 2" },
  mains: { line: <path d="M4 17a8 8 0 0 1 16 0zM2.5 19.5h19" />, detail: "M10.5 6.5h3" },
  drinks: { line: <path d="M7 4h10l-1.2 16H8.2z" />, detail: "M7.4 9h9.2" },
  fruit: { line: <path d="M12 8.5c-2-1.6-6-1.2-6 3.5 0 4 2.5 8 6 8s6-4 6-8c0-4.7-4-5.1-6-3.5z" />, detail: "M12 8.5c0-2 .8-3.5 2-4.5" },
  freezer: { line: <path d="M3.5 10h17l-1.5 9H5z" />, detail: "M12 12.5v4M10.3 13.5l3.4 2M13.7 13.5l-3.4 2" },
  default: { line: <circle cx="12" cy="12" r="8" />, detail: "M12 12h.01" },
};

/** A hand-drawn spot icon (24 x 24 viewBox, 1.5 stroke). Decorative: the tag or title beside it carries the meaning. */
export function SpotIcon({ name, size = 24 }: { name: SpotName; size?: number }) {
  const { line, detail } = DRAWINGS[name];
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-spot={name}
      className="shrink-0 stroke-(--spot-line)"
    >
      {line}
      <path d={detail} className="stroke-(--spot-detail)" />
    </svg>
  );
}
