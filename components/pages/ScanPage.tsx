'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

import Link from 'next/link';
// Type-only: the decoder itself is imported on demand inside the camera
// effect so it does not sit in the /scan entry chunk. See startCamera below.
import type { IScannerControls } from '@zxing/browser';
import {
  Camera,
  Keyboard,
  CheckCircle2,
  AlertOctagon,
  XCircle,
  AlertTriangle,
  Ban,
  ServerCrash,
  Clock,
  UserCheck,
  RefreshCw,
  DownloadCloud,
  ShieldCheck,
  LogOut,
  Volume2,
  Vibrate,
  ShieldAlert,
} from 'lucide-react';
import {
  getCheckInManifest,
  checkInTicket,
  getPublicSalesCounter,
  syncQueuedCheckIns,
} from '@/lib/data-access';
import {
  mergeManifestIntoIDB,
  getCachedTicketsCount,
  findCachedTicket,
  updateCachedTicketStatus,
  markCachedTicketCheckedInByCode,
  enqueueOfflineCheckIn,
  getQueuedCheckIns,
  getQueuedCheckInsCount,
  removeQueuedCheckIns,
  extractTicketCode,
  getDeviceId,
} from '@/lib/offline-db';
import { useDevState } from '@/components/dev/DevStateProvider';
import { useOfflineShell } from '@/hooks/useOfflineShell';
import { fireScanFeedback, getFeedbackCapabilities } from '@/lib/scanner-feedback';
import { CheckInResult, formatPhoneForDisplay, StaffUser } from '@/types/ticketing';
import { getCurrentStaffUser } from '@/lib/data-access';
import { eventConfig } from '@/config/event.config';

/**
 * How long the door will wait on the server before the local cache decides.
 *
 * `navigator.onLine` is true on captive or saturated venue Wi-Fi with no
 * uplink, where a Supabase call can hang for tens of seconds. The scan-to-
 * result budget is 300ms, so the network gets 250ms and no more.
 */
const SCAN_ONLINE_DEADLINE_MS = 250;

/** What the operator is shown when a check-in could not be recorded at all. */
interface ScanFailure {
  code: string;
  detail: string;
}

/** How long the per-code lock will wait on a mirror write before giving up. */
const MIRROR_SETTLE_CAP_MS = 1500;

interface DeadlineOutcome {
  /** null = the request threw, or blew the deadline. Use the cache. */
  result: CheckInResult | null;
  /** Resolves once the local cache agrees with the server (or we stop waiting). */
  mirrored: Promise<void>;
}

/**
 * The online check-in, capped at SCAN_ONLINE_DEADLINE_MS.
 *
 * Returns result null when the request threw or ran out of time — the caller
 * then falls through to the IndexedDB path. A late server reply is harmless:
 * `record_check_in` is idempotent, so whichever path lands second is a no-op,
 * and the mirror below still runs so the local manifest agrees with the server.
 *
 * The request is raced rather than aborted because `checkInTicket`'s signature
 * is a frozen contract (`lib/data-access.ts`) and takes no AbortSignal.
 */
function checkInWithDeadline(
  input: { code: string; staffId: string; deviceId: string; scannedAt: string },
  mirrorAs: string
): Promise<DeadlineOutcome> {
  let markMirrored: () => void = () => {};
  const mirrored = new Promise<void>((resolve) => {
    markMirrored = resolve;
    // A request that never settles must not hold this code's lock for the
    // night. The door always gets its scanner back.
    setTimeout(resolve, MIRROR_SETTLE_CAP_MS);
  });

  const request = checkInTicket(input).then(
    (res) => {
      // Runs whether or not this promise won the race, and deliberately does
      // NOT block the verdict. Without it an online admission never reached
      // IndexedDB, and the same QR admitted a second person the moment the
      // phone dropped off the network.
      void (async () => {
        try {
          if (res.kind === 'admitted') {
            await markCachedTicketCheckedInByCode(input.code, input.scannedAt, mirrorAs);
          } else if (res.kind === 'already_used') {
            await markCachedTicketCheckedInByCode(
              input.code,
              res.firstScannedAt || input.scannedAt,
              res.firstScannedBy || mirrorAs
            );
          }
        } finally {
          markMirrored();
        }
      })();
      return res;
    },
    (err) => {
      console.warn('Online check-in failed, falling back to cache:', err);
      markMirrored();
      return null;
    }
  );

  const deadline = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), SCAN_ONLINE_DEADLINE_MS);
  });

  return Promise.race([request, deadline]).then((result) => ({ result, mirrored }));
}

export const ScanPage: React.FC = () => {
  const { forcedScanResult: forcedResult, setForcedScanResult } = useDevState();
  const onClearForcedResult = () => setForcedScanResult(undefined);
  // Scanner UI States
  const [scannerMode, setScannerMode] = useState<'camera' | 'manual'>('camera');
  const [manualCode, setManualCode] = useState<string>('');
  const [activeResult, setActiveResult] = useState<CheckInResult | null>(null);
  const [scanFailure, setScanFailure] = useState<ScanFailure | null>(null);

  // Connectivity & Offline Manifest States
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  // Registers the service worker and reports whether a cold reload with no
  // network would still render this page. Two different questions from
  // `isOnline`, and staff need the answer to this one BEFORE they lose signal.
  const offlineShell = useOfflineShell();
  const recheckOfflineShell = offlineShell.recheck;
  const [cachedCount, setCachedCount] = useState<number>(0);
  const [queuedCount, setQueuedCount] = useState<number>(0);
  const [manifestNotice, setManifestNotice] = useState<string | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [isRefreshingManifest, setIsRefreshingManifest] = useState<boolean>(false);
  // Starts at 0, not a mock figure — the real count arrives with the manifest.
  const [admittedCount, setAdmittedCount] = useState<number>(0);
  const [totalCapacity, setTotalCapacity] = useState<number>(eventConfig.ticketing.capacity);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [staffUser, setStaffUser] = useState<StaffUser | null>(null);
  const [feedbackCaps, setFeedbackCaps] = useState<{ haptics: boolean; audio: boolean }>({
    haptics: false,
    audio: false,
  });

  // Camera & Video Elements
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Syncing state
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  /* ----------------------------------------------------------------
     Refs read at CALL time.

     The ZXing decode callback is created once when the camera starts and
     then lives for the whole session. Anything it read from a render
     closure — connectivity, who is signed in, the running count — froze at
     camera start: a phone that went offline mid-queue kept trying the
     network, and check-ins were attributed to nobody. Refs are the only
     values these handlers may read.
     ---------------------------------------------------------------- */
  const isOnlineRef = useRef<boolean>(isOnline);
  const staffUserRef = useRef<StaffUser | null>(null);
  const admittedCountRef = useRef<number>(0);
  const inFlightCodesRef = useRef<Set<string>>(new Set());
  const isSyncingRef = useRef<boolean>(false);
  const isRefreshingManifestRef = useRef<boolean>(false);

  /** Single source of truth for the admitted counter — no render-closure drift. */
  const bumpAdmitted = useCallback((): number => {
    admittedCountRef.current += 1;
    setAdmittedCount(admittedCountRef.current);
    return admittedCountRef.current;
  }, []);

  /**
   * Flushes the offline queue. Snapshot, send, then delete ONLY what this
   * pass actually sent: a scan arriving mid-sync must survive, and
   * record_check_in is idempotent so a duplicate replay returns already_used
   * rather than double-admitting.
   */
  const runSync = useCallback(async (): Promise<void> => {
    if (isSyncingRef.current || !isOnlineRef.current) return;

    const queue = await getQueuedCheckIns();
    const snapshot = queue.filter((q) => typeof q.id === 'number');
    if (snapshot.length === 0) {
      setQueuedCount(0);
      return;
    }

    isSyncingRef.current = true;
    setIsSyncing(true);
    setSyncError(null);
    try {
      await syncQueuedCheckIns(
        snapshot.map((q) => ({
          code: q.code,
          staffId: q.staffId,
          deviceId: q.deviceId,
          scannedAt: q.scannedAt,
        }))
      );
      const remaining = await removeQueuedCheckIns(snapshot.map((q) => q.id as number));
      setQueuedCount(remaining);
    } catch (err) {
      console.warn('Sync failed:', err);
      setSyncError('Sync failed — check-ins are still saved on this phone. Retry when you have signal.');
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, []);

  /**
   * Re-downloads the manifest so late buyers stop scanning as not_found.
   *
   * Distinct from sync, which pushes. This merges rather than replaces: a
   * clear-and-refill would resurrect passes this phone admitted while offline
   * and hand the screenshot attack a second entry.
   */
  const refreshManifest = useCallback(async (): Promise<void> => {
    if (isRefreshingManifestRef.current) return;
    isRefreshingManifestRef.current = true;
    setIsRefreshingManifest(true);
    setManifestError(null);
    try {
      // Counts only. getSalesSummary is admin-only and carries revenue —
      // a door phone must never fetch it.
      const [manifest, counter] = await Promise.all([
        getCheckInManifest(),
        getPublicSalesCounter(),
      ]);
      const cachedTotal = await mergeManifestIntoIDB(manifest);
      setCachedCount(cachedTotal);
      setTotalCapacity(counter.capacity);
      // The server also counts the other door's admissions; local offline
      // admissions are not there yet. Neither may move the number backwards.
      admittedCountRef.current = Math.max(admittedCountRef.current, counter.ticketsCheckedIn);
      setAdmittedCount(admittedCountRef.current);
      setManifestNotice(`Manifest updated — ${cachedTotal} passes cached. Safe to go offline.`);
    } catch (err) {
      console.warn('Could not refresh manifest:', err);
      const existingCount = await getCachedTicketsCount();
      setCachedCount(existingCount);
      setManifestError(
        existingCount > 0
          ? 'Manifest not refreshed — still using the copy on this phone.'
          : 'No manifest on this phone. Get signal and refresh before scanning.'
      );
    } finally {
      isRefreshingManifestRef.current = false;
      setIsRefreshingManifest(false);
    }
  }, []);

  // 1. Monitor online/offline state. Coming back online auto-flushes the
  //    queue — waiting for someone to notice a badge at a door does not happen.
  useEffect(() => {
    const handleOnline = () => {
      isOnlineRef.current = true;
      setIsOnline(true);
      void runSync();
    };
    const handleOffline = () => {
      isOnlineRef.current = false;
      setIsOnline(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [runSync]);

  // 2. Warn operator if leaving with unsynced check-ins
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (queuedCount > 0) {
        e.preventDefault();
        e.returnValue = 'You have unsaved offline check-ins! Leaving now may cause data loss.';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [queuedCount]);

  // 2b. Queue depth is authoritative in IndexedDB, not in React state. Re-read
  //     it whenever the tab comes back — another tab, a reload, or a
  //     backgrounded sync may have changed it under us.
  useEffect(() => {
    const refreshQueueDepth = () => {
      if (document.visibilityState !== 'visible') return;
      getQueuedCheckInsCount()
        .then(setQueuedCount)
        .catch(() => {
          /* the badge is a display; the rows are still on disk */
        });
    };
    refreshQueueDepth();
    document.addEventListener('visibilitychange', refreshQueueDepth);
    window.addEventListener('focus', refreshQueueDepth);
    return () => {
      document.removeEventListener('visibilitychange', refreshQueueDepth);
      window.removeEventListener('focus', refreshQueueDepth);
    };
  }, []);

  // 2c. Only claim a non-visual feedback channel this device actually has.
  useEffect(() => {
    setFeedbackCaps(getFeedbackCapabilities());
  }, []);

  // Who is signed in at this terminal — recorded against every check-in.
  useEffect(() => {
    let isMounted = true;
    getCurrentStaffUser()
      .then((user) => {
        staffUserRef.current = user;
        if (isMounted) setStaffUser(user);
      })
      .catch(() => {
        /* offline: check-ins still queue, staff id resolves on sync */
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // 3. Initial manifest download & capacity loading
  useEffect(() => {
    void refreshManifest();
  }, [refreshManifest]);

  // 3b. The "manifest ready" toast is informational — retire it on a timer.
  useEffect(() => {
    if (!manifestNotice) return;
    const timer = setTimeout(() => setManifestNotice(null), 4500);
    return () => clearTimeout(timer);
  }, [manifestNotice]);

  // Handle Scan Verification (with offline-first fallback)
  const handleScanSubmit = useCallback(
    async (codeOrQr: string): Promise<void> => {
      const raw = codeOrQr.trim();
      if (!raw) return;

      // Normalise first. A QR may carry a full ticket URL; a manual entry may
      // be a partial. Anything without a well-formed code fails closed rather
      // than fuzzy-matching its way onto someone else's ticket.
      const clean = extractTicketCode(raw);
      if (!clean) {
        setScanFailure(null);
        setActiveResult({ kind: 'not_found', scannedCode: raw });
        return;
      }

      // Per-code lock. Two decodes of the same QR milliseconds apart both
      // passed the checked_in test before either had written, and both
      // painted ADMITTED. Whoever holds the lock owns this code.
      if (inFlightCodesRef.current.has(clean)) return;
      inFlightCodesRef.current.add(clean);

      try {
        const nowIso = new Date().toISOString();
        const deviceId = getDeviceId();
        const staff = staffUserRef.current;
        const staffLabel = staff?.name ?? 'Gate Officer';

        // A. If online, the server decides — but only if it answers in time.
        if (isOnlineRef.current) {
          const { result: res, mirrored } = await checkInWithDeadline(
            { code: clean, staffId: staff?.id ?? '', deviceId, scannedAt: nowIso },
            staffLabel
          );
          if (res) {
            setScanFailure(null);
            setActiveResult(res);
            if (res.kind === 'admitted') bumpAdmitted();
            // The verdict is already on screen — this await is off the
            // scan-to-result path. It exists so the per-code lock in the
            // `finally` is not dropped until IndexedDB agrees with the server:
            // release it earlier and a second decode of the same QR can beat
            // the mirror write, which is the hole this whole dance closes.
            // MIRROR_SETTLE_CAP_MS bounds it, so a dead write cannot hold the
            // scanner hostage.
            await mirrored;
            return;
          }
          // Threw, or blew the deadline. Fall through to the cache.
        }

        // B. Offline verification using the IndexedDB cache
        const cachedTicket = await findCachedTicket(clean);

        if (!cachedTicket) {
          setScanFailure(null);
          setActiveResult({ kind: 'not_found', scannedCode: clean });
          return;
        }

        if (cachedTicket.status === 'void') {
          setScanFailure(null);
          setActiveResult({ kind: 'voided', ticket: cachedTicket });
          return;
        }

        if (cachedTicket.status === 'checked_in') {
          setScanFailure(null);
          setActiveResult({
            kind: 'already_used',
            ticket: cachedTicket,
            firstScannedAt: cachedTicket.checkedInAt || nowIso,
            firstScannedBy: cachedTicket.checkedInBy || 'Gate Staff (Local Cache)',
          });
          return;
        }

        // VALID OFFLINE ADMISSION.
        //
        // Queue row FIRST, cache second. The queue is the only record the
        // server will ever hear about; marking the cache first and enqueuing
        // after meant an IndexedDB failure produced a green ADMITTED for a
        // guest nobody would ever be able to account for.
        let newQueueDepth: number;
        try {
          newQueueDepth = await enqueueOfflineCheckIn(
            cachedTicket.code,
            nowIso,
            staff?.id ?? '',
            deviceId
          );
        } catch (err) {
          console.error('Offline check-in could not be queued:', err);
          setActiveResult(null);
          setScanFailure({
            code: cachedTicket.code,
            detail: 'This phone could not save the check-in. Nothing was recorded.',
          });
          return;
        }

        await updateCachedTicketStatus(cachedTicket.id, nowIso, staffLabel);

        setQueuedCount(newQueueDepth);
        const shownCount = bumpAdmitted();

        setScanFailure(null);
        setActiveResult({
          kind: 'admitted',
          ticket: {
            ...cachedTicket,
            status: 'checked_in',
            checkedInAt: nowIso,
            checkedInBy: staffLabel,
          },
          admittedCount: shownCount,
        });
      } finally {
        inFlightCodesRef.current.delete(clean);
      }
    },
    [bumpAdmitted]
  );

  // 4. ZXing Camera stream handling
  useEffect(() => {
    if (scannerMode !== 'camera' || activeResult !== null || scanFailure !== null || forcedResult) {
      return;
    }

    let isScanning = true;
    let isDisposed = false;

    const stopControls = () => {
      try {
        scannerControlsRef.current?.stop();
      } catch {
        /* already torn down */
      }
      scannerControlsRef.current = null;
    };

    async function startCamera() {
      try {
        setCameraError(null);
        if (!videoRef.current) return;

        // Loaded on demand: the decoder is the single largest thing on this
        // route, and the top bar, the manifest count and the manual-entry
        // fallback are all usable without it. A door officer who needs to
        // key a code in by hand should not wait on a camera library.
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (isDisposed) return;
        const reader = new BrowserMultiFormatReader();

        // The decoder now lives in its own chunk, which the offline shell
        // could not have seen on its first sweep. Re-check so "Offline ready"
        // never claims a phone is safe while the scanner's own code is
        // missing from the cache.
        recheckOfflineShell();

        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result) => {
            if (!isScanning || !result) return;
            const scannedText = result.getText();
            if (!scannedText) return;
            isScanning = false;
            stopControls();
            void handleScanSubmit(scannedText);
          }
        );

        // The camera can finish opening AFTER this effect was torn down, or
        // after a code already decoded. Either way the stream it just started
        // is nobody's now — stop it, or the camera stays lit all night.
        if (isDisposed || !isScanning) {
          try {
            controls.stop();
          } catch {
            /* nothing to stop */
          }
          return;
        }
        scannerControlsRef.current = controls;
      } catch (err) {
        if (isDisposed) return;
        console.warn('Camera stream error:', err);
        setCameraError('Camera access unavailable. Use manual code entry below.');
      }
    }

    void startCamera();

    return () => {
      isScanning = false;
      isDisposed = true;
      stopControls();
      // Belt and braces: controls.stop() is the supported path, but a track
      // attached to the element before controls resolved would survive it.
      try {
        const stream = videoRef.current?.srcObject as MediaStream | null;
        stream?.getTracks().forEach((track) => track.stop());
      } catch {
        /* no stream attached */
      }
    };
  }, [scannerMode, activeResult, scanFailure, forcedResult, handleScanSubmit, recheckOfflineShell]);

  const handleNextScan = () => {
    setActiveResult(null);
    setScanFailure(null);
    setManualCode('');
    if (onClearForcedResult) {
      onClearForcedResult();
    }
  };

  const handleManualFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      void handleScanSubmit(manualCode.trim());
    }
  };

  // Result currently shown (forced by Dev Switcher OR real scan)
  const currentResult: CheckInResult | null = forcedResult || activeResult;

  // Multi-sensory feedback (haptic + audio). No visual flash: /scan animates
  // nothing, and a full-screen strobe on every scan is a photosensitivity risk.
  useEffect(() => {
    if (currentResult) fireScanFeedback(currentResult.kind);
  }, [currentResult]);

  useEffect(() => {
    // A check-in that could not be recorded gets the heaviest pattern there is.
    if (scanFailure) fireScanFeedback('already_used');
  }, [scanFailure]);

  return (
    <div className="min-h-screen bg-scan-surface text-white flex flex-col font-sans select-none overflow-hidden">
      {/* ========================================================
          1. PERSISTENT TOP BAR (Always Visible)
      ======================================================== */}
      <header
        id="scanner-top-bar"
        className="bg-scan-card border-b border-slate-800 px-3 py-2.5 flex items-center justify-between text-xs z-30"
      >
        <div className="flex items-center gap-3">
          {/* Online / Offline Dot */}
          <div className="flex items-center gap-1.5 font-bold">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isOnline ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
            <span className={isOnline ? 'text-emerald-400' : 'text-amber-400'}>
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>

          {/* Cached Manifest Badge */}
          <span className="hidden sm:inline text-slate-400 font-mono">
            {cachedCount} passes cached
          </span>

          {/* Offline shell readiness — the answer to "can I take this phone
              off the network yet?". The green Online dot above says nothing
              about surviving a reload, and that is the failure that costs a
              door phone for the whole night. Icon and wording both change,
              never colour alone. */}
          <span
            role="status"
            title={
              offlineShell.status === 'ready'
                ? 'A reload with no network will still open the scanner.'
                : offlineShell.status === 'unsupported'
                  ? 'This browser has no service worker. Do not reload or close this tab.'
                  : `Storing the scanner for offline use (${offlineShell.cached}/${offlineShell.total}). Stay online until this reads Offline ready.`
            }
            className={`flex items-center gap-1.5 font-bold ${
              offlineShell.status === 'ready' ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {offlineShell.status === 'ready' ? (
              <ShieldCheck className="w-3.5 h-3.5" />
            ) : (
              <ShieldAlert className="w-3.5 h-3.5" />
            )}
            <span>
              {offlineShell.status === 'ready'
                ? 'Offline ready'
                : offlineShell.status === 'unsupported'
                  ? 'No offline shell'
                  : offlineShell.status === 'incomplete'
                    ? 'Not offline-safe'
                    : 'Preparing…'}
            </span>
          </span>

          {/* Sensory Accessibility Indicator — claims only the channels this
              device actually has. Promising a buzz that will never arrive is
              worse than promising nothing on a screen read at arm's length. */}
          {(feedbackCaps.haptics || feedbackCaps.audio) && (
            <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
              {feedbackCaps.haptics && <Vibrate className="w-3 h-3 text-emerald-400" />}
              {feedbackCaps.audio && <Volume2 className="w-3 h-3 text-emerald-400" />}
              <span>
                {feedbackCaps.haptics && feedbackCaps.audio
                  ? 'Haptics & audio active'
                  : feedbackCaps.haptics
                    ? 'Haptics active'
                    : 'Audio active'}
              </span>
            </div>
          )}
        </div>

        {/* Admitted Count vs Capacity */}
        <div className="flex items-center gap-2">
          <div className="bg-scan-border px-2.5 py-1 rounded text-center">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block leading-none">
              Admitted
            </span>
            <span className="font-mono font-black text-sm text-emerald-400 leading-tight">
              {admittedCount} <span className="text-slate-400 text-xs">/ {totalCapacity}</span>
            </span>
          </div>

          {/* Queued Check-ins Counter — PUSHES this phone's offline scans up.
              Fires automatically on reconnect; this is the manual retry. */}
          {queuedCount > 0 && (
            <button
              type="button"
              onClick={() => void runSync()}
              disabled={isSyncing || !isOnline}
              title="Upload queued check-ins to the server"
              className="bg-amber-950/80 border border-amber-600/60 text-amber-300 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 hover:bg-amber-900 disabled:opacity-60"
            >
              <RefreshCw className="w-3 h-3" />
              <span>{isSyncing ? 'Syncing…' : `${queuedCount} Queued`}</span>
            </button>
          )}

          {/* Manifest re-download — PULLS late buyers down. Without it anyone
              who bought after this phone loaded scans as NOT A VALID TICKET. */}
          <button
            type="button"
            id="scanner-refresh-manifest-btn"
            onClick={() => void refreshManifest()}
            disabled={isRefreshingManifest || !isOnline}
            title="Re-download the ticket manifest (picks up late buyers)"
            className="bg-slate-800 border border-slate-600 text-slate-200 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 hover:bg-slate-700 disabled:opacity-60"
          >
            <DownloadCloud className="w-3 h-3" />
            <span className="hidden sm:inline">
              {isRefreshingManifest ? 'Updating…' : 'Manifest'}
            </span>
          </button>

          {/* A failed sync must never be silent — queued scans are the only
              record that those guests were admitted. */}
          {syncError && (
            <span
              role="alert"
              className="bg-rose-950/80 border border-rose-500 text-rose-200 px-2 py-1 rounded text-xs font-bold flex items-center gap-1"
            >
              <ShieldAlert className="w-3 h-3 flex-shrink-0" />
              <span>Sync failed</span>
            </span>
          )}

          {/* Exit to Admin / Staff Login */}
          <Link
            href="/admin"
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
            title="Exit to Admin"
          >
            <LogOut className="w-4 h-4" />
          </Link>
        </div>
      </header>

      {/* Manifest Downloaded Confirmation Toast */}
      {manifestNotice && (
        <div className="bg-emerald-900/90 border-b border-emerald-500 text-white px-3 py-1.5 text-xs text-center font-bold flex items-center justify-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-300" />
          <span>{manifestNotice}</span>
        </div>
      )}

      {/* A missing or stale manifest is the difference between a working door
          and a locked one. It stays on screen until it is fixed. */}
      {manifestError && (
        <div
          role="alert"
          className="bg-amber-950 border-b-2 border-amber-500 text-amber-100 px-3 py-1.5 text-xs text-center font-bold flex items-center justify-center gap-2"
        >
          <ShieldAlert className="w-4 h-4 flex-shrink-0 text-amber-300" />
          <span>{manifestError}</span>
        </div>
      )}

      {/* ========================================================
          2. SCANNER WORKSPACE (Camera or Manual Mode)
      ======================================================== */}
      {!currentResult && !scanFailure && (
        <main className="flex-1 flex flex-col justify-between p-4 max-w-lg mx-auto w-full">
          {scannerMode === 'camera' ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4">
              {/* Camera Viewfinder & Reticle Frame */}
              <div className="relative w-full aspect-square max-h-[380px] bg-black rounded-2xl overflow-hidden border-2 border-slate-700 flex items-center justify-center">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  playsInline
                  muted
                />

                {/* Scan Reticle Guides */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-64 h-64 border-2 border-emerald-400/70 rounded-2xl relative">
                    {/* Corner Reticle brackets */}
                    <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-400" />
                    <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-400" />
                    <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-400" />
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-400" />
                  </div>
                </div>

                {cameraError && (
                  <div className="absolute inset-0 bg-slate-900/95 p-6 flex flex-col items-center justify-center text-center space-y-3">
                    <Camera className="w-10 h-10 text-slate-400" />
                    <p className="text-sm font-semibold text-slate-300">{cameraError}</p>
                    <button
                      type="button"
                      onClick={() => setScannerMode('manual')}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs"
                    >
                      Switch to Manual Entry
                    </button>
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-400 text-center font-medium">
                Point camera at the attendee&apos;s QR code on a phone screen or printout
              </p>
            </div>
          ) : (
            /* MANUAL CODE ENTRY FALLBACK */
            <div className="flex-1 flex flex-col justify-center space-y-4 max-w-sm mx-auto w-full">
              <div className="text-center space-y-1">
                <h2 className="text-lg font-black text-white">Manual Pass Lookup</h2>
                <p className="text-xs text-slate-400">
                  Type the ticket security code
                </p>
              </div>

              <form onSubmit={handleManualFormSubmit} className="space-y-3">
                <input
                  type="text"
                  id="scanner-manual-input"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                  placeholder="e.g. FIQ-7K2Q-9XM4"
                  className="w-full min-h-[56px] px-4 rounded-xl bg-scan-raised border-2 border-slate-700 text-white font-mono text-center text-lg font-black tracking-wider focus:border-emerald-500 focus:outline-none uppercase"
                  autoFocus
                />

                <button
                  type="submit"
                  id="scanner-manual-submit-btn"
                  className="w-full min-h-[52px] bg-emerald-600 hover:bg-emerald-700 text-white font-black text-base rounded-xl flex items-center justify-center gap-2"
                >
                  <UserCheck className="w-5 h-5" />
                  <span>Verify Ticket</span>
                </button>
              </form>
            </div>
          )}

          {/* Mode Switcher Button (Bottom) */}
          <div className="pt-4">
            <button
              type="button"
              id="scanner-toggle-mode-btn"
              onClick={() =>
                setScannerMode((m) => (m === 'camera' ? 'manual' : 'camera'))
              }
              className="w-full min-h-[48px] bg-scan-raised hover:bg-scan-border-strong border border-slate-700 text-slate-200 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
            >
              {scannerMode === 'camera' ? (
                <>
                  <Keyboard className="w-4 h-4 text-emerald-400" />
                  <span>Enter Code Manually (Fallback)</span>
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4 text-emerald-400" />
                  <span>Switch to Camera Scanner</span>
                </>
              )}
            </button>
          </div>
        </main>
      )}

      {/* ========================================================
          3. FULL-SCREEN RESULT OVERLAYS
      ======================================================== */}
      {currentResult && (
        <div
          id="scanner-result-overlay"
          role="alert"
          aria-live="assertive"
          onClick={handleNextScan}
          className={`fixed inset-0 z-50 flex flex-col justify-between p-5 sm:p-8 cursor-pointer select-none text-white ${
            currentResult.kind === 'admitted'
              ? 'bg-scan-admit ring-8 ring-emerald-300/50'
              : currentResult.kind === 'already_used'
              ? 'bg-scan-already ring-8 ring-amber-400/60'
              : currentResult.kind === 'not_found'
              ? 'bg-scan-notfound ring-8 ring-rose-300/40'
              : currentResult.kind === 'voided'
              ? 'bg-scan-void ring-[12px] ring-white/80'
              : 'bg-scan-unpaid ring-8 ring-amber-300/50'
          }`}
        >
          {/* A revoked pass gets a solid white rule across the top. ALREADY
              SCANNED gets diagonal hazard tape. Two shapes, no colour needed. */}
          {currentResult.kind === 'voided' && (
            <div className="w-full h-3 bg-white rounded-sm mb-2" />
          )}

          {currentResult.kind === 'already_used' && (
            <div
              className="w-full h-4 rounded-full overflow-hidden border border-yellow-400 mb-2"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(45deg, var(--scan-hazard-ink), var(--scan-hazard-ink) 12px, var(--scan-hazard) 12px, var(--scan-hazard) 24px)',
              }}
              title="Duplicate Hazard Indicator"
            />
          )}

          {/* Top Status Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {currentResult.kind === 'admitted' && (
                <div className="w-14 h-14 rounded-full bg-white text-scan-admit border-4 border-emerald-200 flex items-center justify-center font-black shadow-lg">
                  <CheckCircle2 className="w-9 h-9" />
                </div>
              )}
              {currentResult.kind === 'already_used' && (
                <div className="w-14 h-14 rounded-xl bg-yellow-300 text-black border-4 border-white flex items-center justify-center font-black shadow-lg">
                  <AlertOctagon className="w-9 h-9 text-red-900" />
                </div>
              )}
              {/* NOT FOUND: white CIRCLE, X glyph. */}
              {currentResult.kind === 'not_found' && (
                <div className="w-14 h-14 rounded-full bg-white text-scan-notfound border-4 border-rose-300 flex items-center justify-center font-black shadow-lg">
                  <XCircle className="w-9 h-9" />
                </div>
              )}
              {/* VOIDED: black SQUARE, prohibition glyph. Deliberately the
                  inverse of not_found in shape, fill and symbol — the two used
                  to be the same white circle with the same X, which at arm's
                  length in bad light was one state, not two. */}
              {currentResult.kind === 'voided' && (
                <div className="w-14 h-14 rounded-lg bg-black text-white border-4 border-white flex items-center justify-center font-black shadow-lg">
                  <Ban className="w-9 h-9" strokeWidth={3} />
                </div>
              )}
              {currentResult.kind === 'unpaid' && (
                <div className="w-14 h-14 rounded-full bg-white text-scan-unpaid border-4 border-amber-300 flex items-center justify-center font-black shadow-lg">
                  <AlertTriangle className="w-9 h-9" />
                </div>
              )}

              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-widest font-black opacity-90 px-2 py-0.5 rounded bg-black/30 border border-white/30">
                    {currentResult.kind === 'admitted' && '● PASS CLEARED'}
                    {currentResult.kind === 'already_used' && '🛑 ENTRY BLOCKED'}
                    {currentResult.kind === 'not_found' && '✕ UNRECOGNIZED'}
                    {currentResult.kind === 'voided' && '⊘ REVOKED'}
                    {currentResult.kind === 'unpaid' && '⚠️ PAYMENT DUE'}
                  </span>
                </div>
                <h1 className="text-3xl sm:text-5xl font-black uppercase tracking-tight leading-none mt-1">
                  {currentResult.kind === 'admitted' && 'ADMITTED'}
                  {currentResult.kind === 'already_used' && 'ALREADY SCANNED'}
                  {currentResult.kind === 'not_found' && 'NOT A VALID TICKET'}
                  {currentResult.kind === 'voided' && 'TICKET CANCELLED'}
                  {currentResult.kind === 'unpaid' && 'PAYMENT NOT CONFIRMED'}
                </h1>
              </div>
            </div>
          </div>

          {/* RESULT BODY */}
          <div className="my-auto py-4 space-y-4">
            {/* 1. ADMITTED */}
            {currentResult.kind === 'admitted' && (
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 bg-emerald-950/60 border border-emerald-300/60 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest text-emerald-200">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Attendee Verified — Admit 1 Person</span>
                </div>
                <h2 className="text-3xl sm:text-6xl font-black uppercase tracking-tight text-white leading-tight drop-shadow-md">
                  {currentResult.ticket.holderName}
                </h2>
                <div className="text-2xl sm:text-3xl font-mono font-black text-emerald-100">
                  {currentResult.ticket.holderPhone
                    ? formatPhoneForDisplay(currentResult.ticket.holderPhone)
                    : 'NO PHONE ON FILE'}
                </div>
                <div className="pt-2 font-mono text-xs opacity-80">
                  Security Code: {currentResult.ticket.code}
                </div>
              </div>
            )}

            {/* 2. ALREADY USED */}
            {currentResult.kind === 'already_used' && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 bg-red-950 border border-red-300 px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-widest text-red-200">
                    <ShieldAlert className="w-4 h-4 text-yellow-300" />
                    <span>Duplicate Check-In Attempt</span>
                  </div>
                  <h2 className="text-2xl sm:text-4xl font-black uppercase text-white drop-shadow">
                    {currentResult.ticket.holderName}
                  </h2>
                  <p className="text-lg font-mono font-bold text-red-100">
                    {currentResult.ticket.holderPhone
                      ? formatPhoneForDisplay(currentResult.ticket.holderPhone)
                      : 'NO PHONE ON FILE'}
                  </p>
                </div>

                <div className="bg-black/75 border-2 border-yellow-400 rounded-2xl p-4 sm:p-5 space-y-2 text-left shadow-2xl">
                  <div className="flex items-center gap-2 font-mono font-black text-base text-yellow-300">
                    <Clock className="w-5 h-5 flex-shrink-0 text-yellow-300" />
                    <span>
                      Original Check-In:{' '}
                      {new Date(currentResult.firstScannedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-white">
                    Admitted By: <span className="underline decoration-yellow-400 decoration-2">{currentResult.firstScannedBy}</span>
                  </p>
                  <p className="text-xs text-yellow-200 font-semibold leading-snug">
                    Duplicate attempt rejected. This QR code has already passed gate check-in and cannot be reused.
                  </p>
                </div>

                <div className="font-mono text-xs opacity-75">
                  Code: {currentResult.ticket.code}
                </div>
              </div>
            )}

            {/* 3. NOT FOUND */}
            {currentResult.kind === 'not_found' && (
              <div className="space-y-4">
                <p className="text-lg sm:text-xl font-bold text-red-100">
                  Scanned payload is not registered in event database.
                </p>
                <div className="bg-black/60 border-2 border-dashed border-white/60 p-4 rounded-xl">
                  <span className="text-xs font-bold uppercase text-red-200 block mb-1">
                    Scanned Payload
                  </span>
                  <p className="font-mono text-lg sm:text-xl font-black break-all select-all text-yellow-300">
                    {currentResult.scannedCode}
                  </p>
                </div>
              </div>
            )}

            {/* 4. VOIDED — a real, named person whose pass was revoked. Solid
                black slab, named holder, blunt instruction. NOT FOUND above is
                a dashed evidence box around an unknown payload. */}
            {currentResult.kind === 'voided' && (
              <div className="space-y-3">
                <span className="inline-flex items-center gap-1.5 bg-white text-black px-2.5 py-1 rounded-sm text-xs font-black uppercase tracking-widest">
                  <Ban className="w-4 h-4" strokeWidth={3} />
                  <span>Revoked by organiser</span>
                </span>
                <h2 className="text-2xl sm:text-4xl font-black uppercase">
                  {currentResult.ticket.holderName || 'Unknown Attendee'}
                </h2>
                <div className="bg-black border-l-8 border-white p-4 rounded-r-xl space-y-1">
                  <p className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white">
                    Do not admit
                  </p>
                  <p className="text-xs text-slate-200 font-semibold leading-snug">
                    This pass was cancelled by an organiser. It is not a scanning
                    error — send the holder to the organiser, not back into the queue.
                  </p>
                </div>
                <div className="font-mono text-xs opacity-75">
                  Code: {currentResult.ticket.code}
                </div>
              </div>
            )}

            {/* 5. UNPAID */}
            {currentResult.kind === 'unpaid' && (
              <div className="space-y-3">
                <span className="text-xs font-bold uppercase text-amber-200">
                  Incomplete Checkout
                </span>
                <h2 className="text-2xl sm:text-4xl font-black uppercase">
                  {currentResult.ticket.holderName || 'Unpaid Order'}
                </h2>
                <p className="text-sm text-amber-100">
                  Payment for this order was not confirmed by Paystack.
                </p>
                <div className="font-mono text-xs opacity-75">
                  Code: {currentResult.ticket.code}
                </div>
              </div>
            )}
          </div>

          {currentResult.kind === 'already_used' && (
            <div
              className="w-full h-4 rounded-full overflow-hidden border border-yellow-400 mb-3"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(45deg, var(--scan-hazard-ink), var(--scan-hazard-ink) 12px, var(--scan-hazard) 12px, var(--scan-hazard) 24px)',
              }}
            />
          )}

          {/* Bottom Clear Button */}
          <div className="w-full max-w-sm mx-auto">
            <button
              type="button"
              id="scanner-next-scan-btn"
              onClick={handleNextScan}
              className="w-full min-h-[58px] bg-white text-black hover:bg-slate-100 font-black text-lg rounded-2xl shadow-2xl flex items-center justify-center gap-2"
            >
              <span>NEXT SCAN →</span>
            </button>
            <p className="text-[11px] text-center opacity-75 mt-2 font-medium">
              (Tap anywhere on screen to clear)
            </p>
          </div>
        </div>
      )}

      {/* ========================================================
          4. DEVICE FAULT — the check-in was NOT recorded

          Deliberately not one of the five CheckInResult kinds: those are all
          verdicts about a ticket. This is the phone failing, and it must never
          be mistaken for a verdict. Slate, not red or green, and its own glyph.
      ======================================================== */}
      {!currentResult && scanFailure && (
        <div
          id="scanner-fault-overlay"
          role="alert"
          aria-live="assertive"
          onClick={handleNextScan}
          className="fixed inset-0 z-50 flex flex-col justify-between p-5 sm:p-8 cursor-pointer select-none text-white bg-scan-fault ring-8 ring-white/60"
        >
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-lg bg-white text-scan-fault border-4 border-slate-300 flex items-center justify-center font-black shadow-lg">
              <ServerCrash className="w-9 h-9" />
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-widest font-black opacity-90 px-2 py-0.5 rounded bg-black/40 border border-white/30">
                ⚙ DEVICE FAULT
              </span>
              <h1 className="text-3xl sm:text-5xl font-black uppercase tracking-tight leading-none mt-1">
                NOT RECORDED
              </h1>
            </div>
          </div>

          <div className="my-auto py-4 space-y-4">
            <p className="text-xl sm:text-2xl font-black uppercase tracking-tight">
              Do not admit on this scan
            </p>
            <p className="text-base sm:text-lg font-bold text-slate-100">{scanFailure.detail}</p>
            <div className="bg-black/60 border-2 border-white/70 p-4 rounded-xl space-y-1">
              <span className="text-xs font-bold uppercase text-slate-200 block">
                Ticket code
              </span>
              <p className="font-mono text-lg sm:text-xl font-black break-all select-all">
                {scanFailure.code}
              </p>
            </div>
            <p className="text-sm font-semibold text-slate-200 leading-snug">
              Scan again. If it fails twice, write the code down by hand and use
              the other door phone.
            </p>
          </div>

          <div className="w-full max-w-sm mx-auto">
            <button
              type="button"
              id="scanner-fault-clear-btn"
              onClick={handleNextScan}
              className="w-full min-h-[58px] bg-white text-black hover:bg-slate-100 font-black text-lg rounded-2xl shadow-2xl flex items-center justify-center gap-2"
            >
              <span>TRY AGAIN →</span>
            </button>
            <p className="text-[11px] text-center opacity-75 mt-2 font-medium">
              (Tap anywhere on screen to clear)
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
