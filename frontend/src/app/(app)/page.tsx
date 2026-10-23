import type { Metadata } from "next";
import { Arrive } from "@/components/ui/Arrive";
import { ButtonLink } from "@/components/ui/Button";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { Contents } from "@/components/ui/Contents";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SpotIcon } from "@/components/ui/SpotIcon";
import { RecipeCard } from "@/components/RecipeCard";
import { NoMatches } from "@/components/search/ResultSummary";
import { SearchControls } from "@/components/search/SearchControls";
import { homeHref, parseSort, resultSummary } from "@/components/search/url";
import { ServerError } from "@/components/ServerError";
import { firstParam, type SearchParams } from "@/lib/nav";
import { serverApi } from "@/lib/server-api";

export const metadata: Metadata = { title: "Recipes" };

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = firstParam(sp.q)?.trim() ?? "";
  const tag = firstParam(sp.tag) ?? "";
  const sort = parseSort(firstParam(sp.sort));
  // The deck is the household count, or, while filtering, the live result count (Q1-05: no separate summary line).
  const header = (description?: string, filtered = false) => (
    <PageHeader
      kicker="The collection"
      title="Recipes"
      reserveDeck={!filtered}
      liveDescription={filtered}
      description={description}
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
      <Arrive arriveKey="home" className="flex flex-col gap-8">
        {header(undefined, Boolean(q || tag))}
        {/* Same position and shape as the success layout, so the input keeps its text and focus. */}
        <div className="flex flex-col gap-3">
          <SearchControls q={q} tag={tag} sort={sort} />
        </div>
        <ServerError error={e} />
      </Arrive>
    );
  }
  const [{ items, total }, tags] = result;
  const filtered = Boolean(q || tag);

  if (total === 0 && !filtered) {
    return (
      <Arrive arriveKey="home" className="flex flex-col gap-8">
        {header()}
        <EmptyState
          title="No recipes yet"
          icon={<SpotIcon name="mains" size={40} />}
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
      </Arrive>
    );
  }

  return (
    <Arrive arriveKey="home" className="flex flex-col gap-10">
      {header(
        filtered
          ? total > 0
            ? resultSummary(total, q, tag)
            : undefined
          : `${total} ${total === 1 ? "recipe" : "recipes"} in your household’s box.`,
        filtered,
      )}

      <div className="flex flex-col gap-3">
        <SearchControls q={q} tag={tag} sort={sort} />

        {tags.length > 0 && (
          <ChipRow key={tag} label="Filter by tag" current={tag ? `${tag} ${tags.find((t) => t.name === tag)?.count ?? ""}`.trim() : "All"}>
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
          <Contents>
            {items.map((r, i) => (
              <RecipeCard key={r.id} recipe={r} index={i} />
            ))}
          </Contents>
        </section>
      )}
    </Arrive>
  );
}
