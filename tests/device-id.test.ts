import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DEVICE_COOKIE,
  readDeviceId,
  issueDeviceId,
  isDeviceIdConfigured,
} from '@/lib/api/device-id';

/**
 * The signed device cookie used as a rate-limit key.
 *
 * What actually matters here is not that a correct cookie round-trips — it is
 * that a forged one does not, and that with no secret configured the whole
 * mechanism reports "off" rather than reporting "nobody has a cookie". The
 * second failure mode would drop every real buyer into the strict no-cookie
 * bucket, which is worse than not shipping the feature.
 */

const SECRET = 'test-device-secret-not-a-real-one';

function requestWithCookie(cookie: string): Request {
  return new Request('https://example.test/api/checkout', {
    headers: { cookie },
  });
}

let originalSecret: string | undefined;

beforeEach(() => {
  originalSecret = process.env.DEVICE_ID_SECRET;
  process.env.DEVICE_ID_SECRET = SECRET;
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.DEVICE_ID_SECRET;
  else process.env.DEVICE_ID_SECRET = originalSecret;
});

describe('device id', () => {
  it('round-trips an issued cookie back to the same id', async () => {
    const issued = await issueDeviceId();
    expect(issued).not.toBeNull();

    const read = await readDeviceId(requestWithCookie(`${DEVICE_COOKIE}=${issued!.value}`));
    expect(read).toBe(issued!.id);
  });

  it('issues a different id each time', async () => {
    const a = await issueDeviceId();
    const b = await issueDeviceId();
    expect(a!.id).not.toBe(b!.id);
  });

  it('rejects a tampered signature', async () => {
    const issued = await issueDeviceId();
    const [id, signature] = issued!.value.split('.');

    // Flip one character of the signature, keeping the length identical so the
    // constant-time compare is exercised rather than the length short-circuit.
    const flipped = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);

    const read = await readDeviceId(requestWithCookie(`${DEVICE_COOKIE}=${id}.${flipped}`));
    expect(read).toBeNull();
  });

  it('rejects an id swapped under a valid signature', async () => {
    const a = await issueDeviceId();
    const b = await issueDeviceId();
    const bSignature = b!.value.split('.')[1];

    const read = await readDeviceId(requestWithCookie(`${DEVICE_COOKIE}=${a!.id}.${bSignature}`));
    expect(read).toBeNull();
  });

  it('rejects a cookie signed with a different secret', async () => {
    const issued = await issueDeviceId();

    process.env.DEVICE_ID_SECRET = 'a-completely-different-secret';
    const read = await readDeviceId(requestWithCookie(`${DEVICE_COOKIE}=${issued!.value}`));

    expect(read).toBeNull();
  });

  it('rejects malformed values without throwing', async () => {
    for (const value of ['', 'nodot', '.', 'a.b', `${'x'.repeat(22)}.`, 'not-base64!!.sig']) {
      const read = await readDeviceId(requestWithCookie(`${DEVICE_COOKIE}=${value}`));
      expect(read).toBeNull();
    }
  });

  it('finds its cookie among others', async () => {
    const issued = await issueDeviceId();
    const header = `sb-access-token=xyz; ${DEVICE_COOKIE}=${issued!.value}; other=1`;

    expect(await readDeviceId(requestWithCookie(header))).toBe(issued!.id);
  });

  it('returns null when there is no cookie header at all', async () => {
    const bare = new Request('https://example.test/api/checkout');
    expect(await readDeviceId(bare)).toBeNull();
  });

  it('is httpOnly, lax and site-wide', async () => {
    const issued = await issueDeviceId();
    expect(issued!.options.httpOnly).toBe(true);
    expect(issued!.options.path).toBe('/');
    // 'lax', not 'strict': the buyer returns from Paystack's hosted checkout as
    // a cross-site navigation, and 'strict' would withhold the cookie on that
    // hop and mint a second identity for the same device.
    expect(issued!.options.sameSite).toBe('lax');
    expect(issued!.options.maxAge).toBeGreaterThan(0);
  });

  describe('with no secret configured', () => {
    beforeEach(() => {
      delete process.env.DEVICE_ID_SECRET;
    });

    it('reports itself as off', () => {
      expect(isDeviceIdConfigured()).toBe(false);
    });

    it('issues nothing', async () => {
      expect(await issueDeviceId()).toBeNull();
    });

    it('reads nothing, so callers must not read this as "no cookie"', async () => {
      const read = await readDeviceId(requestWithCookie(`${DEVICE_COOKIE}=anything.atall`));
      expect(read).toBeNull();
    });
  });
});
