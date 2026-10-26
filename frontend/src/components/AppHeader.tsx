"use client";

import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav";
import { useGroceryCount } from "./groceries/use-grocery-count";
import { NavCount } from "./ui/GroceryKit";
import { Masthead, NavLink } from "./ui/Masthead";

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
