import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Keep the build portable: no hosting-specific adapters, no image optimizer
  // dependency (Render + Vercel both serve this identically).
  images: { unoptimized: true },
  experimental: {
    optimizePackageImports: ['motion'],
  },
};

export default nextConfig;
