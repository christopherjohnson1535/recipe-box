"use client";

import { useState } from "react";
import { OfflineNote } from "@/components/offline/OfflineNote";
import { useOnline } from "@/components/offline/use-online";
import { RecipeCard, cardIcon } from "@/components/RecipeCard";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectCard, SelectionBar } from "@/components/ui/GroceryKit";
import { CardGrid } from "@/components/ui/MagazineCard";
import { Text } from "@/components/ui/Text";
import { TextLink } from "@/components/ui/TextLink";
import { formatMinutes, plateSrc } from "@/lib/recipe";
import type { RecipeSummary } from "@/lib/api";
import { groceryApi } from "./client";

/**
 * The home grid, with a "Select recipes" mode: tap cards to choose them, then "Add N to groceries" puts each on the list
 * at 1×, one request after another (a failure stops nothing: the rest still go, and the ones that failed stay chosen).
 */
export function SelectableGrid({ recipes }: { recipes: RecipeSummary[] }) {
  const online = useOnline();
  const [selecting, setSelecting] = useState(false);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [result, setResult] = useState<{ added: number; failed: string[] } | null>(null);

  const stop = () => {
    setSelecting(false);
    setChosen(new Set());
  };
  const toggle = (id: string) =>
    setChosen((c) => {
      const next = new Set(c);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  async function addAll() {
    setAdding(true);
    setResult(null);
    const failed: string[] = [];
    let added = 0;
    for (const r of recipes.filter((r) => chosen.has(r.id))) {
      try {
        await groceryApi.addRecipe(r.id, 1);
        added++;
      } catch {
        failed.push(r.id);
      }
    }
    setAdding(false);
    setResult({ added, failed: failed.map((id) => recipes.find((r) => r.id === id)?.title ?? "a recipe") });
    if (failed.length === 0) stop();
    else setChosen(new Set(recipes.filter((r) => failed.includes(r.id)).map((r) => r.id)));
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
        {selecting ? (
          <Text variant="note">Tap the recipes you want to shop for.</Text>
        ) : (
          <Button variant="ghost" disabled={!online} aria-describedby={online ? undefined : "select-offline"} onClick={() => setSelecting(true)}>
            Select recipes
          </Button>
        )}
        <OfflineNote id="select-offline">You’re offline. Adding to the grocery list needs the server.</OfflineNote>
      </div>

      {result && (
        <Alert tone={result.failed.length > 0 ? "error" : "info"} title={result.failed.length > 0 ? "Some didn’t go on the list" : undefined}>
          {result.added > 0 && (
            <>
              Added {result.added} {result.added === 1 ? "recipe" : "recipes"} to your groceries. <TextLink href="/groceries">Open the list</TextLink>
            </>
          )}
          {result.failed.length > 0 && <p>Couldn’t add {result.failed.join(", ")}. They’re still chosen: try again.</p>}
        </Alert>
      )}

      <CardGrid>
        {recipes.map((r, i) =>
          selecting ? (
            <SelectCard
              key={r.id}
              title={r.title}
              kicker={r.tags.slice(0, 2).join(" · ")}
              time={formatMinutes(r.totalMinutes)}
              imageSrc={plateSrc(r)}
              fallbackIcon={cardIcon(r)}
              selected={chosen.has(r.id)}
              onToggle={() => toggle(r.id)}
            />
          ) : (
            <RecipeCard key={r.id} recipe={r} index={i} />
          ),
        )}
      </CardGrid>

      {selecting && <div className="h-16" aria-hidden="true" />}
      {selecting && (
        <SelectionBar
          status={chosen.size === 0 ? "None chosen" : `${chosen.size} chosen`}
          action={adding ? "Adding…" : chosen.size === 0 ? "Add to groceries" : `Add ${chosen.size} to groceries`}
          onAction={() => void addAll()}
          actionDisabled={chosen.size === 0 || adding || !online}
          cancel="Cancel"
          onCancel={stop}
        />
      )}
    </div>
  );
}
