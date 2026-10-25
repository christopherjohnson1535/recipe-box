"use client";

import { useState } from "react";
import { scaleLabel } from "@/components/groceries/scale-steps";
import { OfflineNote } from "@/components/offline/OfflineNote";
import { useOnline } from "@/components/offline/use-online";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { TextLink } from "@/components/ui/TextLink";
import { ApiError, api } from "@/lib/api";
import { useRecipeState } from "./RecipeState";

/** Puts this recipe on the household's grocery list at the scale the ingredients are showing (½× / 1× / 2×). Adding it again sets the scale. */
export function AddToGroceries({ recipeId }: { recipeId: string }) {
  const { scale } = useRecipeState();
  const online = useOnline();
  const [pending, setPending] = useState(false);
  const [added, setAdded] = useState<number | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function add() {
    setPending(true);
    setFailure(null);
    try {
      await api.addGroceryRecipe(recipeId, scale);
      setAdded(scale);
    } catch (e) {
      setAdded(null);
      setFailure(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
    }
    setPending(false);
  }

  return (
    <div className="flex flex-col gap-3 print:hidden">
      <Button variant="secondary" className="max-sm:w-full" pending={pending} disabled={!online} aria-describedby={online ? undefined : "groceries-add-offline"} onClick={add}>
        {pending ? "Adding…" : "Add to groceries"}
      </Button>
      <OfflineNote id="groceries-add-offline">You’re offline. Adding to the list needs the server; try again once you’re back online.</OfflineNote>
      <div role="status">
        {added !== null && (
          <Text variant="small">
            On your grocery list at {scaleLabel(added)}. <TextLink href="/groceries">Open the list</TextLink>
          </Text>
        )}
      </div>
      {failure && (
        <Alert tone="error" title="Not added">
          {failure}
        </Alert>
      )}
    </div>
  );
}
