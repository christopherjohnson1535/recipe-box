import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { REQUEST_PATH_HEADER, safeNext } from "./nav";

/** `/login`, carrying the page being asked for as `?next=` (same-site paths only; the home page needs none). */
export function loginPath(requested: string | null | undefined): string {
  const next = safeNext(requested ?? undefined);
  return next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`;
}

/** For a session the API no longer accepts (expired or revoked): sign in again, then come back to this page. */
export async function redirectToLogin(): Promise<never> {
  redirect(loginPath((await headers()).get(REQUEST_PATH_HEADER)));
}
