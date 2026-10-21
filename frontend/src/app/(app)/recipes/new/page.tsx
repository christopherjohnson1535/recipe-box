import type { Metadata } from "next";
import { RecipeEditor } from "@/components/recipe-form/RecipeEditor";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Add a recipe" };

export default function NewRecipePage() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader kicker="The collection" title="Add a recipe" description="Type it in, or paste a list and it is split into lines." />
      <RecipeEditor />
    </div>
  );
}
