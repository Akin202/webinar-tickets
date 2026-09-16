import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site-url';

/**
 * One entry, deliberately.
 *
 * app/robots.ts advertises this file, and until now nothing served it — a
 * crawler following the `Sitemap:` line got a 404, which is the kind of small
 * broken signal that makes a link look untrustworthy to the systems that
 * decide whether a WhatsApp preview renders.
 *
 * Two entries, deliberately.
 *
 * The public event page, and /cookies. /ticket/* is a bearer credential,
 * /admin and /scan are staff tools, and /checkout is a step in a flow rather
 * than a destination — all four are disallowed in robots.ts and listing any of
 * them here would contradict that. /cookies is in none of those categories: it
 * is a standing public disclosure that should stay reachable and citable on
 * its own, which is the whole point of publishing one.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();

  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${siteUrl}/cookies`,
      lastModified: new Date(),
      // It changes when the disclosure changes, which is rarely, and it is
      // not what anyone is here to find.
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}
