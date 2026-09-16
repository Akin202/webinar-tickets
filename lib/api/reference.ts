import { randomBytes } from 'node:crypto';

/**
 * The alphabet used by every reference and ticket code in the product. No
 * 0/O/1/I/L — a reference gets read aloud down a phone line and typed in by
 * someone standing in a queue.
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/**
 * Largest multiple of 31 that fits in a byte (248). Bytes at or above this are
 * discarded rather than folded with `%`: 256 is not divisible by 31, so a plain
 * modulo makes the first eight letters of the alphabet ~12% more likely than
 * the rest. That is a small bias, but a reference is a bearer token for
 * /ticket/[reference] and bias is entropy you did not get.
 */
const REJECTION_CEILING = 248;

/**
 * `count` uniformly-distributed characters from ALPHABET.
 *
 * Draws in batches and refills on exhaustion, so rejection never turns into a
 * per-character syscall. The loop terminates with probability 1 — each batch
 * keeps ~97% of its bytes.
 */
function randomChars(count: number): string {
  let out = '';
  while (out.length < count) {
    const batch = randomBytes(count * 2);
    for (let i = 0; i < batch.length && out.length < count; i++) {
      if (batch[i] >= REJECTION_CEILING) continue;
      out += ALPHABET[batch[i] % 31];
    }
  }
  return out;
}

/**
 * An unguessable order reference.
 *
 * This doubles as the bearer token for /ticket/[reference] — anyone holding it
 * sees that order's tickets — so it needs real entropy, not a timestamp. 14
 * characters over a 31-letter alphabet is ~69 bits.
 *
 * Every order goes through here, purchases and complimentary tickets alike.
 * Comps used to be `LD26-COMP-${Date.now().toString(36)}`, which was both
 * enumerable (a millisecond counter walks the whole space) and collision-prone
 * (two comps issued in the same millisecond produced the same reference).
 */
export function generateReference(): string {
  const chars = randomChars(14);
  return `FIQ26-${chars.slice(0, 7)}-${chars.slice(7)}`;
}
