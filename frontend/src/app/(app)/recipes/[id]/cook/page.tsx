import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CookMode } from "@/components/cook/CookMode";
import { ServerError } from "@/components/ServerError";
import { ApiError, type Recipe } from "@/lib/api";
import { serverApi } from "@/lib/server-api";

type Params = { params: Promise<{ id: string }> };

// cache(): generateMetadata and the page share one API call per request.
const loadRecipe = cache(async (id: string): Promise<Recipe | { error: unknown }> => {
  try {
    return await (await serverApi()).getRecipe(id);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    return { error: e };
  }
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const recipe = await loadRecipe((await params).id);
  return { title: "error" in recipe ? "Cooking mode" : `Cooking ${recipe.title}` };
}

export default async function CookPage({ params }: Params) {
  const { id } = await params;
  const recipe = await loadRecipe(id);
  if ("error" in recipe) return <ServerError error={recipe.error} />;
  return <CookMode id={id} title={recipe.title} ingredients={recipe.ingredients.map((i) => i.text)} steps={recipe.steps.map((s) => s.text)} />;
}
