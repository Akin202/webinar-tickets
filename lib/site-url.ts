import { eventConfig } from '@/config/event.config';

/**
 * The one place the app's absolute origin is decided. It sets the Paystack
 * callback (where a buyer lands after paying), OG tags, the sitemap and every
 * link in an email.
 *
 * NEXT_PUBLIC_SITE_URL wins so local dev can use http://localhost:3000 while
 * config names the production domain. A placeholder host in production throws
 * rather than silently sending paying buyers to a domain nobody owns.
 */
export function getSiteUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || eventConfig.seo.siteUrl).trim();

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Site URL must be an absolute URL, got "${raw}"`);
  }

  if (process.env.NODE_ENV === 'production' && url.hostname.endsWith('.invalid')) {
    throw new Error(
      `Site URL is still the placeholder "${raw}". Set NEXT_PUBLIC_SITE_URL or eventConfig.seo.siteUrl.`
    );
  }

  return raw.replace(/\/+$/, '');
}
