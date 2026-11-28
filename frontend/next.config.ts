import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingIncludes: {
    '/api/[...path]': ['./src/server/demo-locations.json.gz'],
  },
  skipTrailingSlashRedirect: true,
  productionBrowserSourceMaps: false,
  devIndicators: false,
  experimental: {
    cpus: 1,
    workerThreads: false,
  },
};

export default nextConfig;
