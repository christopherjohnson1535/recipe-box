import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource/libre-caslon-display/latin-400.css";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "./globals.css";
import { EDITION_SCRIPT } from "@/lib/edition";
import { EditionController } from "@/components/edition/EditionController";
import { SkipLink } from "@/components/ui/SkipLink";

export const metadata: Metadata = {
  title: { default: "Recipe Box", template: "%s · Recipe Box" },
  description: "Your household’s recipes, ready to cook from.",
  applicationName: "Recipe Box",
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }], apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Recipe Box", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  // Matches --color-paper in src/styles/themes/day.css and evening.css; EditionController rewrites it for a chosen edition.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf8f1" },
    { media: "(prefers-color-scheme: dark)", color: "#16130f" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Sets data-theme before first paint so the right edition shows with no flash. Source: src/lib/edition.ts. */}
        <script dangerouslySetInnerHTML={{ __html: EDITION_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <EditionController />
        <SkipLink />
        {children}
      </body>
    </html>
  );
}
