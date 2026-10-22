"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ApiError, api as browserApi } from "@/lib/api";
import { Toast, ToastAction, ToastDismiss, ToastRegion } from "@/components/ui/Toast";
import { dismissUndo, useUndoOffers, type UndoOffer } from "./undo-store";

export const UNDO_MS = 10_000;
export const NOTICE_MS = 5_000;
const MAX_VISIBLE = 3;

type Api = Pick<typeof browserApi, "restoreRecipe">;

/**
 * Mounted once in the app layout: one "Deleted ... Undo" toast per delete, stacked with the newest on top (three show,
 * older ones keep running unseen). Offers are dropped when the layout unmounts, so they never reach another sign-in.
 */
export function UndoToast({ api = browserApi }: { api?: Api }) {
  const offers = useUndoOffers();
  useEffect(() => () => dismissUndo(), []);
  return (
    <ToastRegion>
      {offers
        .map((offer, i) => (
          offers.length - i > MAX_VISIBLE ? (
            <div key={offer.seq} hidden>
              <UndoBody offer={offer} api={api} />
            </div>
          ) : (
            <div key={offer.seq} className="contents">
              <UndoBody offer={offer} api={api} />
            </div>
          )
        ))
        .reverse()}
    </ToastRegion>
  );
}

function UndoBody({ offer, api }: { offer: UndoOffer; api: Api }) {
  const router = useRouter();
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; retry: boolean } | null>(null);
  const remaining = useRef(offer.notice ? NOTICE_MS : UNDO_MS);

  // The countdown runs only while nobody is pointing at or focused in the toast, and stops once undo has failed.
  const running = !hover && !focus && !busy && !error;
  useEffect(() => {
    if (!running) return;
    const start = Date.now();
    const timer = setTimeout(() => dismissUndo(offer.seq), Math.max(0, remaining.current));
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - start;
    };
  }, [running, offer.seq]);

  async function undo() {
    setBusy(true);
    setError(null);
    try {
      await api.restoreRecipe(offer.id);
      dismissUndo(offer.seq);
      router.push(`/recipes/${offer.id}`);
    } catch (e) {
      setBusy(false);
      setError(
        e instanceof ApiError && e.status === 409
          ? { message: `Too late to undo: “${offer.title}” can no longer be restored.`, retry: false }
          : { message: `Couldn't restore “${offer.title}”. Try again.`, retry: true },
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
          {!offer.notice && (!error || error.retry) && (
            <ToastAction onClick={undo} disabled={busy}>
              {busy ? "Restoring…" : "Undo"}
            </ToastAction>
          )}
          <ToastDismiss onClick={() => dismissUndo(offer.seq)} />
        </>
      }
    >
      {offer.notice ?? (error ? error.message : `Deleted “${offer.title}”.`)}
    </Toast>
  );
}
