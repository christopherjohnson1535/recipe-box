"use client";

import { Alert } from "@/components/ui/Alert";
import { useOnline } from "./use-online";

/** Shown across the app while the device has no network. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="mx-auto w-full max-w-page px-gutter pt-4">
      <Alert title="You’re offline">
        Recipes you’ve opened on this device still open. Saving, importing and search come back when you’re online.
      </Alert>
    </div>
  );
}
