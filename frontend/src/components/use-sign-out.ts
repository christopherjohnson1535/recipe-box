"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { forgetOffline } from "./offline/forget";
import { dismissUndo } from "./undo/undo-store";

/** Ends the session and leaves for the sign-in page. `signingOut` is true from the click until the page changes. */
export function useSignOut() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    // Even if the API is unreachable, leave: the proxy sends cookie-less visitors to /login.
    await api.logout().catch(() => undefined);
    dismissUndo(); // a pending Undo must not reach whoever signs in next
    await forgetOffline(); // nor the recipes this device kept for offline reading
    router.replace("/login");
    router.refresh();
  }

  return { signOut, signingOut };
}
