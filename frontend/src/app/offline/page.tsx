import type { Metadata } from "next";
import { SavedRecipes } from "@/components/offline/SavedRecipes";
import { Logo } from "@/components/ui/Logo";

export const metadata: Metadata = { title: "Offline" };

// Precached by the service worker and served for any page it has no copy of while the network is down (src/app/sw.ts).
// Static and outside the (app) layout, so it needs no session or API call. Its links are plain navigations, which the
// worker answers from what it kept.
export default function OfflinePage() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-page flex-col gap-10 px-gutter pt-6 pb-20">
      <Logo />
      <SavedRecipes />
    </main>
  );
}
