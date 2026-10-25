/**
 * The one-line script a bookmark runs on a recipe page. It reads only `location.href` and opens Recipe Box in a new tab
 * with that address in the query string. It never touches the page's content, cookies or storage, and sends nothing itself.
 * `noopener` keeps the new tab from reaching back into the recipe site.
 */
export function bookmarkletFor(origin: string): string {
  const target = `${origin}/import?url=`;
  return `javascript:void(window.open(${JSON.stringify(target)}+encodeURIComponent(location.href),"_blank","noopener"))`;
}

/** The address the Apple Shortcut opens; the shared page address is appended, URL-encoded. */
export const shortcutAddress = (origin: string) => `${origin}/import?url=`;
