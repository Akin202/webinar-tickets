import type { MetadataRoute } from 'next';
import { eventConfig } from '@/config/event.config';

/**
 * One entry, deliberately.
 *
 * app/robots.ts advertises this file, and until now nothing served it — a
 * crawler following the `Sitemap:` line got a 404, which is the kind of small
 * broken signal that makes a link look untrustworthy to the systems that
 * decide whether a WhatsApp preview renders.
 *
 * Only the public event page belongs here. /ticket/* is a bearer credential,
 * /admin and /scan are staff tools, and /checkout is a step in a flow rather
 * than a destination — all four are disallowed in robots.ts and listing any of
 * them here would contradict that.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || eventConfig.seo.siteUrl;

  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
  ];
}
