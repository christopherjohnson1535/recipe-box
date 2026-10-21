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
  "inline-flex min-h-control items-center whitespace-nowrap rounded-control px-3 text-[0.9375rem] font-medium transition-[background-color,color] duration-150 ease-out";

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
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-x-6 gap-y-1 px-gutter py-2">
        <Link href="/" className="inline-flex min-h-control items-center rounded-control" aria-label="Recipe Box home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="-mx-3 flex max-w-full items-center overflow-x-auto sm:mx-0">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(navItem, active ? "text-accent-ink" : "text-muted hover:bg-surface-sunk hover:text-text")}
              >
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className={cx(navItem, "text-muted hover:bg-surface-sunk hover:text-text disabled:opacity-55")}
            title={displayName ? `Signed in as ${displayName}` : undefined}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </nav>
      </div>
    </header>
  );
}
