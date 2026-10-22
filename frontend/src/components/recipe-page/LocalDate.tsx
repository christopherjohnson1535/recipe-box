"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => undefined;

/**
 * " on Oct 21, 2026" in the viewer's own time zone. The server has no idea of that zone, so it renders an empty
 * `<time>` (the server snapshot) and the browser fills it in: no hydration mismatch. `timeZone` is for tests.
 */
export function LocalDate({ iso, timeZone }: { iso: string; timeZone?: string }) {
  const text = useSyncExternalStore(
    noop,
    () => (Number.isNaN(Date.parse(iso)) ? "" : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone }).format(new Date(iso))),
    () => "",
  );
  return (
    <>
      {text && " on "}
      <time dateTime={iso}>{text}</time>
    </>
  );
}
