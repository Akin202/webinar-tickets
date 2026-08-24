import { DEVICE_COOKIE } from '@/lib/api/device-id';

/**
 * Everything this app stores on a visitor's device, in one place.
 *
 * WHY THIS FILE EXISTS. The disclosure on /cookies and the one-line summary in
 * the banner have to describe what the code actually does, and the only way to
 * keep that true a month from now is to make both read from the same array
 * rather than from someone's memory of what the app used to do. The test in
 * tests/cookie-inventory.test.ts pins the cookie name against the constant the
 * middleware really sets.
 *
 * Note what is NOT here: there is no analytics, no advertising pixel and no
 * third-party tag anywhere in this application. Every entry below is strictly
 * necessary — security, authentication, or the door scanner's core function —
 * which is what makes a notice the correct instrument rather than a consent
 * gate. Nothing here can be switched off and still leave a working product, so
 * nothing here is offered as a choice.
 *
 * If you add a store, add it here in the same commit.
 */

export type StorageKind = 'cookie' | 'localStorage' | 'indexedDB';

export interface StorageEntry {
  /** The literal name as it appears in devtools, so a visitor can find it. */
  name: string;
  kind: StorageKind;
  /** Plain language. This is read by buyers, not by engineers. */
  purpose: string;
  /** How long it survives. */
  lifetime: string;
  /** Which part of the site puts it there. */
  scope: string;
}

/**
 * `sb-*` is deliberately a wildcard: @supabase/ssr derives the exact cookie
 * name from the project ref, so naming one here would be a hostage to a
 * project migration. The prefix is the stable, checkable part.
 */
export const SUPABASE_AUTH_COOKIE_PREFIX = 'sb-';

/**
 * The door phone's local id. Duplicated from DEVICE_ID_KEY in lib/offline-db.ts
 * rather than imported: that module pulls in the whole IndexedDB layer, and the
 * /cookies page is a static server component that has no business loading it.
 * tests/cookie-inventory.test.ts reads offline-db.ts and fails if the two drift.
 */
export const DOOR_DEVICE_STORAGE_KEY = 'signout_scanner_device_id';

export const storageInventory: readonly StorageEntry[] = [
  {
    name: DEVICE_COOKIE,
    kind: 'cookie',
    purpose:
      'Tells one device apart from another so we can rate-limit ticket purchases and stop a single person from holding seats they never intend to pay for. It is signed and marked httpOnly, holds no name, email or phone number, and cannot be read by JavaScript.',
    lifetime: '30 days',
    scope: 'The event page and the checkout page',
  },
  {
    name: `${SUPABASE_AUTH_COOKIE_PREFIX}*`,
    kind: 'cookie',
    purpose:
      'Keeps event staff signed in to the admin dashboard and the door scanner. Set by our authentication provider after a staff member logs in. Buyers never receive these.',
    lifetime: 'Until sign-out or session expiry',
    scope: 'Staff tools only',
  },
  {
    name: DOOR_DEVICE_STORAGE_KEY,
    kind: 'localStorage',
    purpose:
      'A random label for a door phone, so a check-in record shows which scanner admitted a guest. It identifies the phone, not the person holding it.',
    lifetime: 'Until the browser data is cleared',
    scope: 'The door scanner only',
  },
  {
    name: 'Offline ticket cache',
    kind: 'indexedDB',
    purpose:
      'A copy of the ticket list stored on the door phone so scanning still works with no network in the hall. This is a functional requirement of the event, not a tracking mechanism.',
    lifetime: 'Until the browser data is cleared',
    scope: 'The door scanner only',
  },
  {
    name: 'sot_cookie_notice_v1',
    kind: 'localStorage',
    purpose:
      'Remembers that you have already read the notice at the bottom of the page, so it is not shown again. Stores a single flag and nothing else.',
    lifetime: 'Until the browser data is cleared',
    scope: 'The event page and the checkout page',
  },
] as const;

/** Human labels for the `kind` column, kept out of the JSX. */
export const storageKindLabel: Record<StorageKind, string> = {
  cookie: 'Cookie',
  localStorage: 'Local storage',
  indexedDB: 'On-device database',
};
