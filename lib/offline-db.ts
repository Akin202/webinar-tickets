/**
 * Offline IndexedDB storage for door scanner using idb.
 * Provides instant local cache for high-reliability door verification.
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Ticket } from '@/types/ticketing';

interface ScannerDB extends DBSchema {
  manifest: {
    key: string;
    value: Ticket;
    indexes: { 'by-code': string };
  };
  queuedCheckIns: {
    key: number;
    value: {
      id?: number;
      code: string;
      staffId: string;
      deviceId: string;
      scannedAt: string;
    };
  };
}

const DB_NAME = 'signout_scanner_manifest_db';
const DEVICE_ID_KEY = 'signout_scanner_device_id';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<ScannerDB>> | null = null;

function getDB(): Promise<IDBPDatabase<ScannerDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ScannerDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('manifest')) {
          const manifestStore = db.createObjectStore('manifest', { keyPath: 'id' });
          manifestStore.createIndex('by-code', 'code', { unique: false });
        }
        if (!db.objectStoreNames.contains('queuedCheckIns')) {
          db.createObjectStore('queuedCheckIns', { keyPath: 'id', autoIncrement: true });
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Stores full ticket manifest in IndexedDB.
 *
 * Destructive by design — this is the first-load path, where there is nothing
 * local worth keeping. Once the door has started scanning, use
 * `mergeManifestIntoIDB` instead: a clear() at that point would resurrect
 * already-admitted passes and hand the screenshot attack a second entry.
 */
export async function cacheManifestInIDB(tickets: Ticket[]): Promise<number> {
  try {
    const db = await getDB();
    const tx = db.transaction('manifest', 'readwrite');
    await tx.objectStore('manifest').clear();
    for (const t of tickets) {
      await tx.objectStore('manifest').put(t);
    }
    await tx.done;
    return tickets.length;
  } catch (err) {
    console.warn('IDB manifest cache error:', err);
    return 0;
  }
}

/**
 * How strongly a status blocks entry. A re-download must never move a ticket
 * DOWN this ladder: the server's view can be stale relative to a check-in that
 * is still sitting in this phone's offline queue.
 */
const ENTRY_STRICTNESS: Record<Ticket['status'], number> = {
  valid: 0,
  checked_in: 1,
  void: 2,
};

/**
 * Re-downloads the manifest without losing local admissions.
 *
 * Picks up late buyers (who are simply absent from an older cache and would
 * otherwise scan as not_found) while keeping the stricter of the two statuses
 * for every ticket already known locally. Rows that vanished from the server
 * manifest are kept, not deleted — a disappeared row must not become a free
 * second entry mid-event.
 */
export async function mergeManifestIntoIDB(tickets: Ticket[]): Promise<number> {
  const db = await getDB();
  const tx = db.transaction('manifest', 'readwrite');
  const store = tx.objectStore('manifest');

  for (const incoming of tickets) {
    const existing = await store.get(incoming.id);
    if (!existing) {
      await store.put(incoming);
      continue;
    }

    const keepLocalStatus =
      ENTRY_STRICTNESS[existing.status] >= ENTRY_STRICTNESS[incoming.status];

    await store.put({
      ...incoming,
      status: keepLocalStatus ? existing.status : incoming.status,
      // Local check-in evidence is what /scan shows the operator as proof.
      checkedInAt: existing.checkedInAt ?? incoming.checkedInAt,
      checkedInBy: existing.checkedInBy ?? incoming.checkedInBy,
      checkedInDevice: existing.checkedInDevice ?? incoming.checkedInDevice,
    });
  }

  await tx.done;
  return await db.count('manifest');
}

/**
 * Gets count of locally cached tickets in IndexedDB.
 */
export async function getCachedTicketsCount(): Promise<number> {
  try {
    const db = await getDB();
    return await db.count('manifest');
  } catch {
    return 0;
  }
}

/** The canonical code shape. A QR may carry a bare code or a full ticket
 *  URL, so pull the code out of whatever was scanned. */
const CODE_PATTERN = /SGN-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}/;

/**
 * Normalises a scanned payload to a ticket code, or null if it contains none.
 * Exported so the scanner can tell "not a ticket QR" from "unknown ticket".
 */
export function extractTicketCode(rawCode: string): string | null {
  const match = rawCode.trim().toUpperCase().match(CODE_PATTERN);
  return match ? match[0] : null;
}

/**
 * Finds a ticket in the local cache.
 *
 * EXACT match on the extracted code — never a substring test. The previous
 * two-way `includes` meant a short manual entry ("SGN") matched whichever
 * ticket happened to sit first in the manifest, which at a door admits the
 * wrong person. A partial code must fail closed.
 */
export async function findCachedTicket(rawCode: string): Promise<Ticket | null> {
  try {
    const code = extractTicketCode(rawCode);
    if (!code) return null;
    const db = await getDB();
    const match = await db.getFromIndex('manifest', 'by-code', code);
    return match ?? null;
  } catch {
    return null;
  }
}

/**
 * Updates a locally cached ticket status to checked_in.
 */
export async function updateCachedTicketStatus(
  ticketId: string,
  timestamp: string,
  staffId = 'door_lead'
): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction('manifest', 'readwrite');
    const store = tx.objectStore('manifest');
    const existing = await store.get(ticketId);
    if (existing) {
      existing.status = 'checked_in';
      existing.checkedInAt = timestamp;
      existing.checkedInBy = staffId;
      await store.put(existing);
    }
    await tx.done;
  } catch (err) {
    console.warn('IDB updateCachedTicketStatus error:', err);
  }
}

/**
 * Marks a cached ticket checked_in by CODE rather than by row id.
 *
 * This is what closes the online→offline first-scan-wins hole. An online
 * admission is decided by the server and never touches the id-keyed path, so
 * without this the local manifest still said `valid` and the same QR admitted
 * a second person the moment the phone lost signal. The scanner only ever
 * holds the code, so the code is the key here.
 *
 * Silent on failure on purpose: the server already recorded the admission, so
 * a cache write failure degrades to "the offline copy is stale", not to a lost
 * admission. It is not the enqueue path.
 */
export async function markCachedTicketCheckedInByCode(
  code: string,
  timestamp: string,
  checkedInBy: string
): Promise<void> {
  try {
    const clean = extractTicketCode(code);
    if (!clean) return;
    const db = await getDB();
    const tx = db.transaction('manifest', 'readwrite');
    const store = tx.objectStore('manifest');
    const existing = await store.index('by-code').get(clean);
    if (existing && existing.status === 'valid') {
      await store.put({
        ...existing,
        status: 'checked_in',
        checkedInAt: timestamp,
        checkedInBy,
      });
    }
    await tx.done;
  } catch (err) {
    console.warn('IDB mirror error:', err);
  }
}

/**
 * Enqueues a check-in record when offline.
 *
 * THROWS on failure, deliberately. This queue row is the only record that a
 * paying guest was let in; swallowing the error returned 0 and let the caller
 * paint a green ADMITTED over an admission the server will never hear about.
 * The caller must show a failure state instead.
 */
export async function enqueueOfflineCheckIn(
  code: string,
  scannedAt: string,
  staffId = 'door_lead',
  deviceId = 'device_01'
): Promise<number> {
  const db = await getDB();
  await db.add('queuedCheckIns', {
    code,
    scannedAt,
    staffId,
    deviceId,
  });
  return await db.count('queuedCheckIns');
}

/**
 * Gets all queued check-ins awaiting synchronization.
 */
export async function getQueuedCheckIns(): Promise<
  Array<{ id?: number; code: string; scannedAt: string; staffId: string; deviceId: string }>
> {
  try {
    const db = await getDB();
    return await db.getAll('queuedCheckIns');
  } catch {
    return [];
  }
}

/**
 * Removes ONLY the queued check-ins that were actually synced, by id.
 *
 * Deliberately not a blanket clear(): a scan landing while a sync is in
 * flight would be wiped without ever reaching the server, and at a door that
 * is a paying guest with no record of admission. Returns the remaining depth.
 */
export async function removeQueuedCheckIns(ids: number[]): Promise<number> {
  try {
    const db = await getDB();
    const tx = db.transaction('queuedCheckIns', 'readwrite');
    for (const id of ids) {
      await tx.objectStore('queuedCheckIns').delete(id);
    }
    await tx.done;
    return await db.count('queuedCheckIns');
  } catch (err) {
    console.warn('IDB remove queue error:', err);
    return await getQueuedCheckInsCount();
  }
}

/** Current queue depth. */
export async function getQueuedCheckInsCount(): Promise<number> {
  try {
    const db = await getDB();
    return await db.count('queuedCheckIns');
  } catch {
    return 0;
  }
}

/**
 * A stable id for THIS phone, generated once and kept in localStorage.
 *
 * Every check-in records it, which is the only way to work out afterwards
 * which door phone admitted someone — the reason checked_in_device exists.
 * A hardcoded literal would make every row claim the same device.
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const fresh = `door-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
    window.localStorage.setItem(DEVICE_ID_KEY, fresh);
    return fresh;
  } catch {
    // Private mode with storage blocked — still better than a shared literal.
    return `door-ephemeral-${Math.random().toString(36).slice(2, 8)}`;
  }
}
