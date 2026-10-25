import type { ReactNode } from "react";
import { buttonClass } from "./Button";

/** A button that opens the file chooser; `onFile` gets the picked file. The input is visually hidden but keeps focus rings. */
export function FileButton({ children, accept, disabled, onFile }: { children: ReactNode; accept?: string; disabled?: boolean; onFile: (file: File) => void }) {
  return (
    <label
      className={buttonClass(
        "secondary",
        "cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-(--focus-ring) has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55",
      )}
    >
      {children}
      <input
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = ""; // choosing the same file again must still fire
          if (file) onFile(file);
        }}
        className="sr-only"
      />
    </label>
  );
}

/** A button-looking link that saves the file at `href` (a plain navigation, so the browser streams it to disk). */
export function DownloadButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} download className={buttonClass("secondary")}>
      {children}
    </a>
  );
}
