import type { ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";
import { Rule } from "@/components/ui/Rule";
import { Text } from "@/components/ui/Text";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-start gap-12 px-gutter pt-16 pb-20 sm:pt-28">
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo size="lg" />
        <Text variant="meta">The household cookbook</Text>
        <Rule variant="double" />
      </div>
      {children}
    </main>
  );
}
