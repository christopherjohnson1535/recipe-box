"use client";

import { useRouter } from "next/navigation";
import { showSaveStamp } from "@/components/ui/save-stamp-store";
import { showNotice } from "@/components/undo/undo-store";
import { api, type Recipe, type RecipeInput } from "@/lib/api";
import { RecipeForm } from "./RecipeForm";

/** Creates a recipe, or replaces `recipe` when given, then opens it. */
export function RecipeEditor({ recipe }: { recipe?: Recipe }) {
  const router = useRouter();
  async function save(input: RecipeInput) {
    const saved = recipe ? await api.updateRecipe(recipe.id, input) : await api.createRecipe(input);
    if (recipe) showNotice("Saved.");
    else showSaveStamp();
    router.push(`/recipes/${saved.id}`);
  }
  return (
    <RecipeForm
      initial={recipe}
      submitLabel={recipe ? "Save changes" : "Save recipe"}
      onSubmit={save}
      draftKey={recipe?.id ?? "new"}
      cancelHref={recipe ? `/recipes/${recipe.id}` : "/"}
    />
  );
}
