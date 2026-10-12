import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The settle-pending sweep and the verify-and-settle helper it shares with
 * /api/orders/[reference].
 *
 * The FlagIQ Paystack business is shared, so its one webhook URL may point at
 * another app. The sweep is what settles a buyer whose browser never came
 * back from the popup. Worth pinning: a stranger cannot trigger it, it looks
 * at abandoned orders as well as pending ones, and only a Paystack-confirmed
 * success ever reaches mark_order_paid.
 */

const SECRET = 'cron_secret_for_tests';

const rpc = vi.fn();
const paystackVerify = vi.fn();
const after = vi.fn();
const query = {
  select: vi.fn(),
  in: vi.fn(),
  gte: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
};

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdminClient: () => ({ rpc, from: () => query }),
}));
vi.mock('@/lib/api/paystack', () => ({ paystackVerify }));
vi.mock('@/lib/email', () => ({ deliverTicketEmail: vi.fn() }));
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, after };
});

const { GET } = await import('@/app/api/cron/settle-pending/route');
const { verifyAndSettle } = await import('@/lib/api/settle');
const { getSupabaseAdminClient } = await import('@/lib/supabase/admin');

function request(authorization: string | null): Request {
  return new Request('https://example.test/api/cron/settle-pending', {
    headers: authorization === null ? {} : { authorization },
  });
}

function pendingOrders(...references: string[]) {
  query.limit.mockResolvedValue({ data: references.map((reference) => ({ reference })), error: null });
}

function paystackSays(status: string, amountKobo = 1_050_000) {
  return { status, amountKobo, channel: 'bank_transfer', raw: {} };
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  rpc.mockReset().mockResolvedValue({ data: [{ outcome: 'paid' }], error: null });
  paystackVerify.mockReset();
  after.mockReset();
  for (const fn of [query.select, query.in, query.gte, query.order]) {
    fn.mockReset().mockReturnValue(query);
  }
  query.limit.mockReset();
  pendingOrders();
});

describe('settle-pending authorisation', () => {
  it('refuses a request with no bearer token', async () => {
    const res = await GET(request(null));
    expect(res.status).toBe(401);
    expect(query.select).not.toHaveBeenCalled();
  });

  it('refuses a wrong bearer token', async () => {
    const res = await GET(request('Bearer not-the-secret'));
    expect(res.status).toBe(401);
    expect(query.select).not.toHaveBeenCalled();
  });

  it('fails closed when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(request('Bearer undefined'));
    expect(res.status).toBe(500);
    expect(query.select).not.toHaveBeenCalled();
  });
});

describe('settle-pending sweep', () => {
  it('looks at pending and abandoned orders from the last 48 hours, newest first', async () => {
    const before = Date.now();
    await GET(request(`Bearer ${SECRET}`));

    expect(query.in).toHaveBeenCalledWith('status', ['pending', 'abandoned']);
    const since = Date.parse(query.gte.mock.calls[0][1]);
    expect(before - since).toBeGreaterThanOrEqual(48 * 60 * 60_000 - 1_000);
    expect(before - since).toBeLessThanOrEqual(48 * 60 * 60_000 + 1_000);
    expect(query.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(query.limit).toHaveBeenCalledWith(expect.any(Number));
  });

  it('settles only the orders Paystack confirms, and keeps going past a failed verify', async () => {
    pendingOrders('FIQ26-PAID', 'FIQ26-UNPAID', 'FIQ26-DOWN');
    paystackVerify.mockImplementation(async (reference: string) => {
      if (reference === 'FIQ26-PAID') return paystackSays('success');
      if (reference === 'FIQ26-UNPAID') return paystackSays('abandoned');
      throw new Error('Paystack unreachable');
    });

    const res = await GET(request(`Bearer ${SECRET}`));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checked: 3, settled: 1, failed: 1 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('mark_order_paid', expect.objectContaining({
      p_reference: 'FIQ26-PAID',
      p_amount_kobo: 1_050_000,
    }));
  });
});

describe('verifyAndSettle', () => {
  it('never calls mark_order_paid when Paystack has no successful charge', async () => {
    paystackVerify.mockResolvedValue(paystackSays('abandoned'));
    const result = await verifyAndSettle(getSupabaseAdminClient(), 'FIQ26-X', 'verify');
    expect(result).toEqual({ kind: 'not_paid' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('treats an unknown reference at Paystack as not paid', async () => {
    paystackVerify.mockResolvedValue(null);
    const result = await verifyAndSettle(getSupabaseAdminClient(), 'FIQ26-X', 'verify');
    expect(result).toEqual({ kind: 'not_paid' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sends the ticket email only when this call is the one that flipped the order', async () => {
    paystackVerify.mockResolvedValue(paystackSays('success'));

    expect(await verifyAndSettle(getSupabaseAdminClient(), 'FIQ26-X', 'cron'))
      .toEqual({ kind: 'settled', outcome: 'paid' });
    expect(after).toHaveBeenCalledTimes(1);

    rpc.mockResolvedValue({ data: [{ outcome: 'already_paid' }], error: null });
    expect(await verifyAndSettle(getSupabaseAdminClient(), 'FIQ26-X', 'verify'))
      .toEqual({ kind: 'settled', outcome: 'already_paid' });
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('reports a settle error rather than swallowing it', async () => {
    paystackVerify.mockResolvedValue(paystackSays('success'));
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await verifyAndSettle(getSupabaseAdminClient(), 'FIQ26-X', 'cron');

    expect(result).toEqual({ kind: 'settle_error' });
    expect(errorLog).toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
    errorLog.mockRestore();
  });
});
