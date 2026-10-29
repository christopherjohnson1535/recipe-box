"use client";

import { useId, useState } from "react";
import { OfflineNote } from "@/components/offline/OfflineNote";
import { useOnline } from "@/components/offline/use-online";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { MadeItFields } from "@/components/ui/CookLogKit";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { ApiError, api, type CookLogEntry } from "@/lib/api";
import { MAX_NOTE, today } from "./cook-log-logic";

/**
 * Records a "made it" entry: the day (today by default, on this device's calendar) and an optional note on what to
 * change next time. Needs the server: offline, Save is off with the reason beside it, and what was typed stays put so
 * it can be sent once the connection is back (nothing is queued in the background).
 */
export function MadeItForm({ recipeId, onSaved, onCancel }: { recipeId: string; onSaved: (entry: CookLogEntry) => void; onCancel: () => void }) {
  const online = useOnline();
  const id = useId();
  const [day, setDay] = useState(() => today());
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const max = today();
  const tooLong = note.trim().length > MAX_NOTE;
  const badDay = !day || day > max;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (badDay || tooLong || !online) return;
    setPending(true);
    setFailure(null);
    try {
      onSaved(await api.addCookLogEntry(recipeId, { cookedOn: day, note: note.trim() }));
    } catch (err) {
      setFailure(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
      setPending(false);
    }
  }

  return (
    <form method="post" onSubmit={save} className="flex flex-col gap-4" noValidate>
      <MadeItFields>
        <Field label="Cooked on" htmlFor={`${id}-day`} error={badDay ? "Pick a day up to today." : undefined}>
          <Input
            id={`${id}-day`}
            type="date"
            value={day}
            max={max}
            required
            aria-invalid={badDay || undefined}
            aria-describedby={badDay ? `${id}-day-msg` : undefined}
            onChange={(e) => setDay(e.target.value)}
          />
        </Field>
        <Field
          label="What I’d change"
          htmlFor={`${id}-note`}
          hint={tooLong ? undefined : "Optional. Less salt, a hotter oven, double the sauce."}
          error={tooLong ? `Keep it to ${MAX_NOTE.toLocaleString("en-US")} characters.` : undefined}
        >
          <Textarea id={`${id}-note`} rows={2} value={note} aria-invalid={tooLong || undefined} aria-describedby={`${id}-note-msg`} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </MadeItFields>
      {failure && (
        <Alert tone="error" title="Not saved">
          {failure}
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" pending={pending} disabled={!online || badDay || tooLong} aria-describedby={online ? undefined : `${id}-offline`}>
          {pending ? "Saving…" : "Save to the log"}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={onCancel}>
          Not now
        </Button>
      </div>
      <OfflineNote id={`${id}-offline`}>You’re offline. Your note stays here; save it once you’re back online.</OfflineNote>
    </form>
  );
}
