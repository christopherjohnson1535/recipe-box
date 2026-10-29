import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Arrive } from "@/components/ui/Arrive";
import { Lede, PlateCaption, SidebarLayout } from "@/components/ui/Article";
import { ArrowLink, ButtonLink } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Chip";
import { DotList } from "@/components/ui/DotList";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { Heading } from "@/components/ui/Heading";
import { MethodHeader, MethodStep } from "@/components/ui/Method";
import { NumeralsBand } from "@/components/ui/NumeralsBand";
import { recipeArrivalKey } from "@/components/ui/morph";
import { PullQuote } from "@/components/ui/PullQuote";
import { SpreadOpener } from "@/components/ui/SpreadOpener";
import { SpotIcon } from "@/components/ui/SpotIcon";
import { iconForTag } from "@/components/ui/spot-icons";
import { Text } from "@/components/ui/Text";
import { ServerError } from "@/components/ServerError";
import { KeepOffline } from "@/components/offline/KeepOffline";
import { ApiError, type Recipe } from "@/lib/api";
import { formatMinutes, groupBySection, plateSrc, minuteNumeral } from "@/lib/recipe";
import { splitIngredient } from "@/lib/scale";
import { serverApi } from "@/lib/server-api";
import { bylines } from "@/components/recipe-page/byline";
import { LocalDate } from "@/components/recipe-page/LocalDate";
import { DeleteRecipeButton } from "@/components/recipe-page/DeleteRecipeButton";
import { cookTogetherHref } from "@/components/cook/cook-together-logic";
import { AddToGroceries } from "@/components/recipe-page/AddToGroceries";
import { IngredientChecklist } from "@/components/recipe-page/IngredientChecklist";
import { RecipeBar } from "@/components/recipe-page/RecipeBar";
import { RecipeStateProvider, ScaledServings } from "@/components/recipe-page/RecipeState";
import { StepText } from "@/components/recipe-page/StepText";

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

  const times = [
    { label: "Prep", minutes: recipe.prepMinutes },
    { label: "Cook", minutes: recipe.cookMinutes },
    { label: "Total", minutes: recipe.totalMinutes },
  ].flatMap(({ label, minutes }) => {
    const n = minuteNumeral(minutes);
    return n ? [{ label, parts: n, spoken: formatMinutes(minutes) ?? undefined }] : [];
  });
  const servings = recipe.servings?.trim();
  // A bare number or range is set as a big numeral; a phrase ("makes about 4 bowls") as smaller text.
  const servingsText = servings ? splitIngredient(servings).quantity !== servings : false;
  const numerals = [...(servings ? [{ label: "Serves", value: <ScaledServings servings={servings} />, text: servingsText }] : []), ...times];

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
  const ingredientLines = recipe.ingredients.map((i) => i.text);
  const ingredientGroups = groupBySection(recipe.ingredients.map((ing, index) => ({ ...ing, index })));
  const notes = recipe.notes.trim();
  // Steps are numbered straight through the sections.
  const stepGroups = groupBySection(recipe.steps.map((s, number) => ({ ...s, number })));

  return (
    <Arrive as="article" arriveKey={recipeArrivalKey(id)} className="flex flex-col gap-10 pb-28">
      <KeepOffline />
      <RecipeStateProvider id={id}>
        <SpreadOpener
          morphId={id}
          kicker={
            recipe.tags.length > 0 ? (
              <DotList label="Tags">
                {recipe.tags.map((t) => (
                  <li key={t}>
                    <Badge>{t}</Badge>
                  </li>
                ))}
              </DotList>
            ) : undefined
          }
          title={recipe.title}
          deck={deck}
          icon={<SpotIcon name={iconForTag(recipe.tags[0] ?? "")} size={72} />}
          photo={recipe.imageUrl ? { src: plateSrc(recipe) as string, alt: `${recipe.title}, photo` } : undefined}
          byline={
            by.length > 0 || source ? (
              <DotList as="p" stackOnPhone>
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
              <ButtonLink href={`/recipes/${id}/cook`} className="w-full sm:w-auto">
                Start cooking
              </ButtonLink>
              <ArrowLink href={cookTogetherHref([id])}>Cook together</ArrowLink>
              <ArrowLink href={`/recipes/${id}/edit`}>Edit</ArrowLink>
              <DeleteRecipeButton id={id} title={recipe.title} />
            </>
          }
        />
        {recipe.imageUrl && <PlateCaption href={recipe.imageUrl} />}

        <NumeralsBand items={numerals} />

        {lede && <Lede>{lede}</Lede>}

        <SidebarLayout
          sidebar={<IngredientChecklist groups={ingredientGroups} footer={<AddToGroceries recipeId={id} />} />}
          rail={
            notes ? (
              <PullQuote caption={recipe.createdBy ? `${recipe.createdBy.displayName}’s note on this recipe` : "Note on this recipe"} short={notes.length <= 140 && !notes.includes("\n")}>
                {notes}
              </PullQuote>
            ) : undefined
          }
        >
          <section aria-labelledby="steps" className="flex min-w-0 flex-col gap-8">
            <MethodHeader steps={recipe.steps.length} />
            {recipe.steps.length === 0 && <Text variant="note">No steps listed.</Text>}
            {stepGroups.map((g, i) => (
              <div key={i} className="flex flex-col gap-3">
                {g.section && (
                  <Heading level={3} size="kicker">
                    {g.section}
                  </Heading>
                )}
                <ol className="flex flex-col gap-6" start={g.items[0].number + 1}>
                  {g.items.map((s) => (
                    <MethodStep key={s.number} number={s.number + 1}>
                      <StepText text={s.text} ingredients={ingredientLines} />
                    </MethodStep>
                  ))}
                </ol>
              </div>
            ))}

          </section>
        </SidebarLayout>

        <RecipeBar id={id} total={recipe.ingredients.length} />
      </RecipeStateProvider>
    </Arrive>
  );
}
