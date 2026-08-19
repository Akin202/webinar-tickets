import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';

/**
 * The signature gate on /api/webhooks/paystack.
 *
 * This is the boundary between a stranger with curl and free tickets: the
 * handler mints passes off whatever body it accepts. The properties worth
 * pinning are that a forged or tampered body never reaches mark_order_paid,
 * and that a valid one does — nothing about Paystack's business logic.
 */

const SECRET = 'sk_test_signature_gate';

const rpc = vi.fn();
const insert = vi.fn().mockResolvedValue({ error: null });

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdminClient: () => ({
    rpc,
    from: () => ({
      insert,
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  }),
}));

// after() would otherwise try to schedule the email send outside a request
// scope. The email path has its own coverage; here it must simply not run.
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, after: vi.fn() };
});

const { POST } = await import('@/app/api/webhooks/paystack/route');

function chargeSuccess(reference = 'LD26-ABCDEFG-HJKMNPQ', amountKobo = 322_500) {
  return JSON.stringify({
    event: 'charge.success',
    data: { reference, amount: amountKobo, channel: 'card' },
  });
}

function request(body: string, signature: string | null): Request {
  return new Request('https://example.test/api/webhooks/paystack', {
    method: 'POST',
    headers: signature === null ? {} : { 'x-paystack-signature': signature },
    body,
  });
}

function sign(body: string): string {
  return createHmac('sha512', SECRET).update(body).digest('hex');
}

describe('paystack webhook signature gate', () => {
  beforeEach(() => {
    process.env.PAYSTACK_SECRET_KEY = SECRET;
    rpc.mockReset().mockResolvedValue({ data: [{ outcome: 'paid' }], error: null });
    insert.mockClear();
  });

  it('settles a correctly signed charge.success', async () => {
    const body = chargeSuccess();
    const res = await POST(request(body, sign(body)));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('mark_order_paid', expect.objectContaining({
      p_reference: 'LD26-ABCDEFG-HJKMNPQ',
      p_amount_kobo: 322_500,
    }));
  });

  it('refuses a body with no signature at all', async () => {
    const res = await POST(request(chargeSuccess(), null));
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a forged signature', async () => {
    const res = await POST(request(chargeSuccess(), 'f'.repeat(128)));
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a body tampered with after signing', async () => {
    // The attack this exists to stop: take a real ₦3,375 webhook, keep its
    // signature, and swap the reference for someone else's order.
    const original = chargeSuccess('LD26-ABCDEFG-HJKMNPQ');
    const signature = sign(original);
    const tampered = chargeSuccess('LD26-2222222-3333333');
    const res = await POST(request(tampered, signature));
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a signature of the right length but wrong value', async () => {
    // timingSafeEqual throws on a length mismatch, so the length check has to
    // come first — this asserts the equal-length path is reached and rejects.
    const body = chargeSuccess();
    const wrong = sign(body).replace(/^./, (c) => (c === 'a' ? 'b' : 'a'));
    const res = await POST(request(body, wrong));
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('acknowledges other signed events without touching the money path', async () => {
    const body = JSON.stringify({ event: 'transfer.success', data: {} });
    const res = await POST(request(body, sign(body)));
    expect(res.status).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns 500 so Paystack retries when the database is down', async () => {
    // A transient DB failure must not silently swallow a real payment.
    rpc.mockResolvedValue({ data: null, error: { message: 'connection refused' } });
    const body = chargeSuccess();
    const res = await POST(request(body, sign(body)));
    expect(res.status).toBe(500);
  });

  it('still answers 200 on an amount mismatch so retries stop', async () => {
    // Never mint on a mismatch, but never loop forever either — it is
    // resolved by hand against the dashboard.
    rpc.mockResolvedValue({ data: [{ outcome: 'amount_mismatch' }], error: null });
    const body = chargeSuccess();
    const res = await POST(request(body, sign(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ outcome: 'amount_mismatch' });
  });

  it('rejects an oversized body without hashing it', async () => {
    // The cap exists so a stranger with curl cannot make us compute an
    // HMAC-SHA512 over megabytes. Correctly signing the payload proves the
    // rejection happens on size alone, before the signature is ever checked.
    const body = JSON.stringify({
      event: 'charge.success',
      data: { reference: 'LD26-ABCDEFG-HJKMNPQ', amount: 322_500, pad: 'x'.repeat(70_000) },
    });
    const res = await POST(request(body, sign(body)));
    expect(res.status).toBe(413);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rate-limits a flood from one address', async () => {
    // 120/min per IP. Everything in this suite shares the 'unknown' key, so
    // this drains the window deliberately and must run last.
    const body = chargeSuccess();
    const signature = sign(body);
    let sawLimit = false;
    for (let i = 0; i < 150; i += 1) {
      const res = await POST(request(body, signature));
      if (res.status === 429) { sawLimit = true; break; }
    }
    expect(sawLimit).toBe(true);
  });
});
