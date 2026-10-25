"use client";

import { Suspense, use } from "react";
import { bandDate, noon, seasonOf } from "@/lib/local-day";
import { useLocalDay } from "@/lib/use-local-day";
import { BandButton, BandCount, TopBand } from "./ui/TopBand";
import { useSignOut } from "./use-sign-out";

/** Waits for the household's recipe count; a count that could not be read (undefined) adds nothing to the line. */
function Count({ count }: { count: Promise<number | undefined> }) {
  const n = use(count);
  return n === undefined ? null : <BandCount n={n} />;
}

/**
 * The top band with this app's content: the reader's own calendar day (the server's guess until the browser takes
 * over), the season, the household's recipe count and Sign out. The count arrives as a promise and fills in when it
 * resolves, so the rest of the band (and the page under it) never waits for it.
 */
export function AppBand({
  serverDay,
  count,
  displayName,
}: {
  serverDay: string;
  /** The recipe count, still in flight; resolves to undefined when the layout could not read it. */
  count?: Promise<number | undefined>;
  displayName?: string;
}) {
  const day = useLocalDay(serverDay);
  const date = noon(day);
  const { signOut, signingOut } = useSignOut();

  return (
    <TopBand
      date={bandDate(date)}
      dateTime={day}
      season={seasonOf(date)}
      count={
        count && (
          <Suspense fallback={null}>
            <Count count={count} />
          </Suspense>
        )
      }
    >
      <BandButton onClick={signOut} disabled={signingOut} title={displayName ? `Signed in as ${displayName}` : undefined}>
        {signingOut ? "Signing out…" : "Sign out"}
      </BandButton>
    </TopBand>
  );
}
