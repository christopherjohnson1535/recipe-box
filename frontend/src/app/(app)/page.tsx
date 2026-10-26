import type { Metadata } from "next";
import { Arrive } from "@/components/ui/Arrive";
import { ButtonLink } from "@/components/ui/Button";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { FeaturedRecipe } from "@/components/ui/FeaturedRecipe";
import { FeaturePanel, MoreList, MoreListItem } from "@/components/ui/MoreList";
import { PageHeader } from "@/components/ui/PageHeader";
import { HomeLayout } from "@/components/ui/RecipeTile";
import { SpotIcon } from "@/components/ui/SpotIcon";
import { iconForTag } from "@/components/ui/spot-icons";
import { monthYear, planHome } from "@/components/home/home-plan";
import { LocalTicker } from "@/components/home/LocalTicker";
import { formatMinutes, plateSrc, servingsLabel } from "@/lib/recipe";
import { SelectableGrid } from "@/components/groceries/SelectableGrid";
import { NoMatches } from "@/components/search/ResultSummary";
import { SearchControls } from "@/components/search/SearchControls";
import { homeHref, parseSort, resultSummary } from "@/components/search/url";
import { ServerError } from "@/components/ServerError";
import { dayKey } from "@/lib/local-day";
import { firstParam, type SearchParams } from "@/lib/nav";
import { serverApi } from "@/lib/server-api";

export const metadata: Metadata = { title: "Recipes" };

/** The tag filter chips, each with its spot icon where the tag maps to one. */
function tagChips(tags: { name: string; count: number }[], q: string, tag: string, sort: ReturnType<typeof parseSort>) {
  return (
    <ChipRow key={tag} label="Filter by tag" current={tag ? `${tag} ${tags.find((t) => t.name === tag)?.count ?? ""}`.trim() : "All"}>
      <li>
        <Chip href={homeHref({ q, sort })} selected={!tag}>
          All
        </Chip>
      </li>
      {tags.map((t) => {
        const icon = iconForTag(t.name);
        return (
          <li key={t.name}>
            <Chip href={homeHref({ q, tag: t.name === tag ? undefined : t.name, sort })} selected={t.name === tag} count={t.count}>
              {icon !== "default" && <SpotIcon name={icon} size={18} />}
              {t.name}
            </Chip>
          </li>
        );
      })}
    </ChipRow>
  );
}

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = firstParam(sp.q)?.trim() ?? "";
  const tag = firstParam(sp.tag) ?? "";
  const sort = parseSort(firstParam(sp.sort));
  // The deck is the household count, or, while filtering, the live result count (Q1-05: no separate summary line).
  const header = (description?: string, filtered = false) => (
    <PageHeader
      title="Recipes"
      reserveDeck={!filtered}
      liveDescription={filtered}
      description={description}
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
  const serverDay = dayKey(new Date());

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

  const { featured, grid, more, stale } = filtered ? { featured: null, grid: items, more: [], stale: null } : planHome(items);
  const sidebar =
    more.length > 0 || stale ? (
      <>
        {more.length > 0 && (
          <MoreList title="More to cook">
            {more.map((r, i) => (
              <MoreListItem key={r.id} n={i + 1} href={`/recipes/${r.id}`} title={r.title} time={formatMinutes(r.totalMinutes)} />
            ))}
          </MoreList>
        )}
        {stale && (
          // shortcut: "last edited" stands in for "last cooked" until the Made-it log (#23) exists.
          <FeaturePanel label="Haven’t cooked in a while" title={stale.title} href={`/recipes/${stale.id}`} note={`Not touched since ${monthYear(stale.updatedAt)}`} />
        )}
      </>
    ) : undefined;
  const search = (
    <div className="flex flex-col gap-3">
      <SearchControls q={q} tag={tag} sort={sort} />
      {tags.length > 0 && tagChips(tags, q, tag, sort)}
    </div>
  );

  return (
    <Arrive arriveKey="home" className="flex flex-col gap-10">
      {/* The one h1 whichever way the page is set: the featured recipe's title below is an h2. */}
      {featured && <h1 className="sr-only">Recipes</h1>}

      {featured ? (
        <>
          <FeaturedRecipe
            title={featured.title}
            kicker={`Featured${featured.tags.length > 0 ? ` · ${featured.tags.slice(0, 2).join(" · ")}` : ""}`}
            deck={featured.description || undefined}
            meta={[formatMinutes(featured.totalMinutes), servingsLabel(featured.servings)].filter(Boolean).join(" · ") || undefined}
            imageSrc={plateSrc(featured) as string}
            cookHref={`/recipes/${featured.id}/cook`}
            readHref={`/recipes/${featured.id}`}
          />
          <LocalTicker serverDay={serverDay} />
        </>
      ) : (
        header(
          filtered
            ? total > 0
              ? resultSummary(total, q, tag)
              : undefined
            : `${total} ${total === 1 ? "recipe" : "recipes"} in your household’s box.`,
          filtered,
        )
      )}

      {search}

      {items.length === 0 ? (
        <NoMatches q={q} tag={tag} />
      ) : (
        grid.length > 0 && (
          <HomeLayout aside={sidebar}>
            <section aria-label={filtered ? `${total} matching recipes` : "All recipes"}>
              <SelectableGrid recipes={grid} />
            </section>
          </HomeLayout>
        )
      )}
    </Arrive>
  );
}
