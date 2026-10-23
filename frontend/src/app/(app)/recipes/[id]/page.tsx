import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Arrive } from "@/components/ui/Arrive";
import { EndNote, Lede, LeadPhoto, MetaStrip, RuledList, Sidebar, SidebarLayout, StepList } from "@/components/ui/Article";
import { ButtonLink } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Chip";
import { DotList } from "@/components/ui/DotList";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { Heading } from "@/components/ui/Heading";
import { recipeArrivalKey } from "@/components/ui/morph";
import { PageHeader } from "@/components/ui/PageHeader";
import { SpotIcon } from "@/components/ui/SpotIcon";
import { iconForTag } from "@/components/ui/spot-icons";
import { Text } from "@/components/ui/Text";
import { ServerError } from "@/components/ServerError";
import { ApiError, type Recipe } from "@/lib/api";
import { formatMinutes, groupBySection } from "@/lib/recipe";
import { serverApi } from "@/lib/server-api";
import { bylines } from "@/components/recipe-page/byline";
import { LocalDate } from "@/components/recipe-page/LocalDate";
import { DeleteRecipeButton } from "@/components/recipe-page/DeleteRecipeButton";

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
  return { title: "error" in recipe ? "Recipe" : recipe.title };
}

export default async function RecipePage({ params }: Params) {
  const { id } = await params;
  const recipe = await loadRecipe(id);
  if ("error" in recipe) return <ServerError error={recipe.error} />;

  const meta = [
    { label: "Serves", value: recipe.servings },
    { label: "Prep", value: formatMinutes(recipe.prepMinutes) },
    { label: "Cook", value: formatMinutes(recipe.cookMinutes) },
    { label: "Total", value: formatMinutes(recipe.totalMinutes) },
  ].filter((m) => m.value);

  const source =
    recipe.sourceUrl || recipe.sourceName ? (
      recipe.sourceUrl && /^https?:\/\//i.test(recipe.sourceUrl) ? (
        <ExternalLink href={recipe.sourceUrl}>
          {recipe.sourceName || (URL.canParse(recipe.sourceUrl) ? new URL(recipe.sourceUrl).hostname : recipe.sourceUrl)}
        </ExternalLink>
      ) : (
        (recipe.sourceName ?? recipe.sourceUrl)
      )
    ) : null;
  // A short description reads as the deck under the headline; a long one opens the article with a drop cap.
  const description = recipe.description?.trim() || "";
  const deck = description.length > 0 && description.length <= 160 ? description : undefined;
  const lede = description.length > 160 ? description : undefined;

  const by = bylines(recipe);

  return (
    <Arrive as="article" arriveKey={recipeArrivalKey(id)} className="flex flex-col gap-10">
      <PageHeader
        align="center"
        rise
        morphId={id}
        kicker={
          recipe.tags.length > 0 ? (
            <DotList label="Tags" align="center">
              {recipe.tags.map((t) => (
                <li key={t}>
                  <Badge icon={<SpotIcon name={iconForTag(t)} size={24} />}>{t}</Badge>
                </li>
              ))}
            </DotList>
          ) : undefined
        }
        title={recipe.title}
        description={deck}
        byline={
          by.length > 0 || source ? (
            <DotList as="p" align="center" stackOnPhone>
              {by.map((line) => (
                <span key={line.verb}>
                  {line.verb}
                  {line.who ? ` by ${line.who}` : ""}
                  <LocalDate iso={line.iso} />
                </span>
              ))}
              {source && (
                <Text as="span" variant="aside">
                  Source: {source}
                </Text>
              )}
            </DotList>
          ) : undefined
        }
        actions={
          <>
            <ButtonLink href={`/recipes/${id}/cook`} className="w-full sm:w-auto">Start cooking</ButtonLink>
            <ButtonLink href={`/recipes/${id}/edit`} variant="secondary">
              Edit
            </ButtonLink>
            <DeleteRecipeButton id={id} title={recipe.title} />
          </>
        }
      />

      <MetaStrip items={meta} />

      {recipe.imageUrl && <LeadPhoto src={recipe.imageUrl} alt={recipe.title} morphId={id} />}

      {lede && <Lede>{lede}</Lede>}

      <SidebarLayout
        sidebar={
          <Sidebar title="Ingredients" id="ingredients">
            {recipe.ingredients.length === 0 && <Text variant="note">No ingredients listed.</Text>}
            {groupBySection(recipe.ingredients).map((g, i) => (
              <div key={i} className="flex flex-col gap-1">
                {g.section && (
                  <div className="pt-2">
                    <Heading level={3} size="group">
                      {g.section}
                    </Heading>
                  </div>
                )}
                <RuledList items={g.items.map((ing) => ing.text)} />
              </div>
            ))}
          </Sidebar>
        }
      >
        <section aria-labelledby="steps" className="flex max-w-measure flex-col gap-6">
          <Heading level={2} id="steps" ruled>
            Method
          </Heading>
          {recipe.steps.length === 0 && <Text variant="note">No steps listed.</Text>}
          {groupBySection(recipe.steps).map((g, i) => (
            <div key={i} className="flex flex-col gap-4">
              {g.section && (
                <Heading level={3} size="kicker">
                  {g.section}
                </Heading>
              )}
              <StepList steps={g.items.map((s) => s.text)} />
            </div>
          ))}

          {recipe.notes && (
            <EndNote title="Notes" id="notes">
              <Text variant="note" preserveLines>
                {recipe.notes}
              </Text>
            </EndNote>
          )}
        </section>
      </SidebarLayout>
    </Arrive>
  );
}
