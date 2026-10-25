import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "rb_session";
// /offline is precached by the service worker at install, often before anyone has signed in.
const PUBLIC_PATHS = ["/login", "/setup", "/offline"];

// Cheap gate only: a present cookie may still be expired. The (app) layout confirms it with
// GET /api/auth/me and sends stale sessions to /login.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.includes(pathname) || request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Skip the proxied API/media, Next internals, and any file with an extension (icons, manifest, fonts).
  matcher: ["/((?!api/|media/|_next/|.*\\.[\\w]+$).*)"],
};
