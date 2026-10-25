"use client";

import { useEffect, useState } from "react";
import { api, type GoogleStatus } from "@/lib/api";

/** Whether this member can send the list to Google Tasks. Asked once when the page opens (not on every poll); null until known, and stays null if the server can't be asked. */
export function useGoogleStatus() {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  useEffect(() => {
    let live = true;
    api.googleStatus().then(
      (s) => live && setStatus(s),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  return [status, setStatus] as const;
}
