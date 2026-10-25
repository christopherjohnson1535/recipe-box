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
