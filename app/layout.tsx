import type { Metadata, Viewport } from 'next';
import { Anton, Plus_Jakarta_Sans, Space_Grotesk } from 'next/font/google';
import { eventConfig } from '@/config/event.config';
import { BrandThemeStyle } from '@/lib/theme';
import { DevStateProvider } from '@/components/dev/DevStateProvider';
import './globals.css';

/**
 * Self-hosted via next/font — no render-blocking request to Google, and no
 * layout shift. The families are surfaced as CSS variables so that
 * event.config.ts stays the thing that decides which one is used where.
 *
 * Swapping a font for a new event means changing BOTH the import here and
 * brand.fontHeading / brand.fontBody in the config; next/font resolves at
 * build time, so it cannot be driven by a runtime string alone.
 */
const anton = Anton({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-anton',
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jakarta',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-space-grotesk',
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || eventConfig.seo.siteUrl;

/**
 * Server-rendered so WhatsApp's crawler — which does not execute JavaScript —
 * sees the tags in the initial HTML. This is the whole reason the app is not
 * a Vite SPA.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: eventConfig.seo.title,
  description: eventConfig.seo.description,
  openGraph: {
    type: 'website',
    siteName: eventConfig.event.name,
    title: eventConfig.seo.title,
    description: eventConfig.seo.description,
    url: siteUrl,
    locale: 'en_NG',
    // The image itself comes from app/opengraph-image.tsx, which Next
    // appends to this object automatically with an absolute, hashed URL.
    // Listing it here as well would emit a second og:image tag and let a
    // crawler pick the wrong one.
  },
  twitter: {
    card: 'summary_large_image',
    title: eventConfig.seo.title,
    description: eventConfig.seo.description,
  },
};

export const viewport: Viewport = {
  themeColor: eventConfig.brand.surface,
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${anton.variable} ${jakarta.variable} ${spaceGrotesk.variable}`}
    >
      <head>
        {/* Brand custom properties, derived from event.config.ts. Rendered
            server-side so there is no flash of unthemed content. */}
        <BrandThemeStyle />
      </head>
      <body className="bg-brand-surface text-brand-text font-sans antialiased">
        <DevStateProvider>{children}</DevStateProvider>
      </body>
    </html>
  );
}
