import type { Metadata } from "next";
import { FormHelp } from "@/components/recipe-form/FormHelp";
import { RecipeEditor } from "@/components/recipe-form/RecipeEditor";
import { WithAside } from "@/components/ui/Columns";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Add a recipe" };

export default function NewRecipePage() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader kicker="Recipes" title="Add a recipe" description="Type it in, or paste a list and it is split into lines." />
      <WithAside sticky aside={<FormHelp />}>
        <RecipeEditor />
      </WithAside>
    </div>
  );
}
