import { NextResponse, type NextRequest } from "next/server";
import { REQUEST_PATH_HEADER } from "@/lib/nav";

const SESSION_COOKIE = "rb_session";
const PUBLIC_PATHS = ["/login", "/setup"];

// Cheap gate only: a present cookie may still be expired. The (app) layout confirms it with
// GET /api/auth/me and sends stale sessions to /login.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.includes(pathname) || request.cookies.has(SESSION_COOKIE)) {
    // Server components read this to send a stale session back to the page it asked for (never trust a client-sent one).
    const forwarded = new Headers(request.headers);
    forwarded.set(REQUEST_PATH_HEADER, pathname + search);
    return NextResponse.next({ request: { headers: forwarded } });
  }

  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Skip the proxied API/media, Next internals, and any file with an extension (icons, manifest, fonts).
  matcher: ["/((?!api/|media/|_next/|.*\\.[\\w]+$).*)"],
};
