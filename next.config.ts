import type { NextConfig } from 'next';

/**
 * Security headers. No CSP with 'unsafe-inline' theatre — Next injects
 * inline hydration scripts, and a nonce-based CSP needs middleware to stamp
 * every request. The headers below are the ones that are unambiguously
 * correct for this app and cost nothing.
 *
 * frame-ancestors 'none' via X-Frame-Options: the ticket page shows a QR
 * that is a bearer credential, so it must not be embeddable.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    // Camera stays available — /scan needs it. Everything else off.
    value: 'geolocation=(), microphone=(), payment=(), usb=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // No remote patterns, deliberately: every image this app renders is
    // self-hosted under /public/assets. Re-adding a remote host puts a third
    // party back on the LCP path and hands them a request log of everyone
    // who opens the sales link.
    remotePatterns: [],
    // AVIF first — the hero sits behind a heavy overlay, so the extra
    // compression costs nothing visible.
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        // Ticket pages are bearer-token URLs: never cached by a shared proxy,
        // never indexed.
        source: '/ticket/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
      {
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ];
  },
};

export default nextConfig;
