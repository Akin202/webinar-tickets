import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Ticket email. Two things matter here and neither is the wording: an
 * attacker-supplied buyer name must not reach an inbox as live HTML, and no
 * message claiming "your payment is confirmed" may be sent for an order that
 * is not paid.
 */

const maybeSingle = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}));

const { sendTicketEmail, deliverTicketEmail } = await import('@/lib/email');

/** Captures the JSON body of the single POST to Resend. */
function stubResend(status = 200, body: unknown = { id: 'msg_1' }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>) {
  return JSON.parse(fetchMock.mock.calls[0][1].body as string);
}

beforeEach(() => {
  vi.unstubAllGlobals();
  maybeSingle.mockReset();
  process.env.RESEND_API_KEY = 'test_key';
  process.env.RESEND_FROM_EMAIL = 'tickets@example.test';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://tickets.example.test';
});

describe('sendTicketEmail', () => {
  it('escapes a buyer name carrying markup', async () => {
    const fetchMock = stubResend();
    await sendTicketEmail({
      reference: 'LD26-ABCDEFG-HJKMNPQ',
      buyerName: '<img src=x onerror=alert(1)>',
      buyerEmail: 'buyer@example.test',
      quantity: 1,
    });
    const body = sentBody(fetchMock);
    expect(body.html).not.toContain('<img src=x');
    expect(body.html).toContain('&lt;img');
  });

  it('links to the ticket page and never embeds the code', async () => {
    // The link is the payload, deliberately. An emailed QR is a bearer
    // credential that sits in an inbox forever and cannot show a status.
    const fetchMock = stubResend();
    await sendTicketEmail({
      reference: 'LD26-ABCDEFG-HJKMNPQ',
      buyerName: 'Ade Bello',
      buyerEmail: 'buyer@example.test',
      quantity: 2,
    });
    const body = sentBody(fetchMock);
    expect(body.html).toContain('https://tickets.example.test/ticket/LD26-ABCDEFG-HJKMNPQ');
    expect(body.html).not.toMatch(/FIQ-[2-9A-HJ-NP-Z]{4}/);
    expect(body.text).toContain('https://tickets.example.test/ticket/LD26-ABCDEFG-HJKMNPQ');
  });

  it('sends a plain-text alternative as well as HTML', async () => {
    const fetchMock = stubResend();
    await sendTicketEmail({
      reference: 'LD26-ABCDEFG-HJKMNPQ',
      buyerName: 'Ade Bello',
      buyerEmail: 'buyer@example.test',
      quantity: 1,
    });
    const body = sentBody(fetchMock);
    expect(body.text.length).toBeGreaterThan(80);
    expect(body.subject).toContain('LD26-ABCDEFG-HJKMNPQ');
  });

  it('reports a provider failure instead of pretending it sent', async () => {
    const fetchMock = stubResend(422, { message: 'domain not verified' });
    const result = await sendTicketEmail({
      reference: 'LD26-ABCDEFG-HJKMNPQ',
      buyerName: 'Ade Bello',
      buyerEmail: 'buyer@example.test',
      quantity: 1,
    });
    expect(result).toEqual({ ok: false, reason: 'domain not verified' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('fails loudly rather than silently when unconfigured', async () => {
    delete process.env.RESEND_API_KEY;
    const fetchMock = stubResend();
    const result = await sendTicketEmail({
      reference: 'LD26-ABCDEFG-HJKMNPQ',
      buyerName: 'Ade Bello',
      buyerEmail: 'buyer@example.test',
      quantity: 1,
    });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('deliverTicketEmail', () => {
  it('sends for a paid order', async () => {
    const fetchMock = stubResend();
    maybeSingle.mockResolvedValue({
      data: {
        reference: 'LD26-ABCDEFG-HJKMNPQ',
        buyer_name: 'Ade Bello',
        buyer_email: 'buyer@example.test',
        quantity: 1,
        status: 'paid',
      },
      error: null,
    });
    const result = await deliverTicketEmail('LD26-ABCDEFG-HJKMNPQ');
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each(['pending', 'abandoned', 'failed', 'refunded'])(
    'refuses to confirm payment for a %s order',
    async (status) => {
      const fetchMock = stubResend();
      maybeSingle.mockResolvedValue({
        data: {
          reference: 'LD26-ABCDEFG-HJKMNPQ',
          buyer_name: 'Ade Bello',
          buyer_email: 'buyer@example.test',
          quantity: 1,
          status,
        },
        error: null,
      });
      const result = await deliverTicketEmail('LD26-ABCDEFG-HJKMNPQ');
      expect(result.ok).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('skips complimentary tickets, which have no real inbox', async () => {
    const fetchMock = stubResend();
    maybeSingle.mockResolvedValue({
      data: {
        reference: 'LD26-ABCDEFG-HJKMNPQ',
        buyer_name: 'Guest',
        buyer_email: 'comp@invalid.local',
        quantity: 1,
        status: 'paid',
      },
      error: null,
    });
    const result = await deliverTicketEmail('LD26-ABCDEFG-HJKMNPQ');
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a missing order rather than throwing into the webhook', async () => {
    stubResend();
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const result = await deliverTicketEmail('LD26-NOSUCH-REFERENCE');
    expect(result).toEqual({ ok: false, reason: 'Order not found.' });
  });
});
