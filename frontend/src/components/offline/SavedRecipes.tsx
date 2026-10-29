"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { MoreList, MoreListItem } from "@/components/ui/MoreList";
import { CACHES, FAVOURITE_MARKER, RECIPE_READ_PAGE, recipeTitle } from "./rules";

export type Kept = { href: string; title: string; favourite?: boolean };

/** The recipe pages the service worker kept on this device, newest first, with their titles and whether the reader starred them. */
export async function keptRecipes(): Promise<Kept[]> {
  if (typeof caches === "undefined") return [];
  const cache = await caches.open(CACHES.pages);
  const found: Kept[] = [];
  for (const req of [...(await cache.keys())].reverse()) {
    const href = new URL(req.url).pathname;
    if (!RECIPE_READ_PAGE.test(href)) continue;
    const res = await cache.match(req, { ignoreVary: true });
    const html = res ? await res.text() : "";
    const title = recipeTitle(html);
    if (title) found.push({ href, title, favourite: html.includes(FAVOURITE_MARKER) });
  }
  return found;
}

/**
 * The offline fallback: shown in place of a page that was never kept (or for any page while the server is down),
 * with the recipes this device can still open. `load` is for tests.
 */
export function SavedRecipes({ load = keptRecipes }: { load?: () => Promise<Kept[]> }) {
  const [kept, setKept] = useState<Kept[] | null>(null);

  useEffect(() => {
    let live = true;
    load()
      .catch(() => [])
      .then((k) => live && setKept(k));
    return () => {
      live = false;
    };
  }, [load]);

  // The reader's favourites are kept even when never opened here (KIT-5), so they lead.
  const favourites = kept?.filter((k) => k.favourite) ?? [];
  const others = kept?.filter((k) => !k.favourite) ?? [];

  return (
    <div className="flex flex-col gap-10">
      <EmptyState
        level={1}
        title="You’re offline"
        actions={<Button onClick={() => window.location.reload()}>Try again</Button>}
      >
        <p>
          {kept === null
            ? "This page isn’t saved on this device."
            : kept.length === 0
              ? "This page isn’t saved on this device, and no recipes are yet. Open a recipe while you’re online and it stays readable here."
              : "This page isn’t saved on this device. Recipes you’ve opened here before still open."}
        </p>
      </EmptyState>
      {favourites.length > 0 && (
        <MoreList title="Your favourites">
          {favourites.map((k, i) => (
            <MoreListItem key={k.href} n={i + 1} href={k.href} title={k.title} />
          ))}
        </MoreList>
      )}
      {others.length > 0 && (
        <MoreList title={favourites.length > 0 ? "Also kept on this device" : "Kept on this device"}>
          {others.map((k, i) => (
            <MoreListItem key={k.href} n={i + 1} href={k.href} title={k.title} />
          ))}
        </MoreList>
      )}
    </div>
  );
}
