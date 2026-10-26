"use client";

import { bandDate, noon, seasonOf } from "@/lib/local-day";
import { useLocalDay } from "@/lib/use-local-day";
import { TopBand } from "./TopBand";

/**
 * The top band with only what the browser knows: the reader's local date and the season, no recipe count and no account
 * actions. For pages outside the signed-in shell that make no API call (an unknown address). `serverDay` is the first guess
 * until the browser's own calendar day takes over.
 */
export function DayBand({ serverDay }: { serverDay: string }) {
  const day = useLocalDay(serverDay);
  const date = noon(day);
  return <TopBand date={bandDate(date)} dateTime={day} season={seasonOf(date)} />;
}
