import type { TextareaHTMLAttributes } from "react";
import { inputClass } from "./Input";

/** Multi-line text control, set like Input; resizable by dragging the corner. */
export function Textarea({ className, rows = 3, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={inputClass(`resize-y py-2 leading-snug ${className ?? ""}`)} {...rest} />;
}
