"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { cx } from "./ui/cx";
import { Logo } from "./Logo";

const NAV = [
  { href: "/", label: "Recipes", match: (p: string) => p === "/" || p.startsWith("/recipes") },
  { href: "/import", label: "Import", match: (p: string) => p.startsWith("/import") },
  { href: "/settings", label: "Settings", match: (p: string) => p.startsWith("/settings") },
];

const navItem =
  "label inline-flex min-h-control items-center whitespace-nowrap border-b-2 px-2 max-sm:text-[0.8125rem] max-sm:tracking-[0.07em] sm:px-2.5 transition-[border-color,color] duration-150 ease-out";

/** Masthead: wordmark, section links, and a thick-over-thin rule. */
export function AppHeader({ displayName }: { displayName?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    // Even if the API is unreachable, leave: the proxy sends cookie-less visitors to /login.
    await api.logout().catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="mx-auto w-full max-w-page px-gutter pt-4">
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-1 pb-2">
        <Link href="/" className="inline-flex min-h-control items-center" aria-label="Recipe Box home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="-mx-2 flex max-w-full items-center overflow-x-auto sm:mx-0">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  navItem,
                  active ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className={cx(navItem, "border-transparent text-ink-muted hover:text-ink disabled:opacity-55")}
            title={displayName ? `Signed in as ${displayName}` : undefined}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </nav>
      </div>
      <div className="rule-double" aria-hidden="true" />
    </header>
  );
}
