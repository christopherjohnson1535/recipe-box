"use client";

import { usePathname } from "next/navigation";
import { useGroceryCount } from "./groceries/use-grocery-count";
import { NavCount } from "./ui/GroceryKit";
import { Masthead, NavLink } from "./ui/Masthead";

const NAV: { href: string; label: string; match: (path: string) => boolean; badge?: boolean }[] = [
  { href: "/", label: "Recipes", match: (p: string) => p === "/" || (p.startsWith("/recipes") && p !== "/recipes/new") },
  { href: "/groceries", label: "Groceries", match: (p: string) => p.startsWith("/groceries"), badge: true },
  { href: "/recipes/new", label: "Add", match: (p: string) => p === "/recipes/new" },
  { href: "/import", label: "Import", match: (p: string) => p.startsWith("/import") },
  { href: "/settings", label: "Settings", match: (p: string) => p.startsWith("/settings") },
];

/** The masthead with this app's sections. Sign out lives in the top band above it. */
export function AppHeader() {
  const pathname = usePathname();
  const toBuy = useGroceryCount();

  return (
    <Masthead>
      {NAV.map((item) => (
        <NavLink key={item.href} href={item.href} active={item.match(pathname)}>
          {item.label}
          {item.badge && toBuy > 0 && <NavCount n={toBuy} />}
        </NavLink>
      ))}
    </Masthead>
  );
}
