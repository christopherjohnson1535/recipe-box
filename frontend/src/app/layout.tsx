import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource/libre-caslon-display/latin-400.css";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Recipe Box", template: "%s · Recipe Box" },
  description: "Your household’s recipes, ready to cook from.",
  applicationName: "Recipe Box",
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }], apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Recipe Box", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  // Matches --color-paper in globals.css (light and evening edition).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf8f1" },
    { media: "(prefers-color-scheme: dark)", color: "#16130f" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <a
          href="#main"
          className="label sr-only bg-ink px-4 py-3 text-paper focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
