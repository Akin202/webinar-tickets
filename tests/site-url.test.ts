import { describe, it, expect, afterEach, vi } from 'vitest';
import { getSiteUrl } from '@/lib/site-url';
import { eventConfig } from '@/config/event.config';

/**
 * The site URL decides where Paystack sends a buyer after they pay. A wrong
 * value is not a cosmetic bug: the money moves and the buyer lands on a dead
 * page. So an unconfigured production deploy must refuse, not guess.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getSiteUrl', () => {
  it('prefers NEXT_PUBLIC_SITE_URL over config', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
    expect(getSiteUrl()).toBe('http://localhost:3000');
  });

  it('strips a trailing slash so paths join cleanly', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://webinar.flagiq.org/');
    expect(getSiteUrl()).toBe('https://webinar.flagiq.org');
  });

  it('falls back to config when the env var is empty', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    expect(getSiteUrl()).toBe(eventConfig.seo.siteUrl.replace(/\/$/, ''));
  });

  it('refuses a placeholder .invalid host in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://summit-domain.invalid');
    expect(() => getSiteUrl()).toThrow(/placeholder/);
  });

  it('refuses a malformed URL', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'webinar.flagiq.org');
    expect(() => getSiteUrl()).toThrow(/absolute/);
  });
});
