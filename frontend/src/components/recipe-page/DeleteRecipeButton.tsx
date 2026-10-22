"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { showUndo } from "@/components/undo/undo-store";
import { api as browserApi } from "@/lib/api";

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

  async function remove() {
    setPending(true);
    setFailed(false);
    try {
      await api.deleteRecipe(id);
    } catch {
      setPending(false);
      setFailed(true);
      return;
    }
    showUndo({ id, title });
    router.push("/");
  }

  return (
    <>
      <Button variant="ghost" pending={pending} onClick={remove}>
        {pending ? "Deleting…" : "Delete"}
      </Button>
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
