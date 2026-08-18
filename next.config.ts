import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      // TODO(handoff): the hero is currently a remote Unsplash URL, which
      // puts an external host on the critical path for the LCP element.
      // Session 3: self-host it as AVIF/WebP under 150KB.
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
};

export default nextConfig;
