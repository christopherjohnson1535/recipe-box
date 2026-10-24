import { useEffect, useState } from "react";

/** `checking`: the first request has not answered yet. `off`: not held right now (refused, released by the system, or the page is hidden). `unsupported`: no Screen Wake Lock API. */
export type WakeLockStatus = "checking" | "on" | "off" | "unsupported";

/**
 * Keeps the screen awake while mounted. Asks only while the page is visible; the system releases the lock when the page
 * hides (and iOS sometimes on its own), so it asks again the next time the page is visible.
 */
export function useWakeLock(): WakeLockStatus {
  const [status, setStatus] = useState<WakeLockStatus>("checking");
  useEffect(() => {
    if (!("wakeLock" in navigator)) {
      // The API is only known in the browser, so this cannot be the initial state without a hydration mismatch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("unsupported");
      return;
    }
    let alive = true;
    let sentinel: WakeLockSentinel | null = null;
    let asking = false;
    const acquire = async () => {
      if (document.visibilityState !== "visible") {
        if (alive && !sentinel) setStatus("off");
        return;
      }
      if (sentinel || asking) return;
      asking = true;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (!alive) return void lock.release().catch(() => {});
        sentinel = lock;
        lock.addEventListener("release", () => {
          if (sentinel === lock) sentinel = null;
          if (alive) setStatus("off");
        });
        setStatus("on");
      } catch {
        if (alive) setStatus("off");
      } finally {
        asking = false;
      }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", acquire);
      void sentinel?.release().catch(() => {});
    };
  }, []);
  return status;
}
