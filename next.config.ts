import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {
    // Playwright loads runtime files such as browsers.json dynamically, which
    // Next's tracer can miss when packaging the scrape function for Vercel.
    "/api/scrape": ["./node_modules/playwright-core/**/*"],
  },
  images: {
    // Wildcard hostname: recipe scraping pulls images from arbitrary external
    // sites, so we cannot restrict to a fixed allowlist.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
    minimumCacheTTL: 60,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // CSP is set dynamically in middleware.ts with a per-request nonce (R3-6).
          // Only static security headers remain here.
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
