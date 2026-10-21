import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-10 px-gutter py-12">
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo size="lg" />
        <p className="label text-ink-muted">The household cookbook</p>
        <div className="rule-double w-full" aria-hidden="true" />
      </div>
      {children}
    </main>
  );
}
