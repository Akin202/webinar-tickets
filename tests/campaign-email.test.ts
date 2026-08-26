import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  campaignContent,
  emailFromUnsubscribeToken,
  unsubscribeToken,
} from '@/lib/campaign-email';

const upsertMock = vi.fn().mockResolvedValue({ error: null });

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdminClient: () => ({
    from: () => ({
      upsert: upsertMock,
    }),
  }),
}));

beforeEach(() => {
  process.env.EMAIL_UNSUBSCRIBE_SECRET = 'test-secret-with-enough-entropy';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://tickets.example.test';
});

describe('campaign email safety', () => {
  it('escapes admin message content and buyer names', () => {
    const content = campaignContent({ kind: 'essential', subject: 'Update',
      message: '<img src=x onerror=alert(1)>', buyerName: '<b>Ada</b>', email: 'ada@example.test' });
    expect(content.html).not.toContain('<img');
    expect(content.html).not.toContain('<b>Ada');
    expect(content.html).toContain('&lt;img');
  });

  it('adds unsubscribe only to marketing email', () => {
    const marketing = campaignContent({ kind: 'marketing', subject: 'Offer', message: 'Hello',
      buyerName: 'Ada', email: 'ADA@example.test' });
    const essential = campaignContent({ kind: 'essential', subject: 'Doors', message: 'Hello',
      buyerName: 'Ada', email: 'ada@example.test' });
    expect(marketing.unsubscribeUrl).toContain('/unsubscribe?token=');
    expect(marketing.text).toContain('Unsubscribe:');
    expect(essential.unsubscribeUrl).toBeNull();
  });

  it('round-trips a normalized email and rejects a modified token', () => {
    const token = unsubscribeToken(' ADA@Example.Test ');
    expect(emailFromUnsubscribeToken(token)).toBe('ada@example.test');
    expect(emailFromUnsubscribeToken(`${token}x`)).toBeNull();
    expect(emailFromUnsubscribeToken('invalid.token.structure')).toBeNull();
    expect(emailFromUnsubscribeToken('')).toBeNull();
  });
});

describe('unsubscribe API endpoint', () => {
  it('handles valid token via GET', async () => {
    const { GET } = await import('@/app/api/unsubscribe/route');
    const token = unsubscribeToken('buyer@example.test');
    const req = new Request(`https://example.test/api/unsubscribe?token=${token}`, { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ unsubscribed: true });
  });

  it('rejects invalid token via GET', async () => {
    const { GET } = await import('@/app/api/unsubscribe/route');
    const req = new Request('https://example.test/api/unsubscribe?token=tampered.token', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('handles valid token via POST json', async () => {
    const { POST } = await import('@/app/api/unsubscribe/route');
    const token = unsubscribeToken('buyer@example.test');
    const req = new Request('https://example.test/api/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ unsubscribed: true });
  });

  it('handles one-click unsubscribe POST with query parameter', async () => {
    const { POST } = await import('@/app/api/unsubscribe/route');
    const token = unsubscribeToken('buyer@example.test');
    const req = new Request(`https://example.test/api/unsubscribe?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});


describe('send preflight', () => {
  // These are the checks that make a misconfiguration cheap. Without them the
  // failure arrives as a throw from inside sendCampaignBatch, after recipient
  // rows have been claimed as `processing` — and because the cause is an unset
  // variable, every retry fails the same way and the campaign never drains.
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.RESEND_FROM_EMAIL = 'tickets@example.test';
    process.env.EMAIL_UNSUBSCRIBE_SECRET = 'test-secret-with-enough-entropy';
  });

  it('passes when everything is configured', async () => {
    const { campaignConfigError } = await import('@/lib/campaign-email');
    expect(campaignConfigError('essential')).toBeNull();
    expect(campaignConfigError('marketing')).toBeNull();
  });

  it('reports a missing Resend key for either kind', async () => {
    const { campaignConfigError } = await import('@/lib/campaign-email');
    delete process.env.RESEND_API_KEY;
    expect(campaignConfigError('essential')).toContain('RESEND_API_KEY');
    expect(campaignConfigError('marketing')).toContain('RESEND_API_KEY');
  });

  it('blocks marketing but not essential when the unsubscribe secret is unset', async () => {
    const { campaignConfigError } = await import('@/lib/campaign-email');
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;

    // Essential mail carries no unsubscribe link, so it is unaffected. This
    // asymmetry is exactly why the bug hid: test sends of essential copy work
    // while every marketing send wedges.
    expect(campaignConfigError('essential')).toBeNull();
    expect(campaignConfigError('marketing')).toContain('EMAIL_UNSUBSCRIBE_SECRET');
  });
});
