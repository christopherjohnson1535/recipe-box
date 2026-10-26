import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FormHelp } from "@/components/recipe-form/FormHelp";
import { RecipeEditor } from "@/components/recipe-form/RecipeEditor";
import { WithAside } from "@/components/ui/Columns";
import { ServerError } from "@/components/ServerError";
import { PageHeader } from "@/components/ui/PageHeader";
import { ApiError } from "@/lib/api";
import { serverApi } from "@/lib/server-api";

export const metadata: Metadata = { title: "Edit recipe" };

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let recipe;
  try {
    recipe = await (await serverApi()).getRecipe(id);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    return <ServerError error={e} />;
  }
  return (
    <div className="flex flex-col gap-10">
      <PageHeader kicker="Editing" title={recipe.title} description="Change anything, then save. Nothing changes until you do." />
      <WithAside sticky aside={<FormHelp editing />}>
        <RecipeEditor recipe={recipe} />
      </WithAside>
    </div>
  );
}
