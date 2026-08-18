'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, Delete, ArrowRight, ArrowLeft, ShieldCheck, QrCode } from 'lucide-react';
import { eventConfig } from '@/config/event.config';

export const ScanLoginPage: React.FC = () => {
  const router = useRouter();
  const [pin, setPin] = useState<string>('');

  // TODO(handoff): there is NO authentication here. Any PIN — any four
  // digits — navigates straight to /scan, and /scan itself is unguarded.
  // Session 2: verify the PIN against Supabase Auth, establish a staff
  // session lasting 24h (staff must not be logged out mid-event), and put
  // middleware in front of /scan and /admin.

  const handleDigit = (digit: string) => {
    if (pin.length < 6) {
      const newPin = pin + digit;
      setPin(newPin);
      if (newPin.length === 4) {
        // TODO(handoff): auto-advance on length, with no verification.
        setTimeout(() => router.push('/scan'), 300);
      }
    }
  };

  const handleDelete = () => {
    setPin((p) => p.slice(0, -1));
  };

  const handleClear = () => {
    setPin('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO(handoff): verify the PIN server-side before granting entry.
    router.push('/scan');
  };

  return (
    <div className="min-h-screen bg-tool-surface text-tool-ink font-sans flex flex-col justify-between p-4 sm:p-6">
      {/* Top Header */}
      <header className="flex items-center justify-between">
        <Link
          href="/"
          className="p-2 rounded border border-gray-300 text-gray-600 hover:text-gray-900 bg-white text-xs font-semibold flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Public Site</span>
        </Link>
        <span className="text-xs font-mono font-bold text-gray-500 uppercase tracking-wider">
          Gate Staff Terminal
        </span>
      </header>

      {/* Main PIN Pad container */}
      <main className="max-w-xs mx-auto w-full my-auto space-y-6">
        <div className="text-center space-y-1">
          <div className="w-12 h-12 rounded-xl bg-gray-900 text-white mx-auto flex items-center justify-center mb-2 shadow">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Staff Gate Access</h1>
          <p className="text-xs text-gray-500">
            Enter 4-digit terminal PIN to unlock door scanner
          </p>
        </div>

        {/* PIN Display Dots */}
        <div className="flex justify-center items-center gap-3 py-2">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className={`w-4 h-4 rounded-full border-2 transition-all ${
                pin.length > index
                  ? 'bg-gray-900 border-gray-900 scale-110'
                  : 'bg-white border-gray-300'
              }`}
            />
          ))}
        </div>

        {/* Large Number Pad (One-handed / Cold fingers optimized) */}
        <div className="grid grid-cols-3 gap-2.5">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              id={`pin-btn-${digit}`}
              onClick={() => handleDigit(digit)}
              className="min-h-[64px] rounded-xl bg-white hover:bg-gray-100 active:bg-gray-200 border border-gray-300 text-2xl font-bold text-gray-900 shadow-sm flex items-center justify-center transition-colors select-none"
            >
              {digit}
            </button>
          ))}

          <button
            type="button"
            onClick={handleClear}
            className="min-h-[64px] rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 border border-gray-300 text-xs font-bold text-gray-600 uppercase flex items-center justify-center select-none"
          >
            Clear
          </button>

          <button
            type="button"
            id="pin-btn-0"
            onClick={() => handleDigit('0')}
            className="min-h-[64px] rounded-xl bg-white hover:bg-gray-100 active:bg-gray-200 border border-gray-300 text-2xl font-bold text-gray-900 shadow-sm flex items-center justify-center transition-colors select-none"
          >
            0
          </button>

          <button
            type="button"
            id="pin-btn-delete"
            onClick={handleDelete}
            className="min-h-[64px] rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 border border-gray-300 text-gray-700 flex items-center justify-center select-none"
          >
            <Delete className="w-6 h-6" />
          </button>
        </div>

        {/* Direct Unlock Shortcut */}
        <button
          type="button"
          id="pin-direct-unlock-btn"
          onClick={() => router.push('/scan')}
          className="w-full min-h-[48px] rounded-xl bg-gray-900 hover:bg-black text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow"
        >
          <QrCode className="w-4 h-4" />
          <span>Launch Scanner Directly</span>
        </button>
      </main>

      {/* Footer */}
      <footer className="text-center text-[11px] text-gray-400">
        {eventConfig.event.name} • Gate Protocol • Offline Authorized
      </footer>
    </div>
  );
};
