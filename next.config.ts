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
  // Cache policy for the two files that sit outside the hashed build output.
  // This lives here rather than in the host's config so it holds everywhere:
  // Render only accepts `headers` for static sites, and this way `npm run
  // start` locally behaves like production too.
  async headers() {
    return [
      {
        // A stale service worker can make a deploy invisible to anyone who has
        // already installed the app, so this one is never cached.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=3600' }],
      },
    ];
  },
};

export default nextConfig;
