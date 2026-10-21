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

  return (
    <article className="flex flex-col gap-8">
      <PageHeader
        title={recipe.title}
        description={recipe.description || undefined}
        actions={
          <>
            <ButtonLink href={`/recipes/${id}/edit`} variant="secondary">
              Edit
            </ButtonLink>
            <ButtonLink href={`/recipes/${id}/cook`}>Start cooking</ButtonLink>
          </>
        }
      />

      {recipe.imageUrl && (
        <img
          src={recipe.imageUrl}
          alt={recipe.title}
          width={1200}
          height={800}
          fetchPriority="high"
          className="aspect-[3/2] h-auto max-h-[28rem] w-full rounded-card object-cover"
        />
      )}

      {(meta.length > 0 || recipe.tags.length > 0) && (
        <div className="flex flex-col gap-4">
          {meta.length > 0 && (
            <dl className="flex flex-wrap gap-x-8 gap-y-3">
              {meta.map((m) => (
                <div key={m.label} className="flex flex-col">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{m.label}</dt>
                  <dd className="text-lg tabular-nums">{m.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {recipe.tags.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
              {recipe.tags.map((t) => (
                <li key={t}>
                  <Badge>{t}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-10 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section aria-labelledby="ingredients" className="flex flex-col gap-4">
          <h2 id="ingredients" className="text-2xl font-semibold">
            Ingredients
          </h2>
          {recipe.ingredients.length === 0 && <p className="text-muted">No ingredients listed.</p>}
          {groupBySection(recipe.ingredients).map((g, i) => (
            <div key={i} className="flex flex-col gap-2">
              {g.section && <h3 className="text-lg font-semibold">{g.section}</h3>}
              <ul className="flex flex-col divide-y divide-border">
                {g.items.map((ing, j) => (
                  <li key={j} className="py-2">
                    {ing.text}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section aria-labelledby="steps" className="flex flex-col gap-4">
          <h2 id="steps" className="text-2xl font-semibold">
            Method
          </h2>
          {recipe.steps.length === 0 && <p className="text-muted">No steps listed.</p>}
          {groupBySection(recipe.steps).map((g, i) => (
            <div key={i} className="flex flex-col gap-3">
              {g.section && <h3 className="text-lg font-semibold">{g.section}</h3>}
              <ol className="flex list-decimal flex-col gap-4 pl-6 marker:font-semibold marker:text-accent-ink">
                {g.items.map((s, j) => (
                  <li key={j} className="pl-1 leading-relaxed">
                    {s.text}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      </div>

      {recipe.notes && (
        <section aria-labelledby="notes" className="flex flex-col gap-2">
          <h2 id="notes" className="text-2xl font-semibold">
            Notes
          </h2>
          <p className="max-w-prose whitespace-pre-line">{recipe.notes}</p>
        </section>
      )}

      {(recipe.sourceUrl || recipe.sourceName || recipe.createdBy) && (
        <footer className="flex flex-col gap-1 border-t border-border pt-4 text-sm text-muted">
          {(recipe.sourceUrl || recipe.sourceName) && (
            <p>
              Source:{" "}
              {recipe.sourceUrl && /^https?:\/\//i.test(recipe.sourceUrl) ? (
                <a
                  href={recipe.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-words text-accent-ink underline underline-offset-2"
                >
                  {recipe.sourceName || (URL.canParse(recipe.sourceUrl) ? new URL(recipe.sourceUrl).hostname : recipe.sourceUrl)}
                </a>
              ) : (
                (recipe.sourceName ?? recipe.sourceUrl)
              )}
            </p>
          )}
          {recipe.createdBy && <p>Added by {recipe.createdBy.displayName}</p>}
        </footer>
      )}
    </article>
  );
}
