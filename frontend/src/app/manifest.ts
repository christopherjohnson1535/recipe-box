import type { MetadataRoute } from "next";

// Matches --color-paper in src/styles/themes/day.css (manifest.test.ts checks it).
const PAPER = "#f4f4f1";

const icon = (src: string, size: number, purpose: "any" | "maskable" = "any") => ({
  src,
  sizes: `${size}x${size}`,
  type: "image/png",
  purpose,
});

// Served at /manifest.webmanifest.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Recipe Box",
    short_name: "Recipes",
    description: "Your household’s recipes, ready to cook from.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    lang: "en",
    background_color: PAPER,
    theme_color: PAPER,
    categories: ["food", "lifestyle"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      icon("/icon-192.png", 192),
      icon("/icon-512.png", 512),
      icon("/icon-maskable-512.png", 512, "maskable"),
    ],
    shortcuts: [
      { name: "Import a recipe", url: "/import", icons: [icon("/shortcut-96.png", 96)] },
      { name: "Write a recipe", url: "/recipes/new", icons: [icon("/shortcut-96.png", 96)] },
    ],
    screenshots: [
      { src: "/screenshots/wide.png", sizes: "1280x800", type: "image/png", form_factor: "wide", label: "Sign in to Recipe Box" },
      { src: "/screenshots/narrow.png", sizes: "750x1334", type: "image/png", form_factor: "narrow", label: "Sign in to Recipe Box" },
    ],
  };
}
