"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { OfflineNote } from "@/components/offline/OfflineNote";
import { useOnline } from "@/components/offline/use-online";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CookLogEmpty, CookLogHeader, CookLogItem, CookLogList, MadeItPanel } from "@/components/ui/CookLogKit";
import { ApiError, api, type CookLogEntry, type User } from "@/lib/api";
import { canDelete, cookName, dayLabel, deleteLabel, newestFirst } from "./cook-log-logic";
import { MadeItForm } from "./MadeItForm";

const noop = () => () => undefined;
/** The reader's clock after hydration; null in the server render, so relative day labels never mismatch. */
const useNow = () => useSyncExternalStore(noop, () => new Date(new Date().toDateString()).getTime(), () => null);

type Props = {
  recipeId: string;
  /** As the server read them; `null` when they could not be read (the page still renders). */
  initial: CookLogEntry[] | null;
  me: Pick<User, "id" | "role"> | null;
};

/**
 * The recipe page's "Made it" section (REC-6): who cooked it and when, newest first, with what they would change.
 * Anyone signed in can add an entry; the member who made one (or an admin) can delete it. Kept offline with the page,
 * so it shows the log as of the last visit; adding and deleting need the server.
 */
export function CookLog({ recipeId, initial, me }: Props) {
  const online = useOnline();
  const midnight = useNow();
  const now = midnight === null ? null : new Date();
  const [entries, setEntries] = useState<CookLogEntry[]>(initial ?? []);
  const [adding, setAdding] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const panel = useRef<HTMLElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (adding) panel.current?.focus({ preventScroll: true });
  }, [adding]);

  function closeForm() {
    setAdding(false);
    requestAnimationFrame(() => addButton.current?.focus());
  }

  async function remove(entry: CookLogEntry) {
    setDeleting(entry.id);
    setFailure(null);
    try {
      await api.deleteCookLogEntry(recipeId, entry.id);
      setEntries((list) => list.filter((e) => e.id !== entry.id));
      // Cleared first, so a second delete with the same words is announced again.
      setStatus("");
      requestAnimationFrame(() => setStatus(`Removed the entry for ${dayLabel(entry.cookedOn)}.`));
      addButton.current?.focus();
    } catch (e) {
      setFailure(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
    }
    setDeleting(null);
  }

  return (
    <section aria-labelledby="made-it" className="flex flex-col gap-6 print:hidden">
      <CookLogHeader
        id="made-it"
        count={entries.length}
        action={
          !adding && (
            <Button ref={addButton} variant="secondary" disabled={!online} aria-describedby={online ? undefined : "made-it-offline"} onClick={() => setAdding(true)}>
              Made it
            </Button>
          )
        }
      />
      <OfflineNote id="made-it-offline">You’re offline. The log shows what was there on your last visit; adding to it needs the server.</OfflineNote>
      {adding && (
        <MadeItPanel ref={panel} label="Log a cook">
          <div
            onKeyDown={(e) => {
              if (e.key === "Escape") closeForm();
            }}
          >
            <MadeItForm
              recipeId={recipeId}
              onCancel={closeForm}
              onSaved={(entry) => {
                setEntries((list) => newestFirst([entry, ...list]));
                setFresh(entry.id);
                setStatus("");
                requestAnimationFrame(() => setStatus(`Logged for ${dayLabel(entry.cookedOn)}.`));
                closeForm();
              }}
            />
          </div>
        </MadeItPanel>
      )}
      {initial === null && entries.length === 0 ? (
        <CookLogEmpty>The log could not be loaded just now.</CookLogEmpty>
      ) : entries.length === 0 ? (
        <CookLogEmpty>Nobody has logged this one yet. Cook it, then note what you’d change.</CookLogEmpty>
      ) : (
        <CookLogList>
          {entries.map((e) => (
            <CookLogItem
              key={e.id}
              fresh={e.id === fresh}
              day={dayLabel(e.cookedOn, now)}
              dateTime={e.cookedOn}
              who={cookName(e, me)}
              note={e.note || undefined}
              action={
                canDelete(e, me) && (
                  <Button variant="danger-text" pending={deleting === e.id} disabled={!online} aria-label={deleteLabel(e, me, dayLabel(e.cookedOn, now))} onClick={() => remove(e)}>
                    Delete
                  </Button>
                )
              }
            />
          ))}
        </CookLogList>
      )}
      {failure && (
        <Alert tone="error" title="Not deleted">
          {failure}
        </Alert>
      )}
      <p role="status" className="sr-only">
        {status}
      </p>
    </section>
  );
}
