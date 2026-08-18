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

const DB_NAME = 'unilag_scanner_manifest_db';
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

/**
 * Finds a ticket in local IndexedDB by code or QR substring.
 */
export async function findCachedTicket(rawCode: string): Promise<Ticket | null> {
  try {
    const db = await getDB();
    const clean = rawCode.trim().toUpperCase();
    const all = await db.getAll('manifest');
    const match = all.find(
      (t) =>
        t.code.toUpperCase() === clean ||
        clean.includes(t.code.toUpperCase()) ||
        t.code.toUpperCase().includes(clean)
    );
    return match || null;
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
 * Enqueues a check-in record when offline.
 */
export async function enqueueOfflineCheckIn(
  code: string,
  scannedAt: string,
  staffId = 'door_lead',
  deviceId = 'device_01'
): Promise<number> {
  try {
    const db = await getDB();
    await db.add('queuedCheckIns', {
      code,
      scannedAt,
      staffId,
      deviceId,
    });
    return await db.count('queuedCheckIns');
  } catch (err) {
    console.warn('IDB enqueue error:', err);
    return 0;
  }
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
 * Clears synced check-ins from IndexedDB.
 */
export async function clearQueuedCheckIns(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear('queuedCheckIns');
  } catch (err) {
    console.warn('IDB clear queue error:', err);
  }
}
