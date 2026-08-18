'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, Delete, ArrowLeft, ShieldAlert } from 'lucide-react';
import { eventConfig } from '@/config/event.config';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

const PIN_LENGTH = 6;

/**
 * Real authentication. The PIN is the password of the shared door-terminal
 * Supabase account (eventConfig.staff.scannerEmail) — six digits, because
 * that is Supabase's password floor. Which PHONE scanned a ticket is
 * attributed by device id on every check-in, so one terminal identity is
 * enough for the door.
 *
 * No animation on /scan surfaces, and every state readable without colour.
 */
export const ScanLoginPage: React.FC = () => {
  const router = useRouter();
  const [pin, setPin] = useState<string>('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attemptUnlock = async (candidate: string) => {
    setChecking(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: eventConfig.staff.scannerEmail,
        password: candidate,
      });
      if (signInError) {
        setError('Wrong PIN. Check with the door lead.');
        setPin('');
        return;
      }
      // Confirm this account is actually staff before opening the scanner —
      // a session alone is not authorisation.
      const { data } = await supabase.rpc('get_current_staff');
      const staff = Array.isArray(data) ? data[0] : data;
      if (!staff) {
        await supabase.auth.signOut();
        setError('This account has no gate access.');
        setPin('');
        return;
      }
      router.push('/scan');
    } catch {
      setError('No connection. Gate login needs network once; retry near a window.');
      setPin('');
    } finally {
      setChecking(false);
    }
  };

  const handleDigit = (digit: string) => {
    if (checking || pin.length >= PIN_LENGTH) return;
    const newPin = pin + digit;
    setPin(newPin);
    if (newPin.length === PIN_LENGTH) {
      void attemptUnlock(newPin);
    }
  };

  const handleDelete = () => {
    if (!checking) setPin((p) => p.slice(0, -1));
  };

  const handleClear = () => {
    if (!checking) setPin('');
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
          <div
            className={`w-12 h-12 rounded-xl bg-gray-900 text-white mx-auto flex items-center justify-center mb-2 shadow ${checking ? 'opacity-50' : ''}`}
          >
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Staff Gate Access</h1>
          <p className="text-xs text-gray-500">
            {checking
              ? 'Checking PIN…'
              : `Enter the ${PIN_LENGTH}-digit terminal PIN to unlock the door scanner`}
          </p>
        </div>

        {/* PIN Display Dots */}
        <div className="flex justify-center items-center gap-3 py-2">
          {Array.from({ length: PIN_LENGTH }, (_, index) => (
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

        {/* Error — icon + text, readable without colour */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800"
          >
            <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Large Number Pad (One-handed / Cold fingers optimized) */}
        <div className="grid grid-cols-3 gap-2.5">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              id={`pin-btn-${digit}`}
              onClick={() => handleDigit(digit)}
              disabled={checking}
              className="min-h-[64px] rounded-xl bg-white hover:bg-gray-100 active:bg-gray-200 disabled:opacity-50 border border-gray-300 text-2xl font-bold text-gray-900 shadow-sm flex items-center justify-center transition-colors select-none"
            >
              {digit}
            </button>
          ))}

          <button
            type="button"
            onClick={handleClear}
            disabled={checking}
            className="min-h-[64px] rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 disabled:opacity-50 border border-gray-300 text-xs font-bold text-gray-600 uppercase flex items-center justify-center select-none"
          >
            Clear
          </button>

          <button
            type="button"
            id="pin-btn-0"
            onClick={() => handleDigit('0')}
            disabled={checking}
            className="min-h-[64px] rounded-xl bg-white hover:bg-gray-100 active:bg-gray-200 disabled:opacity-50 border border-gray-300 text-2xl font-bold text-gray-900 shadow-sm flex items-center justify-center transition-colors select-none"
          >
            0
          </button>

          <button
            type="button"
            id="pin-btn-delete"
            onClick={handleDelete}
            disabled={checking}
            className="min-h-[64px] rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 disabled:opacity-50 border border-gray-300 text-gray-700 flex items-center justify-center select-none"
          >
            <Delete className="w-6 h-6" />
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-[11px] text-gray-400">
        {eventConfig.event.name} • Gate Protocol • Offline Authorized
      </footer>
    </div>
  );
};
