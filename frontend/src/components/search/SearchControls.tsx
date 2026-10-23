"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { SearchField, SearchSort } from "@/components/ui/SearchField";
import type { RecipeSort } from "@/lib/api";
import { homeHref, parseSort, SORTS } from "./url";

export const SEARCH_DEBOUNCE_MS = 250;

/**
 * Search box and sort menu. Typing updates `?q=` after a pause with `router.replace` (no history spam); Enter, the
 * Search button and the sort menu push a history entry. The input is uncontrolled so focus and caret survive the
 * server re-render. Without JS the form is a plain GET.
 */
export function SearchControls({ q, tag, sort }: { q: string; tag: string; sort?: RecipeSort }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastSent = useRef(q);

  // Back/forward or "Clear search" changed ?q=; show it, unless it is the value we just sent ourselves.
  useEffect(() => {
    if (input.current && q !== lastSent.current) input.current.value = q;
    lastSent.current = q;
  }, [q]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const go = (state: { q?: string; sort?: RecipeSort }, mode: "push" | "replace") => {
    clearTimeout(timer.current);
    lastSent.current = (state.q ?? input.current?.value ?? q).trim();
    const href = homeHref({ q: lastSent.current, tag, sort, ...state });
    startTransition(() => (mode === "push" ? router.push(href) : router.replace(href, { scroll: false })));
  };

  return (
    <form
      role="search"
      method="get"
      action="/"
      className="flex flex-wrap items-end gap-x-6 gap-y-1"
      onSubmit={(e) => {
        e.preventDefault();
        go({}, "push");
      }}
    >
      <label htmlFor="q" className="sr-only">
        Search recipes
      </label>
      <div className="flex min-w-0 flex-1 sm:min-w-60 items-end gap-4 max-sm:basis-full">
        <SearchField
          ref={input}
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          autoComplete="off"
          placeholder="Search the box…"
          onChange={(e) => {
            clearTimeout(timer.current);
            const value = e.currentTarget.value;
            timer.current = setTimeout(() => go({ q: value }, "replace"), SEARCH_DEBOUNCE_MS);
          }}
        />
        {tag && <input type="hidden" name="tag" value={tag} />}
        <Button type="submit" variant="ghost" className="shrink-0">
          Search
        </Button>
      </div>
      <label htmlFor="sort" className="sr-only">
        Sort recipes
      </label>
      <SearchSort
        className="max-sm:w-full"
        id="sort"
        name="sort"
        value={sort === "newest" && !q ? "" : (sort ?? "")}
        onChange={(e) => go({ sort: parseSort(e.currentTarget.value) }, "push")}
      >
        <option value="">{q ? "Best match" : "Newest"}</option>
        {SORTS.filter((s) => q || s.value !== "newest").map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </SearchSort>
    </form>
  );
}
