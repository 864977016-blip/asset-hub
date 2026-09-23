import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig: NextConfig = {
  images: { remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }] },
  experimental: {
    serverActions: {
      bodySizeLimit: "21mb",
    },
  },
};

// Development must not overwrite the files used by a production build/server.
export default (phase: string): NextConfig => ({
  ...nextConfig,
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
});
