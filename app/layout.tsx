import type { Metadata, Viewport } from 'next';
import { Fraunces, Instrument_Sans, JetBrains_Mono } from 'next/font/google';
import { eventConfig } from '@/config/event.config';
import { getSiteUrl } from '@/lib/site-url';
import { BrandThemeStyle } from '@/lib/theme';
import { DevStateProvider } from '@/components/dev/DevStateProvider';
import './globals.css';

/**
 * Self-hosted via next/font — no render-blocking request to Google, and no
 * layout shift. The families are surfaced as CSS variables so that
 * event.config.ts stays the thing that decides which one is used where.
 */
// Display face: one weight only (900) — it is used for headlines and prices,
// never body copy, so every extra weight would be bytes on metered data.
const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-fraunces',
  weight: ['900'],
});

const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-instrument',
  weight: ['400', '500', '600'],
});

// Codes, times and money. A third family by exception: ticket codes are read
// aloud at the door, and a monospace face keeps 8/B and 5/S distinguishable.
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains',
  weight: ['500', '700'],
});

const siteUrl = getSiteUrl();

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
      className={`${fraunces.variable} ${instrumentSans.variable} ${jetbrainsMono.variable}`}
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
