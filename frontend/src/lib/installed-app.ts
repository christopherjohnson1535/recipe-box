import { useSyncExternalStore } from "react";

const never = () => () => undefined;
const installed = () => window.matchMedia?.("(display-mode: standalone)")?.matches === true || (navigator as { standalone?: boolean }).standalone === true;

/** Whether the page runs as an installed app (the Home Screen icon). False on the server and while hydrating. */
export function useInstalledApp(): boolean {
  return useSyncExternalStore(never, installed, () => false);
}

/** Google's consent page opens outside the Home Screen app, without its sign-in, so the first connection has to start in a browser. */
export const CONNECT_IN_BROWSER = "Connect once from Safari (or your browser), not the Home Screen app: open Settings there. After that, sending works here too.";
