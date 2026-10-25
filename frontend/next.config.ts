import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

// /api/* and /media/* are proxied by route handlers (src/app/api, src/app/media), not
// `rewrites`, because rewrite destinations are frozen into the build and the same image
// must reach API_INTERNAL_URL on any host.
const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// withSerwist keeps esbuild (which bundles the service worker, src/app/serwist) out of the server bundle.
export default withSerwist(nextConfig);
