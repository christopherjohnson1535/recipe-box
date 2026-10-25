"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { OfflineNote } from "@/components/offline/OfflineNote";
import { useOnline } from "@/components/offline/use-online";
import { showNotice, showUndo } from "@/components/undo/undo-store";
import { ApiError, api as browserApi } from "@/lib/api";

/** Deletes at once (no dialog: the Undo toast is the safety net), then goes home where the toast is shown. */
export function DeleteRecipeButton({
  id,
  title,
  api = browserApi,
}: {
  id: string;
  title: string;
  api?: Pick<typeof browserApi, "deleteRecipe">;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const online = useOnline();

  async function remove() {
    setPending(true);
    setFailed(false);
    try {
      await api.deleteRecipe(id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        // Already deleted (another tab or device): nothing to undo from here.
        showNotice("That recipe was already deleted.");
        router.push("/");
        router.refresh();
        return;
      }
      setPending(false);
      setFailed(true);
      return;
    }
    showUndo({ id, title });
    router.push("/");
    // Belt and braces: never let the client cache show the list with the recipe we just deleted (Q1-01).
    router.refresh();
  }

  return (
    <>
      <Button variant="ghost" pending={pending} disabled={!online} aria-describedby={online ? undefined : "delete-offline"} onClick={remove}>
        {pending ? "Deleting…" : "Delete"}
      </Button>
      <OfflineNote id="delete-offline">You’re offline. Deleting needs the server; try again once you’re back online.</OfflineNote>
      {failed && (
        <div className="w-full max-w-measure text-left">
          <Alert tone="error" title="Not deleted">
            The recipe is still in your box. Try again.
          </Alert>
        </div>
      )}
    </>
  );
}
