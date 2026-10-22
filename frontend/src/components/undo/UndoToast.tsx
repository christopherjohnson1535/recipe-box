"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ApiError, api as browserApi } from "@/lib/api";
import { Toast, ToastAction, ToastDismiss, ToastRegion } from "@/components/ui/Toast";
import { dismissUndo, useUndoOffer, type UndoOffer } from "./undo-store";

export const UNDO_MS = 10_000;

type Api = Pick<typeof browserApi, "restoreRecipe">;

/** Mounted once in the app layout: shows "Deleted … Undo" for 10 s after a recipe is deleted, on whatever page. */
export function UndoToast({ api = browserApi }: { api?: Api }) {
  const offer = useUndoOffer();
  return <ToastRegion>{offer && <UndoBody key={offer.seq} offer={offer} api={api} />}</ToastRegion>;
}

function UndoBody({ offer, api }: { offer: UndoOffer; api: Api }) {
  const router = useRouter();
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; retry: boolean } | null>(null);
  const remaining = useRef(UNDO_MS);

  // The countdown runs only while nobody is pointing at or focused in the toast, and stops once undo has failed.
  const running = !hover && !focus && !busy && !error;
  useEffect(() => {
    if (!running) return;
    const start = Date.now();
    const timer = setTimeout(dismissUndo, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - start;
    };
  }, [running]);

  async function undo() {
    setBusy(true);
    setError(null);
    try {
      await api.restoreRecipe(offer.id);
      dismissUndo();
      router.push(`/recipes/${offer.id}`);
    } catch (e) {
      setBusy(false);
      setError(
        e instanceof ApiError && e.status === 409
          ? { message: `Too late to undo: "${offer.title}" can no longer be restored.`, retry: false }
          : { message: `Couldn't restore "${offer.title}". Try again.`, retry: true },
      );
    }
  }

  return (
    <Toast
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={(e) => setFocus(e.currentTarget.contains(e.relatedTarget))}
      actions={
        <>
          {(!error || error.retry) && (
            <ToastAction onClick={undo} disabled={busy}>
              {busy ? "Restoring…" : "Undo"}
            </ToastAction>
          )}
          <ToastDismiss onClick={dismissUndo} />
        </>
      }
    >
      {error ? error.message : `Deleted "${offer.title}".`}
    </Toast>
  );
}
