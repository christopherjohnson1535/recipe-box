import type { ReactNode } from "react";

/** A line of text to copy exactly (an address, a bookmark): monospace, tinted, selects whole on a tap or click. */
export function CodeBlock({ children }: { children: ReactNode }) {
  return <code className="block border-l-[3px] border-(--alert-rule) bg-(--alert-bg) px-4 py-3 font-mono text-small break-all text-ink select-all">{children}</code>;
}

/** An address or other literal set inside a sentence. */
export function Literal({ children }: { children: ReactNode }) {
  return <span className="font-mono text-small break-all text-ink">{children}</span>;
}
