"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { IssueIndex, IssueIndexItem } from "@/components/ui/IssueIndex";
import { CACHES, RECIPE_READ_PAGE, recipeTitle } from "./rules";

export type Kept = { href: string; title: string };

/** The recipe pages the service worker kept on this device, newest first, with their titles. */
export async function keptRecipes(): Promise<Kept[]> {
  if (typeof caches === "undefined") return [];
  const cache = await caches.open(CACHES.pages);
  const found: Kept[] = [];
  for (const req of [...(await cache.keys())].reverse()) {
    const href = new URL(req.url).pathname;
    if (!RECIPE_READ_PAGE.test(href)) continue;
    const res = await cache.match(req, { ignoreVary: true });
    const title = res ? recipeTitle(await res.text()) : null;
    if (title) found.push({ href, title });
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
      {kept && kept.length > 0 && (
        <IssueIndex title="Kept on this device">
          {kept.map((k, i) => (
            <IssueIndexItem key={k.href} n={i + 1} href={k.href} title={k.title} />
          ))}
        </IssueIndex>
      )}
    </div>
  );
}
