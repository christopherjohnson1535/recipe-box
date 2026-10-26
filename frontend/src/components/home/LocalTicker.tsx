"use client";

import { Ticker } from "@/components/ui/Ticker";
import { noon, seasonOf } from "@/lib/local-day";
import { useLocalDay } from "@/lib/use-local-day";
import { IN_SEASON } from "./produce";

/** The in-season ticker for the reader's local season. */
export function LocalTicker({ serverDay }: { serverDay: string }) {
  return <Ticker label="In season" items={IN_SEASON[seasonOf(noon(useLocalDay(serverDay)))]} />;
}
