"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { useGroceryCount } from "./groceries/use-grocery-count";
import { forgetOffline } from "./offline/forget";
import { dismissUndo } from "./undo/undo-store";
import { NavCount } from "./ui/GroceryKit";
import { Masthead, NavButton, NavLink } from "./ui/Masthead";

const NAV: { href: string; label: string; match: (path: string) => boolean; badge?: boolean }[] = [
  { href: "/", label: "Recipes", match: (p: string) => p === "/" || (p.startsWith("/recipes") && p !== "/recipes/new") },
  { href: "/groceries", label: "Groceries", match: (p: string) => p.startsWith("/groceries"), badge: true },
  { href: "/recipes/new", label: "Add", match: (p: string) => p === "/recipes/new" },
  { href: "/import", label: "Import", match: (p: string) => p.startsWith("/import") },
  { href: "/settings", label: "Settings", match: (p: string) => p.startsWith("/settings") },
];

/** The masthead with this app's sections and sign-out. */
export function AppHeader({ displayName }: { displayName?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const toBuy = useGroceryCount();

  async function signOut() {
    setSigningOut(true);
    // Even if the API is unreachable, leave: the proxy sends cookie-less visitors to /login.
    await api.logout().catch(() => undefined);
    dismissUndo(); // a pending Undo must not reach whoever signs in next
    await forgetOffline(); // nor the recipes this device kept for offline reading
    router.replace("/login");
    router.refresh();
  }

  return (
    <Masthead>
      {NAV.map((item) => (
        <NavLink key={item.href} href={item.href} active={item.match(pathname)}>
          {item.label}
          {item.badge && toBuy > 0 && <NavCount n={toBuy} />}
        </NavLink>
      ))}
      <NavButton
        onClick={signOut}
        disabled={signingOut}
        title={displayName ? `Signed in as ${displayName}` : undefined}
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </NavButton>
    </Masthead>
  );
}
