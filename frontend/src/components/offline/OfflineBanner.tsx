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
        Recipes you’ve opened on this device still open. Saving, deleting, importing and search wait until you’re back online.
      </Alert>
    </div>
  );
}
