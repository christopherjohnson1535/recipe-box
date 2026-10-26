import type { Metadata } from "next";
import { NotFoundContent } from "@/components/NotFoundContent";
import { DayBand } from "@/components/ui/DayBand";
import { Masthead, NavLink } from "@/components/ui/Masthead";
import { dayKey } from "@/lib/local-day";

export const metadata: Metadata = { title: "Page not found" };

// The sections of the signed-in masthead (components/AppHeader.tsx), none current and without the grocery count: this page
// makes no API call, so it renders with a missing or stale session. Links lead on to the sign-in page when the session is gone.
const SECTIONS = [
  ["/", "Recipes"],
  ["/groceries", "Groceries"],
  ["/recipes/new", "Add"],
  ["/import", "Import"],
  ["/settings", "Settings"],
] as const;

/** Next renders this for an address no route matches, outside `(app)/layout.tsx`, so it brings its own band and masthead. */
export default function NotFound() {
  return (
    <>
      {/* The one banner landmark, as in the signed-in shell: the band, then the masthead. */}
      <header>
        <DayBand serverDay={dayKey(new Date())} />
        <Masthead>
          {SECTIONS.map(([href, label]) => (
            <NavLink key={href} href={href}>
              {label}
            </NavLink>
          ))}
        </Masthead>
      </header>
      <main id="main" className="mx-auto w-full max-w-page px-gutter pt-10 pb-20 sm:pt-14">
        <NotFoundContent />
      </main>
    </>
  );
}
