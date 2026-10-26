"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Hint } from "@/components/ui/Hint";
import { copyText } from "@/lib/copy-text";

/** Copies `value`. Says so in words (announced politely); if the browser refuses, says that instead. */
export function CopyButton({ value, label, disabled }: { value: string; label: string; disabled?: boolean }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  async function copy() {
    setState((await copyText(value)) ? "done" : "failed");
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-2">
      <Button variant="secondary" onClick={copy} disabled={disabled}>
        {label}
      </Button>
      <span role="status">
        <Hint as="span">{state === "done" ? "Copied." : state === "failed" ? "Couldn’t copy here. Select the text above and copy it." : ""}</Hint>
      </span>
    </span>
  );
}
