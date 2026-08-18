'use client';

import React, { useState, useEffect, useRef } from 'react';

import Link from 'next/link';
import { BrowserMultiFormatReader } from '@zxing/browser';
import {
  Camera,
  Keyboard,
  CheckCircle2,
  AlertOctagon,
  XCircle,
  AlertTriangle,
  Clock,
  UserCheck,
  RefreshCw,
  ShieldCheck,
  LogOut,
  Volume2,
  Vibrate,
  ShieldAlert,
} from 'lucide-react';
import {
  getCheckInManifest,
  checkInTicket,
  getSalesSummary,
  syncQueuedCheckIns,
} from '@/lib/data-access';
import {
  cacheManifestInIDB,
  getCachedTicketsCount,
  findCachedTicket,
  updateCachedTicketStatus,
  enqueueOfflineCheckIn,
  getQueuedCheckIns,
  clearQueuedCheckIns,
} from '@/lib/offline-db';
import { useDevState } from '@/components/dev/DevStateProvider';
import { fireScanFeedback } from '@/lib/scanner-feedback';
import { CheckInResult, formatPhoneForDisplay } from '@/types/ticketing';
import { eventConfig } from '@/config/event.config';



export const ScanPage: React.FC = () => {
  const { forcedScanResult: forcedResult, setForcedScanResult } = useDevState();
  const onClearForcedResult = () => setForcedScanResult(undefined);
  // Scanner UI States
  const [scannerMode, setScannerMode] = useState<'camera' | 'manual'>('camera');
  const [manualCode, setManualCode] = useState<string>('');
  const [activeResult, setActiveResult] = useState<CheckInResult | null>(null);

  // Connectivity & Offline Manifest States
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [cachedCount, setCachedCount] = useState<number>(0);
  const [queuedCount, setQueuedCount] = useState<number>(0);
  const [manifestDownloadedNotice, setManifestDownloadedNotice] = useState<boolean>(false);
  const [admittedCount, setAdmittedCount] = useState<number>(142);
  const [totalCapacity, setTotalCapacity] = useState<number>(eventConfig.ticketing.capacity);

  // Camera & Video Elements
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Syncing state
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // 1. Monitor online/offline state
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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

  // 3. Initial manifest download & capacity loading
  useEffect(() => {
    let isMounted = true;
    async function initOfflineDB() {
      try {
        const [manifest, summary, cachedQueue] = await Promise.all([
          getCheckInManifest(),
          getSalesSummary(),
          getQueuedCheckIns(),
        ]);

        if (isMounted) {
          const cachedTotal = await cacheManifestInIDB(manifest);
          setCachedCount(cachedTotal);
          setQueuedCount(cachedQueue.length);
          setAdmittedCount(summary.ticketsCheckedIn);
          setTotalCapacity(summary.capacity);
          setManifestDownloadedNotice(true);
          setTimeout(() => {
            if (isMounted) setManifestDownloadedNotice(false);
          }, 4500);
        }
      } catch (err) {
        console.warn('Could not cache manifest:', err);
        const existingCount = await getCachedTicketsCount();
        if (isMounted) setCachedCount(existingCount);
      }
    }

    initOfflineDB();
    return () => {
      isMounted = false;
    };
  }, []);

  // 4. ZXing Camera stream handling
  useEffect(() => {
    if (scannerMode !== 'camera' || activeResult !== null || forcedResult) {
      return;
    }

    let isScanning = true;
    const reader = new BrowserMultiFormatReader();
    codeReaderRef.current = reader;

    async function startCamera() {
      try {
        setCameraError(null);
        if (!videoRef.current) return;

        await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result) => {
            if (!isScanning) return;
            if (result) {
              const scannedText = result.getText();
              if (scannedText) {
                isScanning = false;
                handleScanSubmit(scannedText);
              }
            }
          }
        );
      } catch (err: any) {
        console.warn('Camera stream error:', err);
        setCameraError('Camera access unavailable. Use manual code entry below.');
      }
    }

    startCamera();

    return () => {
      isScanning = false;
      try {
        if (videoRef.current && videoRef.current.srcObject) {
          const stream = videoRef.current.srcObject as MediaStream;
          stream.getTracks().forEach((track) => track.stop());
        }
      } catch {}
    };
  }, [scannerMode, activeResult, forcedResult]);

  // Handle Scan Verification (with offline-first fallback)
  const handleScanSubmit = async (codeOrQr: string) => {
    const clean = codeOrQr.trim();
    if (!clean) return;

    const nowIso = new Date().toISOString();

    // A. If online, validate through data-access seam
    if (isOnline) {
      try {
        const res = await checkInTicket({
          code: clean,
          staffId: 'staff_door_1',
          deviceId: 'device_gate_a',
          scannedAt: nowIso,
        });
        setActiveResult(res);
        if (res.kind === 'admitted') {
          setAdmittedCount((c) => c + 1);
        }
        return;
      } catch {
        // Fallback to offline check if network throws
      }
    }

    // B. Offline Verification using IndexedDB cache
    const cachedTicket = await findCachedTicket(clean);

    if (!cachedTicket) {
      setActiveResult({
        kind: 'not_found',
        scannedCode: clean,
      });
      return;
    }

    if (cachedTicket.status === 'void') {
      setActiveResult({
        kind: 'voided',
        ticket: cachedTicket,
      });
      return;
    }

    if (cachedTicket.status === 'checked_in') {
      setActiveResult({
        kind: 'already_used',
        ticket: cachedTicket,
        firstScannedAt: cachedTicket.checkedInAt || nowIso,
        firstScannedBy: cachedTicket.checkedInBy || 'Gate Staff (Local Cache)',
      });
      return;
    }

    // VALID OFFLINE ADMISSION
    await updateCachedTicketStatus(cachedTicket.id, nowIso, 'Gate Officer (Offline)');
    const newQueueDepth = await enqueueOfflineCheckIn(
      cachedTicket.code,
      nowIso,
      'staff_door_1',
      'device_gate_a'
    );

    setQueuedCount(newQueueDepth);
    setAdmittedCount((c) => c + 1);

    setActiveResult({
      kind: 'admitted',
      ticket: { ...cachedTicket, status: 'checked_in', checkedInAt: nowIso },
      admittedCount: admittedCount + 1,
    });
  };

  // Trigger sync of queued check-ins
  const handleSyncQueued = async () => {
    if (queuedCount === 0 || isSyncing) return;
    setIsSyncing(true);
    try {
      const queue = await getQueuedCheckIns();
      await syncQueuedCheckIns(queue);
      await clearQueuedCheckIns();
      setQueuedCount(0);
    } catch (err) {
      console.warn('Sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleNextScan = () => {
    setActiveResult(null);
    setManualCode('');
    if (onClearForcedResult) {
      onClearForcedResult();
    }
  };

  const handleManualFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      handleScanSubmit(manualCode.trim());
    }
  };

  // Result currently shown (forced by Dev Switcher OR real scan)
  const currentResult: CheckInResult | null = forcedResult || activeResult;

  // Multi-sensory feedback trigger (Haptic vibration + Audio tone)
  const [pulseFlash, setPulseFlash] = useState<boolean>(false);

  useEffect(() => {
    if (currentResult) {
      fireScanFeedback(currentResult.kind);
      setPulseFlash(true);
      const timer = setTimeout(() => setPulseFlash(false), 600);
      return () => clearTimeout(timer);
    }
  }, [currentResult]);

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
                isOnline ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
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

          {/* Sensory Accessibility Indicator */}
          <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
            <Vibrate className="w-3 h-3 text-emerald-400" />
            <Volume2 className="w-3 h-3 text-emerald-400" />
            <span>Haptics & Audio Active</span>
          </div>
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

          {/* Queued Check-ins Counter */}
          {queuedCount > 0 && (
            <button
              type="button"
              onClick={handleSyncQueued}
              disabled={isSyncing || !isOnline}
              title="Click to synchronize queued check-ins"
              className="bg-amber-950/80 border border-amber-600/60 text-amber-300 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 hover:bg-amber-900"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{queuedCount} Queued</span>
            </button>
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
      {manifestDownloadedNotice && (
        <div className="bg-emerald-900/90 border-b border-emerald-500 text-white px-3 py-1.5 text-xs text-center font-bold flex items-center justify-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-300" />
          <span>Ticket manifest downloaded ({cachedCount} passes) — Safe to go offline at gate!</span>
        </div>
      )}

      {/* ========================================================
          2. SCANNER WORKSPACE (Camera or Manual Mode)
      ======================================================== */}
      {!currentResult && (
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
                    <Camera className="w-10 h-10 text-slate-500" />
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
                  placeholder="e.g. SGN-7K2M-882194-A"
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
          className={`fixed inset-0 z-50 flex flex-col justify-between p-5 sm:p-8 cursor-pointer select-none text-white transition-all duration-200 ${
            currentResult.kind === 'admitted'
              ? 'bg-scan-admit ring-8 ring-emerald-300/50'
              : currentResult.kind === 'already_used'
              ? 'bg-scan-already ring-8 ring-amber-400/60'
              : currentResult.kind === 'not_found'
              ? 'bg-scan-notfound ring-8 ring-rose-300/40'
              : currentResult.kind === 'voided'
              ? 'bg-scan-void ring-8 ring-rose-400/50'
              : 'bg-scan-unpaid ring-8 ring-amber-300/50'
          }`}
        >
          {pulseFlash && (
            <div className="absolute inset-0 bg-white/25 pointer-events-none animate-ping duration-300" />
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
                <div className="w-14 h-14 rounded-full bg-white text-scan-admit border-4 border-emerald-200 flex items-center justify-center font-black shadow-lg animate-pulse">
                  <CheckCircle2 className="w-9 h-9" />
                </div>
              )}
              {currentResult.kind === 'already_used' && (
                <div className="w-14 h-14 rounded-xl bg-yellow-300 text-black border-4 border-white flex items-center justify-center font-black shadow-lg animate-bounce">
                  <AlertOctagon className="w-9 h-9 text-red-900" />
                </div>
              )}
              {currentResult.kind === 'not_found' && (
                <div className="w-14 h-14 rounded-full bg-white text-scan-already border-4 border-rose-300 flex items-center justify-center font-black shadow-lg">
                  <XCircle className="w-9 h-9" />
                </div>
              )}
              {currentResult.kind === 'voided' && (
                <div className="w-14 h-14 rounded-full bg-white text-scan-void border-4 border-rose-300 flex items-center justify-center font-black shadow-lg">
                  <XCircle className="w-9 h-9" />
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

            {/* 4. VOIDED */}
            {currentResult.kind === 'voided' && (
              <div className="space-y-3">
                <span className="text-xs font-bold uppercase text-rose-200">
                  Cancelled Pass
                </span>
                <h2 className="text-2xl sm:text-4xl font-black uppercase">
                  {currentResult.ticket.holderName || 'Unknown Attendee'}
                </h2>
                <div className="bg-black/50 border border-white/40 p-3 rounded-xl text-xs font-mono">
                  Status: Voided by organizer
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
    </div>
  );
};
