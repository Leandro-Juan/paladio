import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  devIndicators: false,
  experimental: {
    cpus: 1,
    workerThreads: false,
  },
};

export default nextConfig;
