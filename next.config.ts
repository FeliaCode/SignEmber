import type { NextConfig } from "next";

// EMBER_BASE_PATH lets the app live under a path (e.g. /Ember) behind the shared nginx.
const basePath = process.env.EMBER_BASE_PATH || "";

const config: NextConfig = {
  basePath,
  poweredByHeader: false,
  // typecheck/lint run separately (tsc) so the build only compiles
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  experimental: { cpus: 2 },
  serverExternalPackages: ["pg"],
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default config;
