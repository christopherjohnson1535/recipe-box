"use client";

import { useSyncExternalStore } from "react";
import { IssueLine } from "@/components/ui/IssueLine";
import { Ticker } from "@/components/ui/Ticker";
import { IN_SEASON } from "./produce";
import { longDate, seasonOf } from "./issue";

const dayKey = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n, i) => String(n).padStart(i ? 2 : 4, "0")).join("-");

/** Re-checks the clock once a minute and when the tab comes back (a tab left open overnight changes day). */
function subscribe(notify: () => void) {
  const timer = window.setInterval(notify, 60_000);
  document.addEventListener("visibilitychange", notify);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", notify);
  };
}

/**
 * The reader's local day as YYYY-MM-DD. The server renders (and hydration keeps) `serverDay`; once mounted it
 * switches to the browser's own calendar day, so an evening in Denver is never printed as tomorrow's UTC date.
 */
export function useLocalDay(serverDay: string): string {
  return useSyncExternalStore(subscribe, () => dayKey(new Date()), () => serverDay);
}

/** A noon Date on that calendar day, so local-getter helpers (`seasonOf`, `longDate`) read the right day in any zone. */
const noon = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};

/** The issue line with its season name and date following the reader's clock. */
export function LocalIssueLine({ serverDay, volume, number }: { serverDay: string; volume?: string; number?: number }) {
  const day = useLocalDay(serverDay);
  const date = noon(day);
  return <IssueLine volume={volume} number={number} name={`The ${seasonOf(date)} Issue`} date={longDate(date)} dateTime={day} />;
}

/** The in-season ticker for the reader's local season. */
export function LocalTicker({ serverDay }: { serverDay: string }) {
  return <Ticker label="In season" items={IN_SEASON[seasonOf(noon(useLocalDay(serverDay)))]} />;
}
