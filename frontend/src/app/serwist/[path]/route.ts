// Builds and serves the service worker (src/app/sw.ts) at /serwist/sw.js. Turbopack has no plugin hook, so Serwist
// bundles the worker with esbuild here, at build time (force-static), with the precache manifest injected.
import { createSerwistRoute } from "@serwist/turbopack";
import { OFFLINE_URL } from "@/components/offline/rules";

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "src/app/sw.ts",
  useNativeEsbuild: true,
  // A classic (non-module) worker: everything is bundled, and older iPadOS versions only run classic workers.
  esbuildOptions: { format: "iife" },
  // The offline page changes with the build; a new revision per build re-fetches it.
  additionalPrecacheEntries: [{ url: OFFLINE_URL, revision: String(Date.now()) }],
  // Serwist's default patterns plus the self-hosted woff2 fonts, so offline pages keep their type.
  globPatterns: [".next/static/**/*.{js,css,ico,png,svg,webp,json,woff2}", "public/**/*"],
  // The install-sheet screenshots and the icons README are not part of the app shell.
  globIgnores: ["**/node_modules/**/*", "public/screenshots/**", "public/icons/**"],
});
