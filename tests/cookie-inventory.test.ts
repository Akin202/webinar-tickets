import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEVICE_COOKIE } from '@/lib/api/device-id';
import {
  storageInventory,
  storageKindLabel,
  DOOR_DEVICE_STORAGE_KEY,
  SUPABASE_AUTH_COOKIE_PREFIX,
} from '@/lib/cookie-inventory';

/**
 * The disclosure on /cookies is generated from lib/cookie-inventory.ts, which
 * means the page is only as honest as that array is current. Nothing in the
 * type system stops someone adding a cookie in middleware and never touching
 * the inventory, and the failure is silent: the page keeps rendering, it just
 * quietly stops being true. These tests are the thing that notices.
 *
 * Offline by design — reads source files, makes no network calls.
 */

const SOURCE_ROOT = resolve(import.meta.dirname, '..');

function readSource(relativePath: string): string {
  return readFileSync(resolve(SOURCE_ROOT, relativePath), 'utf8');
}

const names = storageInventory.map((entry) => entry.name);

describe('cookie inventory', () => {
  it('discloses the anti-abuse cookie under the name actually set', () => {
    // Not the literal 'sot_did': imported from the module the middleware uses,
    // so renaming the cookie without updating the disclosure fails here.
    expect(names).toContain(DEVICE_COOKIE);
  });

  it('discloses the staff auth cookies', () => {
    expect(names).toContain(`${SUPABASE_AUTH_COOKIE_PREFIX}*`);
  });

  it('discloses the door scanner storage under the key offline-db really uses', () => {
    // DEVICE_ID_KEY is not exported — importing offline-db.ts here would drag
    // the whole IndexedDB layer into a static server page for no reason, so the
    // literal is duplicated and pinned against the source text instead.
    const offlineDb = readSource('lib/offline-db.ts');
    expect(offlineDb).toContain(`'${DOOR_DEVICE_STORAGE_KEY}'`);
    expect(names).toContain(DOOR_DEVICE_STORAGE_KEY);
  });

  it("discloses the notice's own dismissal flag under the key it writes", () => {
    const notice = readSource('components/CookieNotice.tsx');
    const match = notice.match(/const DISMISSED_KEY = '([^']+)'/);
    expect(match?.[1]).toBeTruthy();
    expect(names).toContain(match![1]);
  });

  it('gives every entry a purpose, a lifetime and a scope', () => {
    for (const entry of storageInventory) {
      expect(entry.name.trim(), `name for ${entry.name}`).not.toBe('');
      expect(entry.purpose.trim().length, `purpose for ${entry.name}`).toBeGreaterThan(20);
      expect(entry.lifetime.trim(), `lifetime for ${entry.name}`).not.toBe('');
      expect(entry.scope.trim(), `scope for ${entry.name}`).not.toBe('');
      expect(storageKindLabel[entry.kind], `label for ${entry.kind}`).toBeTruthy();
    }
  });

  it('lists each name once', () => {
    expect(new Set(names).size).toBe(names.length);
  });

  it('covers every cookie the middleware sets', () => {
    // response.cookies.set(NAME, ...) — catches a second cookie being added to
    // the buyer path without a matching disclosure entry.
    const middleware = readSource('middleware.ts');
    const setCalls = [...middleware.matchAll(/response\.cookies\.set\(\s*([A-Za-z_$][\w$]*)/g)];

    // Today there are exactly two call sites, and both are disclosed:
    //   DEVICE_COOKIE — the anti-abuse cookie, inventoried by that constant.
    //   name          — the destructured loop variable in @supabase/ssr's
    //                   setAll callback, i.e. the sb-* auth cookies, which the
    //                   inventory covers by prefix because the exact name is
    //                   derived from the project ref.
    // A third entry here means a cookie was added without a disclosure.
    expect(setCalls.map((m) => m[1])).toEqual(['DEVICE_COOKIE', 'name']);
  });
});
