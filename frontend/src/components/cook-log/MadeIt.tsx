"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { MadeItDone, MadeItPanel, MadeItPrompt } from "@/components/ui/CookLogKit";
import type { CookLogEntry } from "@/lib/api";
import { dayLabel } from "./cook-log-logic";
import { MadeItForm } from "./MadeItForm";

/**
 * Cook mode's "Made it" (REC-6), shown above the footer on the last step and in the list of every step: a one-line
 * prompt that opens the form in place, then a confirmation once the entry is saved. Escape closes the form and focus
 * returns to the button. Offline the form still opens: it keeps the note and says why Save is off.
 */
export function MadeIt({ recipeId }: { recipeId: string }) {
  const [open, setOpen] = useState(false);
  const [logged, setLogged] = useState<CookLogEntry | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const done = useRef<HTMLParagraphElement>(null);
  const reopen = useRef(false);

  useEffect(() => {
    if (logged) done.current?.focus({ preventScroll: true });
    else if (open) panel.current?.focus({ preventScroll: true });
    else if (reopen.current) opener.current?.focus({ preventScroll: true });
  }, [open, logged]);

  const close = () => {
    reopen.current = true;
    setOpen(false);
  };

  if (logged) {
    return (
      <MadeItPanel ref={panel} label="Made it">
        <MadeItDone ref={done} title="In the log.">
          {dayLabel(logged.cookedOn)}
          {logged.note ? ` · “${logged.note}”` : " · It’s on the recipe page."}
        </MadeItDone>
      </MadeItPanel>
    );
  }
  if (!open) {
    return (
      <MadeItPrompt
        action={
          <Button ref={opener} variant="secondary" aria-expanded={false} onClick={() => setOpen(true)}>
            Made it
          </Button>
        }
      >
        Cooked it? Note it in the log, with anything you’d change.
      </MadeItPrompt>
    );
  }
  return (
    <MadeItPanel ref={panel} label="Made it">
      <div
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            close();
          }
        }}
      >
        <MadeItForm recipeId={recipeId} onSaved={setLogged} onCancel={close} />
      </div>
    </MadeItPanel>
  );
}
