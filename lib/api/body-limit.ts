import 'server-only';

/**
 * Caps on request bodies, enforced while reading rather than after.
 *
 * Every POST in this app previously called req.json() or req.text() with no
 * ceiling, so the only limit was the platform's (~4.5 MB on Vercel). That is
 * mostly a nuisance, except on the webhook: it is the one unauthenticated
 * endpoint, and it computed an HMAC-SHA512 over the whole attacker-supplied
 * body BEFORE deciding to reject it. A stranger with curl could make us hash
 * megabytes at will.
 *
 * readCappedText streams and aborts past the cap, so an oversized body is
 * never fully buffered. The Content-Length pre-check is an optimisation for
 * honest clients, not the enforcement — a lying header still hits the stream
 * counter.
 */

/** Enough for the largest honest checkout/admin payload, many times over. */
export const MAX_BODY_BYTES = 16 * 1024;

/** Paystack's charge.success runs ~2-4 KB; 64 KB is generous headroom. */
export const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;

export type CappedRead =
  | { ok: true; text: string }
  | { ok: false; reason: 'too_large' };

export async function readCappedText(
  req: Request,
  maxBytes: number = MAX_BODY_BYTES
): Promise<CappedRead> {
  const declared = req.headers.get('content-length');
  if (declared !== null) {
    const n = Number(declared);
    if (Number.isFinite(n) && n > maxBytes) return { ok: false, reason: 'too_large' };
  }

  if (!req.body) {
    // No stream to meter (some runtimes and test doubles). Fall back to the
    // buffered read — the Content-Length check above is the only guard here.
    return { ok: true, text: await req.text() };
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, reason: 'too_large' };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  // utf8 decode, matching what req.text() would have produced — the webhook
  // HMACs this exact string, so it must not differ by a byte.
  return { ok: true, text: new TextDecoder().decode(merged) };
}

export type CappedJson =
  | { ok: true; value: unknown }
  | { ok: false; reason: 'too_large' | 'invalid_json' };

export async function readCappedJson(
  req: Request,
  maxBytes: number = MAX_BODY_BYTES
): Promise<CappedJson> {
  const read = await readCappedText(req, maxBytes);
  if (!read.ok) return read;

  try {
    return { ok: true, value: JSON.parse(read.text) };
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
}
