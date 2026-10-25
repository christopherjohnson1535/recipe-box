// What the service worker (src/app/sw.ts) keeps for offline reading (KIT-5), as plain data and functions so the page
// and the tests can share them. No DOM or worker globals here: this file is bundled into the worker by esbuild.

/** Runtime caches. Every name starts with `rb-` so sign-out can drop them all (the precached app shell stays). */
export const CACHES = { pages: "rb-pages", api: "rb-api", media: "rb-media" } as const;
export const CACHE_PREFIX = "rb-";

/** The precached page a navigation falls back to when the network is down and nothing was kept for it. */
export const OFFLINE_URL = "/offline";

/** Size caps. iOS may evict any of it under storage pressure; the server is always the real copy. */
export const LIMITS = {
  pages: 60, // a recipe page and its cooking mode count separately
  api: 30,
  media: 200, // a recipe has its photos plus their display renditions
  maxAgeSeconds: 30 * 24 * 60 * 60,
  networkTimeoutSeconds: 5,
} as const;

const ID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** A recipe page or its cooking mode: the only pages kept. */
export const RECIPE_PAGE = new RegExp(`^/recipes/${ID}(?:/cook)?$`);
/** A recipe page (not cooking mode), for the list of kept recipes. */
export const RECIPE_READ_PAGE = new RegExp(`^/recipes/${ID}$`);
export const RECIPE_API = new RegExp(`^/api/recipes/${ID}$`);
/** Same rule as the API's `GET /media/{file_name}` (docs/API.md). The names are content ids, so they never change. */
export const MEDIA = /^\/media\/[0-9a-f-]{36}(?:\.display)?\.jpg$/;

/**
 * Rendered by the recipe and cooking pages only when the recipe itself rendered (`KeepOffline`). A 200 page without
 * it (the "can't reach the server" message) must not replace a good copy.
 */
export const KEEP_MARKER = 'name="rb-offline"';

/** Whether a fetched page may be kept: a real 200 recipe render, never a redirect (to /login) or an error page. */
export function keepablePage(res: { status: number; redirected: boolean }, html: string): boolean {
  return res.status === 200 && !res.redirected && html.includes(KEEP_MARKER);
}

/**
 * A response that means nobody is signed in, so everything kept is dropped and a signed-out device shows nothing from
 * cache: a 401, a redirect that ended on /login, or a page navigation answered with a redirect (navigations are
 * fetched with `redirect: "manual"`, and in this app only the sign-in gate redirects a page: no cookie → /login).
 * A wrong password on login or on a password change is also a 401; dropping the offline copies then costs nothing.
 */
export function signedOut(res: { status: number; redirected: boolean; url: string; type?: string }): boolean {
  if (res.status === 401 || res.type === "opaqueredirect") return true;
  if (!res.redirected || !res.url) return false;
  try {
    return new URL(res.url).pathname === "/login";
  } catch {
    return false;
  }
}

/** The cache key for a page: its path, so `?servings=6` and the bare page share one copy. */
export function pageKey(url: string): string {
  const u = new URL(url);
  return u.origin + u.pathname;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'", apos: "'" };

/** The recipe title from a kept page's `<title>Lasagne · Recipe Box</title>`, or null. */
export function recipeTitle(html: string): string | null {
  const m = /<title>([^<]*)<\/title>/.exec(html);
  if (!m) return null;
  const title = m[1]
    .replace(/&(amp|lt|gt|quot|#39|#x27|apos);/g, (_, e: string) => ENTITIES[e])
    .replace(/ · Recipe Box$/, "")
    .trim();
  return title || null;
}

/** The /media photos a kept page shows, so they are kept with it (a page cached in the background never loads them). */
export function mediaIn(html: string): string[] {
  const found = html.match(/\/media\/[0-9a-f-]{36}(?:\.display)?\.jpg/g) ?? [];
  return [...new Set(found)];
}
