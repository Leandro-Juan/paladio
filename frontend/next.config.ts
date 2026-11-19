import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  skipTrailingSlashRedirect: true,
  productionBrowserSourceMaps: false,
  devIndicators: false,
  experimental: {
    cpus: 1,
    workerThreads: false,
  },
};

export default nextConfig;
