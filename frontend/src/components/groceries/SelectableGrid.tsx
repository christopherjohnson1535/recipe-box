"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cookTogetherHref, MAX_DISHES } from "@/components/cook/cook-together-logic";
import { OfflineNote } from "@/components/offline/OfflineNote";
import { useOnline } from "@/components/offline/use-online";
import { RecipeCard, cardIcon } from "@/components/RecipeCard";
import { Button } from "@/components/ui/Button";
import { SelectCard, SelectionBar } from "@/components/ui/GroceryKit";
import { TileGrid } from "@/components/ui/RecipeTile";
import { Text } from "@/components/ui/Text";
import { Toast, ToastDismiss, ToastLink, ToastRegion } from "@/components/ui/Toast";
import { formatMinutes, plateSrc } from "@/lib/recipe";
import { api, type RecipeSummary } from "@/lib/api";

/**
 * The home grid, with a "Select recipes" mode: tap cards to choose them, then "Add N to groceries" puts each on the list
 * at 1×, one request after another (a failure stops nothing: the rest still go, and the ones that failed stay chosen),
 * or "Cook together" opens two to four of them in one cook mode.
 */
export function SelectableGrid({ recipes }: { recipes: RecipeSummary[] }) {
  const online = useOnline();
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [result, setResult] = useState<{ added: number; failed: string[] } | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const selectButton = useRef<HTMLButtonElement>(null);
  const wasSelecting = useRef(false);

  // The button that starts choosing (and, on leaving, the bar's buttons) disappear: put focus on the first card going in
  // and back on "Select recipes" coming out.
  useEffect(() => {
    if (selecting) grid.current?.querySelector<HTMLElement>("button[aria-pressed]")?.focus({ preventScroll: true });
    else if (wasSelecting.current) selectButton.current?.focus();
    wasSelecting.current = selecting;
  }, [selecting]);

  // Only recipes still on screen count: a search or tag filter can drop chosen ones from the grid.
  const picked = recipes.filter((r) => chosen.has(r.id));

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
    for (const r of picked) {
      try {
        await api.addGroceryRecipe(r.id, 1);
        added++;
      } catch {
        failed.push(r.id);
      }
    }
    setAdding(false);
    setResult({ added, failed: failed.map((id) => recipes.find((r) => r.id === id)?.title ?? "a recipe") });
    if (failed.length === 0) stop();
    else setChosen(new Set(failed));
  }

  return (
    <div ref={grid} className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
        {selecting ? (
          <Text variant="note">Tap recipes to shop for or cook together.</Text>
        ) : (
          <Button ref={selectButton} variant="ghost" disabled={!online} aria-describedby={online ? undefined : "select-offline"} onClick={() => setSelecting(true)}>
            Select recipes
          </Button>
        )}
        <OfflineNote id="select-offline">You’re offline. Adding to the grocery list needs the server.</OfflineNote>
      </div>

      <TileGrid>
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
      </TileGrid>

      <ToastRegion lifted={selecting}>
        {result && (
          <Toast
            role={result.failed.length > 0 ? "alert" : undefined}
            actions={
              <>
                {result.added > 0 && <ToastLink href="/groceries">Open the list</ToastLink>}
                <ToastDismiss onClick={() => setResult(null)} />
              </>
            }
          >
            {result.added > 0 && `Added ${result.added} ${result.added === 1 ? "recipe" : "recipes"} to your groceries. `}
            {result.failed.length > 0 && `Couldn’t add ${result.failed.join(", ")}. They’re still chosen: try again.`}
          </Toast>
        )}
      </ToastRegion>

      {selecting && (
        <SelectionBar
          status={picked.length === 0 ? "None chosen" : `${picked.length} chosen`}
          action={adding ? "Adding…" : picked.length === 0 ? "Add to groceries" : `Add ${picked.length} to groceries`}
          onAction={() => void addAll()}
          actionDisabled={picked.length === 0 || adding || !online}
          secondary={{
            label: "Cook together",
            onClick: () => router.push(cookTogetherHref(picked.map((r) => r.id))),
            disabled: picked.length < 2 || picked.length > MAX_DISHES,
          }}
          cancel="Cancel"
          onCancel={stop}
        />
      )}
    </div>
  );
}
