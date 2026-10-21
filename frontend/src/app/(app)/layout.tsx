import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { ServerError } from "@/components/ServerError";
import { ApiError, type User } from "@/lib/api";
import { serverApi } from "@/lib/server-api";

export default async function AppLayout({ children }: { children: ReactNode }) {
  let user: User | null = null;
  let failure: unknown = null;
  try {
    user = await (await serverApi()).me();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login"); // expired or revoked session
    failure = e;
  }

  return (
    <>
      <AppHeader displayName={user?.displayName} />
      <main id="main" className="mx-auto w-full max-w-content px-gutter py-8 sm:py-10">
        {failure ? <ServerError error={failure} /> : children}
      </main>
    </>
  );
}
