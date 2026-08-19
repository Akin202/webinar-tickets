import type { MetadataRoute } from 'next';
import { eventConfig } from '@/config/event.config';

/**
 * The public event page is meant to be found. Nothing else here is.
 *
 * /ticket is the important one: a reference is a bearer token, so a crawled
 * ticket URL is a ticket anyone can present. It already carries noindex
 * metadata and an X-Robots-Tag header — this is the third layer, and the only
 * one that stops a well-behaved crawler before it makes the request at all.
 *
 * /admin and /scan are behind auth, but their login pages are not, and an
 * indexed staff login is free reconnaissance for anyone deciding whether this
 * event is worth attacking.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || eventConfig.seo.siteUrl;

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/ticket/', '/admin', '/scan', '/checkout', '/api/'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
