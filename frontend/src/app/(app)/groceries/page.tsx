import type { Metadata } from "next";
import { GroceryView } from "@/components/groceries/GroceryView";
import { KeepOffline } from "@/components/offline/KeepOffline";

export const metadata: Metadata = { title: "Groceries" };

/** The shared shopping list. The page itself is a shell; the list is fetched in the browser, so a kept copy of the shell and of GET /api/grocery open with no signal. */
export default function GroceriesPage() {
  return (
    <>
      <KeepOffline />
      <GroceryView />
    </>
  );
}
