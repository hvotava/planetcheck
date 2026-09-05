import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // PGlite (embedded Postgres used for local dev + tests) ships WASM and must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "pg-native", "ioredis", "@anthropic-ai/sdk", "arctic"],
  experimental: {
    // Keep the OG image route and satori-based rendering on the Node runtime.
    serverActions: { bodySizeLimit: "1mb" },
  },
  images: { formats: ["image/avif", "image/webp"] },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // The embed widget is meant to be iframed anywhere.
        source: "/:locale/embed/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
