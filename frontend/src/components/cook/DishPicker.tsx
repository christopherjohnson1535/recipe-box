"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cardIcon } from "@/components/RecipeCard";
import { SelectCard, SelectionBar } from "@/components/ui/GroceryKit";
import { TileGrid } from "@/components/ui/RecipeTile";
import { Text } from "@/components/ui/Text";
import { formatMinutes, plateSrc } from "@/lib/recipe";
import type { RecipeSummary } from "@/lib/api";
import { cookTogetherHref, MAX_DISHES } from "./cook-together-logic";

/**
 * Choose two to four recipes to cook at the same time. `initial` is the recipe(s) you came from, already chosen; the
 * order of choosing is the order of the dishes. "Start cooking" opens /cook with them.
 */
export function DishPicker({ recipes, initial }: { recipes: RecipeSummary[]; initial: string[] }) {
  const router = useRouter();
  const start = initial.filter((id) => recipes.some((r) => r.id === id)).slice(0, MAX_DISHES);
  const [chosen, setChosen] = useState<readonly string[]>(start);
  const full = chosen.length >= MAX_DISHES;
  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length < MAX_DISHES ? [...c, id] : c));

  return (
    <div className="flex flex-col gap-8">
      <Text variant="note">{full ? "Up to four dishes at a time." : "Tap the recipes you want to cook together."}</Text>
      <TileGrid>
        {recipes.map((r) => (
          <SelectCard
            key={r.id}
            title={r.title}
            kicker={r.tags.slice(0, 2).join(" · ")}
            time={formatMinutes(r.totalMinutes)}
            imageSrc={plateSrc(r)}
            fallbackIcon={cardIcon(r)}
            selected={chosen.includes(r.id)}
            onToggle={() => toggle(r.id)}
          />
        ))}
      </TileGrid>
      <SelectionBar
        status={full ? "Up to four dishes" : chosen.length === 0 ? "None chosen" : `${chosen.length} chosen`}
        action="Start cooking"
        onAction={() => router.push(cookTogetherHref(chosen))}
        actionDisabled={chosen.length < 2}
        cancel="Cancel"
        onCancel={() => router.push(start.length === 1 ? `/recipes/${start[0]}` : "/")}
      />
    </div>
  );
}
