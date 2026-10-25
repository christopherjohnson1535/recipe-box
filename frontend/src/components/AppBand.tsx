"use client";

import { bandDate, noon, seasonOf } from "@/lib/local-day";
import { useLocalDay } from "@/lib/use-local-day";
import { BandButton, TopBand } from "./ui/TopBand";
import { useSignOut } from "./use-sign-out";

/**
 * The top band with this app's content: the reader's own calendar day (the server's guess until the browser takes
 * over), the season, the household's recipe count when the layout knew it, and Sign out.
 */
export function AppBand({ serverDay, count, displayName }: { serverDay: string; count?: number; displayName?: string }) {
  const day = useLocalDay(serverDay);
  const date = noon(day);
  const { signOut, signingOut } = useSignOut();

  return (
    <TopBand date={bandDate(date)} dateTime={day} season={seasonOf(date)} count={count}>
      <BandButton onClick={signOut} disabled={signingOut} title={displayName ? `Signed in as ${displayName}` : undefined}>
        {signingOut ? "Signing out…" : "Sign out"}
      </BandButton>
    </TopBand>
  );
}
