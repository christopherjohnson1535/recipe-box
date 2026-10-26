"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cardIcon } from "@/components/RecipeCard";
import { OfflineNote } from "@/components/offline/OfflineNote";
import { useOnline } from "@/components/offline/use-online";
import { SearchField } from "@/components/ui/SearchField";
import { SelectCard, SelectionBar } from "@/components/ui/GroceryKit";
import { TileGrid } from "@/components/ui/RecipeTile";
import { Text } from "@/components/ui/Text";
import { formatMinutes, plateSrc } from "@/lib/recipe";
import { api, type RecipeSummary } from "@/lib/api";
import { cookTogetherHref, MAX_DISHES } from "./cook-together-logic";

export const PICKER_SEARCH_DEBOUNCE_MS = 250;

/**
 * Choose two to four dishes to cook at the same time. `initial` is the recipe(s) you came from, already chosen; the
 * order of choosing is the order of the dishes. "Start cooking" opens /cook with them. `recipes` is the first page of
 * the box; the search asks the server, so a recipe past that page can still be found. Dishes already chosen stay
 * chosen (and on screen) while the list is filtered.
 */
export function DishPicker({ recipes, initial }: { recipes: RecipeSummary[]; initial: string[] }) {
  const router = useRouter();
  const online = useOnline();
  const start = initial.filter((id) => recipes.some((r) => r.id === id)).slice(0, MAX_DISHES);
  const [chosen, setChosen] = useState<readonly string[]>(start);
  const [query, setQuery] = useState("");
  // The recipes found for `query` (null: not searched, show the first page), and every recipe seen so far, for the chosen ones.
  const [found, setFound] = useState<RecipeSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [known] = useState(() => new Map(recipes.map((r) => [r.id, r])));
  const full = chosen.length >= MAX_DISHES;
  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length < MAX_DISHES ? [...c, id] : c));

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    let live = true;
    const timer = setTimeout(() => {
      api
        .listRecipes({ q, sort: "title", limit: 200 })
        .then((page) => {
          if (!live) return;
          page.items.forEach((r) => known.set(r.id, r));
          setFound(page.items);
          setFailed(false);
        })
        .catch(() => live && setFailed(true));
    }, PICKER_SEARCH_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, known]);

  const searching = query.trim() !== "";
  // Chosen recipes the search did not return stay on screen, first, so the choice never disappears.
  const pinned = found ? chosen.flatMap((id) => (found.some((r) => r.id === id) ? [] : (known.get(id) ?? []))) : [];
  const list = searching && found ? [...pinned, ...found] : recipes;

  const hint = chosen.length === 0 ? "Choose two dishes" : chosen.length === 1 ? "Choose one more dish" : undefined;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <label htmlFor="dish-search" className="sr-only">
          Search recipes
        </label>
        <SearchField
          id="dish-search"
          type="search"
          autoComplete="off"
          placeholder="Search the box…"
          value={query}
          disabled={!online}
          aria-describedby={online ? undefined : "dish-search-offline"}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
            if (!e.currentTarget.value.trim()) setFound(null);
          }}
        />
        <OfflineNote id="dish-search-offline">You’re offline. Searching needs the server.</OfflineNote>
        {failed && searching && (
          <div role="status">
            <Text variant="small">Couldn’t search just now. These are the dishes from the last search.</Text>
          </div>
        )}
      </div>
      <div role="status">
        <Text variant="note" id="dish-cap">
          {full ? "Up to four dishes at a time." : "Tap the dishes you want to cook together."}
        </Text>
      </div>
      {searching && found && list.length === 0 ? (
        <Text variant="note">No dishes match “{query.trim()}”.</Text>
      ) : (
        <TileGrid>
          {list.map((r) => (
            <SelectCard
              key={r.id}
              title={r.title}
              kicker={r.tags.slice(0, 2).join(" · ")}
              time={formatMinutes(r.totalMinutes)}
              imageSrc={plateSrc(r)}
              fallbackIcon={cardIcon(r)}
              selected={chosen.includes(r.id)}
              disabled={full && !chosen.includes(r.id)}
              describedBy="dish-cap"
              onToggle={() => toggle(r.id)}
            />
          ))}
        </TileGrid>
      )}
      <SelectionBar
        status={full ? "Up to four dishes" : chosen.length === 0 ? "None chosen" : `${chosen.length} chosen`}
        hint={hint}
        action="Start cooking"
        onAction={() => router.push(cookTogetherHref(chosen))}
        actionDisabled={chosen.length < 2}
        cancel="Cancel"
        onCancel={() => router.push(start.length === 1 ? `/recipes/${start[0]}` : "/")}
      />
    </div>
  );
}
