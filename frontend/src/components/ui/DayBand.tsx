"use client";

import type { ReactNode } from "react";
import { bandDate, noon, seasonOf } from "@/lib/local-day";
import { useLocalDay } from "@/lib/use-local-day";
import { TopBand } from "./TopBand";

/**
 * The top band with the browser's own date and the season, the one place that works them out. `AppBand` adds the recipe
 * count and Sign out; alone it serves pages outside the signed-in shell that make no API call (an unknown address, which
 * needs no session). `serverDay` is the first guess until the browser's own calendar day takes over.
 */
export function DayBand({ serverDay, count, children }: { serverDay: string; count?: ReactNode; children?: ReactNode }) {
  const day = useLocalDay(serverDay);
  const date = noon(day);
  return (
    <TopBand date={bandDate(date)} dateTime={day} season={seasonOf(date)} count={count}>
      {children}
    </TopBand>
  );
}
