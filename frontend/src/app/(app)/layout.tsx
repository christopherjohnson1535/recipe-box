import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { RouteFocus } from "@/components/RouteFocus";
import { SaveStamp } from "@/components/ui/SaveStamp";
import { UndoToast } from "@/components/undo/UndoToast";
import { ServerError } from "@/components/ServerError";
import { OfflineBanner } from "@/components/offline/OfflineBanner";
import { ApiError, type User } from "@/lib/api";
import { redirectToLogin } from "@/lib/login-redirect";
import { serverApi } from "@/lib/server-api";

export default async function AppLayout({ children }: { children: ReactNode }) {
  let user: User | null = null;
  let failure: unknown = null;
  try {
    user = await (await serverApi()).me();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) await redirectToLogin(); // expired or revoked session
    failure = e;
  }

  return (
    <>
      <AppHeader displayName={user?.displayName} />
      <OfflineBanner />
      <main id="main" className="mx-auto w-full max-w-page px-gutter pt-10 pb-20 sm:pt-14">
        {failure ? <ServerError error={failure} /> : children}
      </main>
      <RouteFocus />
      <UndoToast />
      <SaveStamp />
    </>
  );
}
