/** The sections of the masthead, in order. `match` marks the current one; `badge` shows the grocery count. */
export const NAV: { href: string; label: string; match: (path: string) => boolean; badge?: boolean }[] = [
  { href: "/", label: "Recipes", match: (p: string) => p === "/" || (p.startsWith("/recipes") && p !== "/recipes/new") },
  { href: "/groceries", label: "Groceries", match: (p: string) => p.startsWith("/groceries"), badge: true },
  { href: "/recipes/new", label: "Add", match: (p: string) => p === "/recipes/new" },
  { href: "/import", label: "Import", match: (p: string) => p.startsWith("/import") },
  { href: "/settings", label: "Settings", match: (p: string) => p.startsWith("/settings") },
];

/** Only same-site paths are allowed as a post-login destination (no `//evil.com`). */
export function safeNext(next: string | string[] | undefined): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : "/";
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Request header `proxy.ts` sets to the visitor's path and query, so a server component can send them back after login. */
export const REQUEST_PATH_HEADER = "x-rb-path";
