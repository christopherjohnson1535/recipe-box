"use client";

import { FloatingBar } from "@/components/ui/FloatingBar";
import { useRecipeState } from "./RecipeState";

/** The floating bar: how many ingredients are ticked, and the way into cooking mode. */
export function RecipeBar({ id, total }: { id: string; total: number }) {
  const { ticked } = useRecipeState();
  const n = [...ticked].filter((i) => i < total).length;
  const status = n === 0 ? "Ready when you are" : `${n} ${n === 1 ? "ingredient" : "ingredients"} checked`;
  return <FloatingBar status={status} href={`/recipes/${id}/cook`} action="Start cooking" />;
}
