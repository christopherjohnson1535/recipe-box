"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { MadeItDone, MadeItPanel, MadeItPrompt } from "@/components/ui/CookLogKit";
import type { CookLogEntry } from "@/lib/api";
import { dayLabel } from "./cook-log-logic";
import { MadeItForm } from "./MadeItForm";

/**
 * Cook mode's "Made it" (REC-6), shown under the step on the last step and after the list of every step: a one-line
 * prompt that opens the form in place, then a confirmation once the entry is saved. Escape closes the form and focus
 * returns to the button. Offline the form still opens: it keeps the note and says why Save is off. It stays mounted
 * while hidden (`show` false, an earlier step), so stepping back keeps a half-typed note and a saved cook is not offered
 * twice.
 */
export function MadeIt({ recipeId, show }: { recipeId: string; show: boolean }) {
  const [open, setOpen] = useState(false);
  const [logged, setLogged] = useState<CookLogEntry | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const done = useRef<HTMLParagraphElement>(null);
  const reopen = useRef(false);

  useEffect(() => {
    if (!show) return;
    // Focus scrolls the step column so the form (or the confirmation) is in view on a small screen.
    if (logged) done.current?.focus();
    else if (open) panel.current?.focus();
    else if (reopen.current) opener.current?.focus({ preventScroll: true });
  }, [show, open, logged]);

  const close = () => {
    reopen.current = true;
    setOpen(false);
  };

  let body;
  if (logged) {
    body = (
      <MadeItPanel ref={panel} label="Made it">
        <MadeItDone ref={done} title="In the log.">
          {dayLabel(logged.cookedOn)}
          {logged.note ? ` · “${logged.note}”` : " · It’s on the recipe page."}
        </MadeItDone>
      </MadeItPanel>
    );
  } else if (!open) {
    body = (
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
  } else {
    body = (
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
  return (
    <div hidden={!show} className="mt-8 flex shrink-0 flex-col">
      {body}
    </div>
  );
}
