import type { Metadata } from "next";
import { cache } from "react";
import { CookTogether } from "@/components/cook/CookTogether";
import { DishPicker } from "@/components/cook/DishPicker";
import { parseRecipeIds } from "@/components/cook/cook-together-logic";
import { ServerError } from "@/components/ServerError";
import { KeepOffline } from "@/components/offline/KeepOffline";
import { Arrive } from "@/components/ui/Arrive";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SpotIcon } from "@/components/ui/SpotIcon";
import { ApiError, type Recipe, type RecipeSummary } from "@/lib/api";
import { PIN_EVENING_SCRIPT } from "@/lib/edition";
import type { SearchParams } from "@/lib/nav";
import { serverApi } from "@/lib/server-api";

// cache(): generateMetadata and the page share one load per request. The key is the ids, comma-joined.
const load = cache(async (key: string): Promise<{ recipes: Recipe[]; others: RecipeSummary[] } | { error: unknown }> => {
  const ids = key ? key.split(",") : [];
  try {
    const api = await serverApi();
    const found = (
      await Promise.all(
        ids.map((id) =>
          api.getRecipe(id).catch((e: unknown) => {
            // A recipe that was deleted (or never was) just is not part of the session.
            if (e instanceof ApiError && (e.status === 404 || e.status === 400)) return null;
            throw e;
          }),
        ),
      )
    ).filter((r) => r !== null);
    // Only the picker needs the list. shortcut: the first 200 recipes (the API's page limit), add search to the picker when a household passes that.
    const others = found.length < 2 ? (await api.listRecipes({ sort: "title", limit: 200 })).items : [];
    return { recipes: found, others };
  } catch (e) {
    return { error: e };
  }
});

const keyOf = async (searchParams: SearchParams) => parseRecipeIds((await searchParams).recipes).join(",");

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const loaded = await load(await keyOf(searchParams));
  return { title: "error" in loaded || loaded.recipes.length < 2 ? "Cook together" : "Cooking together" };
}

export default async function CookTogetherPage({ searchParams }: { searchParams: SearchParams }) {
  const loaded = await load(await keyOf(searchParams));
  if ("error" in loaded) return <ServerError error={loaded.error} />;
  const { recipes, others } = loaded;

  if (recipes.length >= 2) {
    return (
      <>
        <KeepOffline />
        {/* Pins the evening edition before first paint on a hard load; CookStage keeps it pinned after hydration. */}
        <script dangerouslySetInnerHTML={{ __html: PIN_EVENING_SCRIPT }} />
        <CookTogether dishes={recipes.map((r) => ({ id: r.id, title: r.title, ingredients: r.ingredients.map((i) => i.text), steps: r.steps.map((s) => s.text) }))} />
      </>
    );
  }

  // The recipe you came from may be past the first page of the list: it is still on the table.
  const list = [...recipes.filter((r) => !others.some((o) => o.id === r.id)), ...others];
  return (
    <Arrive arriveKey="cook-together" className="flex flex-col gap-10">
      <PageHeader title="Cook together" description="Choose two to four dishes to cook at the same time." />
      {list.length < 2 ? (
        <EmptyState
          title={list.length === 0 ? "No recipes yet" : "One recipe so far"}
          icon={<SpotIcon name="mains" size={40} />}
          actions={<ButtonLink href="/import">Import from a link</ButtonLink>}
        >
          <p>Cooking together needs at least two recipes in the box.</p>
        </EmptyState>
      ) : (
        <DishPicker recipes={list} initial={recipes.map((r) => r.id)} />
      )}
    </Arrive>
  );
}
