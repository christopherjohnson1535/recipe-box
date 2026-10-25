import type { ComponentProps } from "react";
import { inputClass } from "./Input";

/**
 * Multi-line text control, set like Input; grows with its text where the browser supports `field-sizing` (the
 * `rows` height is the fallback and sets the minimum), and is resizable by dragging the corner.
 */
export function Textarea({ className, rows = 3, ...rest }: ComponentProps<"textarea">) {
  const min = rows >= 4 ? "min-h-30" : "min-h-24";
  return (
    <textarea
      rows={rows}
      className={inputClass(`resize-y py-2 leading-snug [field-sizing:content] ${min} ${className ?? ""}`)}
      {...rest}
    />
  );
}
