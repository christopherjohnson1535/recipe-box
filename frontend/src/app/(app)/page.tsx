import { ButtonLink, Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { RecipeCard } from "@/components/RecipeCard";
import { ServerError } from "@/components/ServerError";
import { firstParam, type SearchParams } from "@/lib/nav";
import { serverApi } from "@/lib/server-api";

function homeHref(q: string, tag?: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (tag) params.set("tag", tag);
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = firstParam(sp.q)?.trim() ?? "";
  const tag = firstParam(sp.tag) ?? "";
  const header = (count?: number) => (
    <PageHeader
      kicker="The collection"
      title="Recipes"
      description={
        count === undefined ? undefined : `${count} ${count === 1 ? "recipe" : "recipes"} in your household’s box.`
      }
      actions={
        <>
          <ButtonLink href="/recipes/new">Add recipe</ButtonLink>
          <ButtonLink href="/import" variant="secondary">
            Import
          </ButtonLink>
        </>
      }
    />
  );

  const api = await serverApi();
  let result;
  try {
    // shortcut: first page only (limit 50), add paging when a household passes ~50 recipes (FND issues)
    result = await Promise.all([api.listRecipes({ q, tag }), api.listTags()]);
  } catch (e) {
    return (
      <div className="flex flex-col gap-8">
        {header()}
        <ServerError error={e} />
      </div>
    );
  }
  const [{ items, total }, tags] = result;
  const filtered = Boolean(q || tag);

  if (total === 0 && !filtered) {
    return (
      <div className="flex flex-col gap-8">
        {header()}
        <EmptyState
          title="No recipes yet"
          actions={
            <>
              <ButtonLink href="/import">Import from a link</ButtonLink>
              <ButtonLink href="/recipes/new" variant="secondary">
                Type one in
              </ButtonLink>
            </>
          }
        >
          <p>Paste a link from a recipe site, snap a cookbook page, or type in a family favourite.</p>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {header(filtered ? undefined : total)}

      <div className="flex flex-col gap-3">
        <form role="search" action="/" className="flex max-w-xl gap-2">
          <label htmlFor="q" className="sr-only">
            Search recipes
          </label>
          <Input id="q" name="q" type="search" defaultValue={q} placeholder="Search recipes, e.g. lasagne…" />
          {tag && <input type="hidden" name="tag" value={tag} />}
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>

        {tags.length > 0 && (
          <nav aria-label="Filter by tag" className="-mx-gutter overflow-x-auto px-gutter">
            <ul className="flex gap-4">
              <li>
                <Chip href={homeHref(q)} selected={!tag}>
                  All
                </Chip>
              </li>
              {tags.map((t) => (
                <li key={t.name}>
                  <Chip href={homeHref(q, t.name === tag ? undefined : t.name)} selected={t.name === tag}>
                    {t.name}
                    <span className="text-ink-muted">{t.count}</span>
                  </Chip>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="No recipes match"
          actions={
            <ButtonLink href="/" variant="secondary">
              Clear search
            </ButtonLink>
          }
        >
          <p>Try a different word or another tag.</p>
        </EmptyState>
      ) : (
        <section aria-label={filtered ? `${total} matching recipes` : "All recipes"}>
          {filtered && (
            <p className="label mb-2 text-ink-muted">
              {total} {total === 1 ? "match" : "matches"}
            </p>
          )}
          <ul className="grid grid-cols-1 gap-x-14 border-b border-rule lg:grid-cols-2">
            {items.map((r) => (
              <li key={r.id}>
                <RecipeCard recipe={r} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
