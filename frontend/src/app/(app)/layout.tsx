import type { ReactNode } from "react";
import { AppBand } from "@/components/AppBand";
import { AppHeader } from "@/components/AppHeader";
import { RouteFocus } from "@/components/RouteFocus";
import { SaveStamp } from "@/components/ui/SaveStamp";
import { UndoToast } from "@/components/undo/UndoToast";
import { ServerError } from "@/components/ServerError";
import { OfflineBanner } from "@/components/offline/OfflineBanner";
import { KeepFavourites } from "@/components/favourites/KeepFavourites";
import { ApiError, type User } from "@/lib/api";
import { dayKey } from "@/lib/local-day";
import { redirectToLogin } from "@/lib/login-redirect";
import { serverApi } from "@/lib/server-api";

export default async function AppLayout({ children }: { children: ReactNode }) {
  let user: User | null = null;
  let failure: unknown = null;
  // The band's recipe count only decorates: a page of one recipe is the cheapest way to read `total`, and any failure
  // (API down, offline) just leaves the count out. Asked alongside me() so the two requests overlap, and handed to the
  // band as a promise: the shell never waits for it.
  let count: Promise<number | undefined> = Promise.resolve(undefined);
  try {
    const api = await serverApi();
    count = api.listRecipes({ limit: 1 }).then((page) => page.total, () => undefined);
    user = await api.me();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) await redirectToLogin(); // expired or revoked session
    failure = e;
  }

  return (
    <>
      {/* The page's one banner landmark: the band, then the masthead, in the order they are seen and tabbed. */}
      <header>
        {/* The server's day is a first guess; the band switches to the browser's own calendar day once mounted. */}
        <AppBand serverDay={dayKey(new Date())} count={failure ? undefined : count} displayName={user?.displayName} />
        <AppHeader />
      </header>
      <OfflineBanner />
      <main id="main" className="mx-auto w-full max-w-page px-gutter pt-10 pb-20 sm:pt-14">
        {failure ? <ServerError error={failure} /> : children}
      </main>
      <RouteFocus />
      <UndoToast />
      <SaveStamp />
      {user && <KeepFavourites />}
    </>
  );
}
