"use client";

import { IngredientGroup, IngredientPanel, IngredientRow, ScaleControl } from "@/components/ui/IngredientPanel";
import { Text } from "@/components/ui/Text";
import { scaleQuantity, splitIngredient } from "@/lib/scale";
import { useRecipeState } from "./RecipeState";

const OPTIONS = [
  { value: 0.5, label: "½×" },
  { value: 1, label: "1×" },
  { value: 2, label: "2×" },
];

type Group = { section: string | null; items: { index: number; text: string }[] };

/** The ingredient panel: tap a row to tick it off, scale the amounts with ½× / 1× / 2×. State lives in `RecipeStateProvider`. */
export function IngredientChecklist({ groups }: { groups: Group[] }) {
  const { ticked, toggle, scale, setScale, rescaled } = useRecipeState();
  return (
    <IngredientPanel id="ingredients" scale={<ScaleControl value={scale} options={OPTIONS} onChange={setScale} />}>
      {/* Heard when the scale changes (nothing is announced on first load). */}
      <p role="status" className="sr-only">
        {rescaled ? `Scaled to ${OPTIONS.find((o) => o.value === scale)?.label}` : ""}
      </p>
      {groups.length === 0 && <Text variant="note">No ingredients listed.</Text>}
      {groups.map((g, i) => (
        <IngredientGroup key={i} title={g.section}>
          {g.items.map(({ index, text }) => {
            const { quantity, rest } = splitIngredient(text);
            return (
              <IngredientRow
                key={index}
                index={index}
                quantity={quantity && scaleQuantity(quantity, scale)}
                fade={rescaled}
                checked={ticked.has(index)}
                onToggle={() => toggle(index)}
              >
                {rest}
              </IngredientRow>
            );
          })}
        </IngredientGroup>
      ))}
    </IngredientPanel>
  );
}
