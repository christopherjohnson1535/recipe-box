/** Longest address accepted from `/import?url=`. Browsers allow far more; no recipe page needs it. */
export const MAX_SHARED_URL = 2048;

/**
 * Checks an address handed to `/import?url=` by the Shortcut, the bookmarklet or any other page. Only absolute
 * http(s) addresses without a user name or password pass. Returns the normalised address, or null.
 * This is a courtesy check for the confirm step; the server's safe fetch is the real gate (public addresses only).
 */
export function parseSharedUrl(raw: string | undefined | null): string | null {
  const text = raw?.trim();
  if (!text || text.length > MAX_SHARED_URL) return null;
  try {
    const u = new URL(text);
    if ((u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname || u.username || u.password) return null;
    u.hash = "";
    return u.href;
  } catch {
    return null;
  }
}
