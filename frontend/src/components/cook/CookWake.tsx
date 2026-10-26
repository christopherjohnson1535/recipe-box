"use client";

import { useState, type ReactNode } from "react";
import { CookWakeNote, CookWakeStatus } from "@/components/ui/CookKit";
import { useWakeLock } from "./use-wake-lock";

/** The wake lock plus its toolbar pieces: `status` goes in the toolbar's right-hand group, `note` is a direct child of the toolbar. */
export function useCookWake(): { status: ReactNode; note: ReactNode } {
  const wake = useWakeLock();
  const [open, setOpen] = useState(false);
  return {
    status: <CookWakeStatus on={wake === "on"} checking={wake === "checking"} open={open} onToggle={() => setOpen((o) => !o)} />,
    note:
      open && wake !== "on" && wake !== "checking" ? (
        <CookWakeNote>
          {wake === "unsupported"
            ? "Keeping the screen awake needs a secure (https) connection, and on an iPad the Home Screen app on iPadOS 18.4 or later. Otherwise, set Auto-Lock to Never in Settings while you cook."
            : "The screen could not be kept awake just now. On an iPad, use the Home Screen app (iPadOS 18.4 or later), or set Auto-Lock to Never in Settings while you cook."}
        </CookWakeNote>
      ) : null,
  };
}
