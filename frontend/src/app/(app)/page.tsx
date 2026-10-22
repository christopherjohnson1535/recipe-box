import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { Contents } from "@/components/ui/Contents";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { RecipeCard } from "@/components/RecipeCard";
import { NoMatches, ResultSummary } from "@/components/search/ResultSummary";
import { SearchControls } from "@/components/search/SearchControls";
import { homeHref, parseSort } from "@/components/search/url";
import { ServerError } from "@/components/ServerError";
import { firstParam, type SearchParams } from "@/lib/nav";
import { serverApi } from "@/lib/server-api";

export const metadata: Metadata = { title: "Recipes" };

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = firstParam(sp.q)?.trim() ?? "";
  const tag = firstParam(sp.tag) ?? "";
  const sort = parseSort(firstParam(sp.sort));
  const header = (count?: number) => (
    <PageHeader
      kicker="The collection"
      title="Recipes"
      reserveDeck
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
    result = await Promise.all([api.listRecipes({ q, tag, sort }), api.listTags()]);
  } catch (e) {
    return (
      <div className="flex flex-col gap-8">
        {header()}
        {/* Same position and shape as the success layout, so the input keeps its text and focus. */}
        <div className="flex flex-col gap-3">
          <SearchControls q={q} tag={tag} sort={sort} />
        </div>
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
        <SearchControls q={q} tag={tag} sort={sort} />

        {tags.length > 0 && (
          <ChipRow label="Filter by tag">
            <li>
              <Chip href={homeHref({ q, sort })} selected={!tag}>
                All
              </Chip>
            </li>
            {tags.map((t) => (
              <li key={t.name}>
                <Chip
                  href={homeHref({
                    q,
                    tag: t.name === tag ? undefined : t.name,
                    sort,
                  })}
                  selected={t.name === tag}
                  count={t.count}
                >
                  {t.name}
                </Chip>
              </li>
            ))}
          </ChipRow>
        )}
      </div>

      {items.length === 0 ? (
        <NoMatches q={q} tag={tag} />
      ) : (
        <section aria-label={filtered ? `${total} matching recipes` : "All recipes"} className="flex flex-col gap-2">
          {filtered && <ResultSummary total={total} q={q} tag={tag} />}
          <Contents>
            {items.map((r) => (
              <RecipeCard key={r.id} recipe={r} />
            ))}
          </Contents>
        </section>
      )}
    </div>
  );
}
