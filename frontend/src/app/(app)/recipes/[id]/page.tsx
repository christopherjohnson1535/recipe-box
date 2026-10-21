import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Chip";
import { PageHeader } from "@/components/ui/PageHeader";
import { ServerError } from "@/components/ServerError";
import { ApiError, type Recipe } from "@/lib/api";
import { formatMinutes, groupBySection } from "@/lib/recipe";
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
        <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer" className="link break-words">
          {recipe.sourceName || (URL.canParse(recipe.sourceUrl) ? new URL(recipe.sourceUrl).hostname : recipe.sourceUrl)}
        </a>
      ) : (
        (recipe.sourceName ?? recipe.sourceUrl)
      )
    ) : null;
  // A short description reads as the deck under the headline; a long one opens the article with a drop cap.
  const description = recipe.description?.trim() || "";
  const deck = description.length > 0 && description.length <= 160 ? description : undefined;
  const lede = description.length > 160 ? description : undefined;

  return (
    <article className="flex flex-col gap-10">
      <PageHeader
        align="center"
        kicker={
          recipe.tags.length > 0 ? (
            <ul className="dot-list flex flex-wrap justify-center" aria-label="Tags">
              {recipe.tags.map((t) => (
                <li key={t}>
                  <Badge>{t}</Badge>
                </li>
              ))}
            </ul>
          ) : undefined
        }
        title={recipe.title}
        description={deck}
        byline={
          recipe.createdBy || source ? (
            <p className="dot-list flex flex-wrap justify-center">
              {recipe.createdBy && <span>Added by {recipe.createdBy.displayName}</span>}
              {source && <span className="text-small font-normal normal-case italic tracking-normal">Source: {source}</span>}
            </p>
          ) : undefined
        }
        actions={
          <>
            <ButtonLink href={`/recipes/${id}/cook`}>Start cooking</ButtonLink>
            <ButtonLink href={`/recipes/${id}/edit`} variant="secondary">
              Edit
            </ButtonLink>
          </>
        }
      />

      {meta.length > 0 && (
        <dl className="label dot-list -mt-4 flex flex-wrap justify-center gap-y-2 text-ink">
          {meta.map((m) => (
            <div key={m.label}>
              <dt className="inline text-ink-muted">{m.label}</dt> <dd className="inline">{m.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {recipe.imageUrl && (
        <figure className="mx-auto w-full max-w-measure-wide">
          <img
            src={recipe.imageUrl}
            alt={recipe.title}
            width={1200}
            height={800}
            fetchPriority="high"
            className="aspect-[3/2] h-auto max-h-[36rem] w-full object-cover"
          />
        </figure>
      )}

      {lede && <p className="drop-cap mx-auto max-w-measure text-deck text-ink">{lede}</p>}

      <div className="mx-auto grid w-full max-w-measure-wide grid-cols-1 gap-12 md:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] md:gap-14">
        <aside aria-labelledby="ingredients" className="flex flex-col gap-4 self-start bg-paper-deep px-5 pt-1 pb-6 sm:px-6">
          <div className="rule-double -mx-5 sm:-mx-6" aria-hidden="true" />
          <h2 id="ingredients" className="label pt-3 text-ink">
            Ingredients
          </h2>
          {recipe.ingredients.length === 0 && <p className="text-ink-muted italic">No ingredients listed.</p>}
          {groupBySection(recipe.ingredients).map((g, i) => (
            <div key={i} className="flex flex-col gap-1">
              {g.section && <h3 className="text-small pt-2 font-semibold text-ink italic">{g.section}</h3>}
              <ul className="flex flex-col divide-y divide-rule">
                {g.items.map((ing, j) => (
                  <li key={j} className="py-2.5 text-body leading-snug">
                    {ing.text}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>

        <section aria-labelledby="steps" className="flex max-w-measure flex-col gap-6">
          <h2 id="steps" className="flex items-center gap-4 font-display text-title text-ink">
            Method
            <span className="h-px flex-1 bg-rule" aria-hidden="true" />
          </h2>
          {recipe.steps.length === 0 && <p className="text-ink-muted italic">No steps listed.</p>}
          {groupBySection(recipe.steps).map((g, i) => (
            <div key={i} className="flex flex-col gap-4">
              {g.section && <h3 className="label text-accent">{g.section}</h3>}
              <ol className="flex flex-col gap-6">
                {g.items.map((s, j) => (
                  <li key={j} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 sm:grid-cols-[2.75rem_minmax(0,1fr)]">
                    <span className="font-display text-[1.75rem] leading-none text-accent tabular-nums">
                      {j + 1}
                    </span>
                    <p className="text-body">{s.text}</p>
                  </li>
                ))}
              </ol>
            </div>
          ))}

          {recipe.notes && (
            <section aria-labelledby="notes" className="mt-4 flex flex-col gap-3 border-t border-rule pt-6">
              <h2 id="notes" className="label text-ink">
                Notes
              </h2>
              <p className="whitespace-pre-line text-body text-ink-muted italic">{recipe.notes}</p>
            </section>
          )}
        </section>
      </div>
    </article>
  );
}
