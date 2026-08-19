import 'server-only';

/**
 * Thin Paystack REST wrapper. Secret key is server-only; there is no separate
 * webhook secret — Paystack signs x-paystack-signature with this same key.
 */

const PAYSTACK_BASE = 'https://api.paystack.co';

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error('PAYSTACK_SECRET_KEY not configured');
  return key;
}

export interface PaystackInitResult {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

export async function paystackInitialize(input: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}): Promise<PaystackInitResult> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: input.email,
      amount: input.amountKobo, // Paystack expects kobo — no conversion
      reference: input.reference,
      callback_url: input.callbackUrl,
      currency: 'NGN',
      metadata: input.metadata,
    }),
    cache: 'no-store',
  });

  const json = await res.json();
  if (!res.ok || !json?.status || !json?.data?.authorization_url) {
    throw new Error(`Paystack initialize failed: ${json?.message ?? res.status}`);
  }
  return {
    authorizationUrl: json.data.authorization_url,
    accessCode: json.data.access_code,
    reference: json.data.reference,
  };
}

export interface PaystackVerifyResult {
  status: 'success' | 'failed' | 'abandoned' | 'pending' | string;
  amountKobo: number;
  channel: string | null;
  raw: unknown;
}

export async function paystackVerify(reference: string): Promise<PaystackVerifyResult | null> {
  const res = await fetch(
    `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${secretKey()}` },
      cache: 'no-store',
    }
  );
  if (res.status === 404) return null;
  const json = await res.json();
  if (!res.ok || !json?.status) {
    throw new Error(`Paystack verify failed: ${json?.message ?? res.status}`);
  }
  return {
    status: json.data?.status,
    amountKobo: json.data?.amount ?? 0,
    channel: json.data?.channel ?? null,
    raw: json.data,
  };
}

/**
 * Cheapest authenticated call Paystack offers, used only by /api/health to
 * answer "are our credentials live and is the API reachable". Returns a
 * boolean rather than throwing — health checks report, they do not fail.
 */
export async function paystackReachable(timeoutMs = 4000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${PAYSTACK_BASE}/balance`, {
      headers: { Authorization: `Bearer ${secretKey()}` },
      signal: controller.signal,
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
