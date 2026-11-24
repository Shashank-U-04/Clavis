import type { NextConfig } from "next";

/**
 * Security headers for every page. A strict Content-Security-Policy with per-request nonces
 * is planned for the auth phase (it needs middleware); these headers apply already.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // the 3D models and their pictures: kept for a day, then refreshed in the background.
      // Their URLs carry a version (src/three/plants.ts, avatar.ts), so a change never mixes old and new.
      { source: "/models/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
    ];
  },
};

export default config;
