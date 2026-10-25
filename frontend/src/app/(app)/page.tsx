import type { Metadata } from "next";
import { Arrive } from "@/components/ui/Arrive";
import { ButtonLink } from "@/components/ui/Button";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { CoverStory } from "@/components/ui/CoverStory";
import { EmptyState } from "@/components/ui/EmptyState";
import { FeaturePanel, IssueIndex, IssueIndexItem } from "@/components/ui/IssueIndex";
import { IssueLayout } from "@/components/ui/MagazineCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { SpotIcon } from "@/components/ui/SpotIcon";
import { iconForTag } from "@/components/ui/spot-icons";
import { issueLine, monthYear, planHome } from "@/components/home/issue";
import { LocalIssueLine, LocalTicker } from "@/components/home/LocalIssue";
import { formatMinutes, plateSrc } from "@/lib/recipe";
import { SelectableGrid } from "@/components/groceries/SelectableGrid";
import { NoMatches } from "@/components/search/ResultSummary";
import { SearchControls } from "@/components/search/SearchControls";
import { homeHref, parseSort, resultSummary } from "@/components/search/url";
import { ServerError } from "@/components/ServerError";
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
      kicker="The collection"
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
    // While filtering, the issue line still needs the whole box (its number and volume), so ask for the first page unfiltered too.
    // That extra call only decorates the issue line, so its failure must not break searching (null = could not count).
    result = await Promise.all([api.listRecipes({ q, tag, sort }), api.listTags(), q || tag ? api.listRecipes({}).catch(() => null) : undefined]);
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
  const [{ items, total }, tags, whole] = result;
  const filtered = Boolean(q || tag);
  const now = new Date();
  // Filtering and the whole box could not be counted: print the name and date but no Vol./No.
  const issue = issueLine((whole ?? { items }).items, (whole ?? { total }).total, now);
  const issueProps = whole === null ? { volume: undefined, number: undefined } : { volume: issue.volume, number: issue.number };

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

  const { cover, grid, index, stale } = filtered ? { cover: null, grid: items, index: [], stale: null } : planHome(items);
  const sidebar =
    index.length > 0 || stale ? (
      <>
        {index.length > 0 && (
          <IssueIndex title="Also in this issue">
            {index.map((r, i) => (
              <IssueIndexItem key={r.id} n={i + 1} href={`/recipes/${r.id}`} title={r.title} time={formatMinutes(r.totalMinutes)} />
            ))}
          </IssueIndex>
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
      <LocalIssueLine serverDay={issue.dateTime} {...issueProps} />
      {/* The one h1 whichever way the page is set: the cover headline below is an h2. */}
      {cover && <h1 className="sr-only">Recipes</h1>}

      {cover ? (
        <>
          <CoverStory
            title={cover.title}
            kicker={`Cover story${cover.tags.length > 0 ? ` · ${cover.tags.slice(0, 2).join(" · ")}` : ""}`}
            deck={cover.description || undefined}
            meta={formatMinutes(cover.totalMinutes)}
            imageSrc={plateSrc(cover) as string}
            actions={
              <>
                <ButtonLink href={`/recipes/${cover.id}/cook`}>Start cooking</ButtonLink>
                <ButtonLink href={`/recipes/${cover.id}`} variant="secondary">
                  Read the recipe
                </ButtonLink>
              </>
            }
          />
          <LocalTicker serverDay={issue.dateTime} />
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
          <IssueLayout aside={sidebar}>
            <section aria-label={filtered ? `${total} matching recipes` : "All recipes"}>
              <SelectableGrid recipes={grid} />
            </section>
          </IssueLayout>
        )
      )}
    </Arrive>
  );
}
