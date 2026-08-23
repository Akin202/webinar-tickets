/**
 * A signed, httpOnly device identity, used only as a rate-limit key.
 *
 * WHY THIS EXISTS. The per-IP limits were the only thing separating one
 * buyer from another, and on this audience that is the wrong instrument.
 * Nigerian mobile data runs behind carrier-grade NAT: MTN, Glo and Airtel
 * egress thousands of subscribers through a handful of addresses. So a
 * per-IP ceiling punishes real buyers who happen to share a carrier during
 * exactly the spike it was meant for, while an abuser steps around it by
 * toggling airplane mode for a fresh address. Too strict and too weak at once.
 *
 * A cookie is not an identity and is not claimed to be one — clearing it
 * mints a new one. What it buys is that two buyers behind one carrier NAT
 * stop counting against each other, and that an abuser has to do more than
 * change IP. It is issued on the PAGE VIEW (see middleware.ts), so anything
 * that POSTs straight at /api/checkout without loading the page arrives with
 * no cookie at all and lands in a stricter bucket.
 *
 * Deliberately NOT marked `server-only`: this is imported from middleware,
 * where that package's bundling conditions are a risk not worth taking on a
 * live site. It is safe without it — DEVICE_ID_SECRET carries no NEXT_PUBLIC_
 * prefix, so Next never inlines it into a client bundle, and a hypothetical
 * client import would simply read `undefined` and get the no-key path below.
 *
 * Web Crypto rather than node:crypto so the identical code runs in middleware
 * and in route handlers with no runtime branch.
 */

export const DEVICE_COOKIE = 'sot_did';

/** 30 days. Long enough to span the sales window and the event itself. */
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** 16 random bytes, base64url — no padding, no '.', so the split below is unambiguous. */
const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let cachedKey: Promise<CryptoKey> | null = null;
let cachedSecret: string | null = null;

/**
 * null when DEVICE_ID_SECRET is unset. Every caller treats that as "no device
 * identity available" and falls back to the IP-only behaviour that shipped
 * before this file existed — so deploying this ahead of setting the variable
 * changes nothing rather than breaking checkout.
 */
function getKey(): Promise<CryptoKey> | null {
  const secret = process.env.DEVICE_ID_SECRET;
  if (!secret) return null;

  if (!cachedKey || cachedSecret !== secret) {
    cachedSecret = secret;
    cachedKey = crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
  }
  return cachedKey;
}

async function sign(id: string, key: CryptoKey): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(id));
  return base64url(new Uint8Array(signature));
}

/**
 * Constant-time compare. Web Crypto has no timingSafeEqual, and while a timing
 * oracle on a rate-limit key is a thin prize, comparing signatures with === is
 * the kind of thing that gets copied into somewhere it matters.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Whether device identity is switched on at all.
 *
 * Callers MUST branch on this before treating a null from readDeviceId() as
 * "this request has no cookie". Without the distinction, an unset secret makes
 * every request in the world look cookieless and drops the whole audience into
 * the strict no-cookie bucket — the exact opposite of the intended fallback.
 */
export function isDeviceIdConfigured(): boolean {
  return Boolean(process.env.DEVICE_ID_SECRET);
}

/** Reads the raw cookie off either a NextRequest or a plain Request. */
function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;

  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/** The device id if the cookie is present and its signature verifies, else null. */
export async function readDeviceId(req: Request): Promise<string | null> {
  const key = await getKey();
  if (!key) return null;

  const raw = readCookie(req, DEVICE_COOKIE);
  if (!raw) return null;

  const dot = raw.indexOf('.');
  if (dot === -1) return null;

  const id = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  if (!ID_PATTERN.test(id)) return null;

  return timingSafeEqual(await sign(id, key), signature) ? id : null;
}

export type IssuedDevice = {
  id: string;
  value: string;
  options: {
    httpOnly: true;
    secure: boolean;
    sameSite: 'lax';
    path: '/';
    maxAge: number;
  };
};

/** Mints a fresh signed id, or null when no secret is configured. */
export async function issueDeviceId(): Promise<IssuedDevice | null> {
  const key = await getKey();
  if (!key) return null;

  const id = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const value = `${id}.${await sign(id, key)}`;

  return {
    id,
    value,
    options: {
      httpOnly: true,
      // Off on plain-HTTP localhost, or the cookie is never stored in dev.
      secure: process.env.NODE_ENV === 'production',
      // 'lax' not 'strict': the buyer returns from Paystack's hosted checkout
      // as a cross-site navigation, and 'strict' would withhold the cookie on
      // that hop and mint a second identity for the same device.
      sameSite: 'lax',
      path: '/',
      maxAge: MAX_AGE_SECONDS,
    },
  };
}
