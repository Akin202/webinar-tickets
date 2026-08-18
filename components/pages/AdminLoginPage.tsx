'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, KeyRound, ShieldAlert } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Admin sign-in. This is a tool, deliberately not on the party's design
 * language: email + password against Supabase Auth, then a staff_users role
 * check — a session alone is not authorisation, and a door account bouncing
 * off this page is working as intended.
 */
export const AdminLoginPage: React.FC = () => {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError('Wrong email or password.');
        return;
      }
      const { data } = await supabase.rpc('get_current_staff');
      const staff = Array.isArray(data) ? data[0] : data;
      if (!staff || staff.role !== 'admin') {
        await supabase.auth.signOut();
        setError('This account does not have admin access.');
        return;
      }
      router.push('/admin');
    } catch {
      setError('Could not reach the server. Check your connection and retry.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-tool-surface text-tool-ink font-sans flex flex-col justify-between p-4 sm:p-6">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          className="p-2 rounded border border-gray-300 text-gray-600 hover:text-gray-900 bg-white text-xs font-semibold flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Public Site</span>
        </Link>
        <span className="text-xs font-mono font-bold text-gray-500 uppercase tracking-wider">
          Admin Console
        </span>
      </header>

      <main className="max-w-sm mx-auto w-full my-auto space-y-6">
        <div className="text-center space-y-1">
          <div className="w-12 h-12 rounded-xl bg-gray-900 text-white mx-auto flex items-center justify-center mb-2 shadow">
            <KeyRound className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Admin Sign-In</h1>
          <p className="text-xs text-gray-500">Sales dashboard, buyer list and exports</p>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800"
          >
            <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Email</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full min-h-[48px] rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full min-h-[48px] rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[48px] rounded-xl bg-gray-900 hover:bg-black disabled:opacity-50 text-white text-sm font-bold uppercase tracking-wider shadow"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </main>

      <footer className="text-center text-[11px] text-gray-400">
        Staff access only. Every export and sales-gate change is audited.
      </footer>
    </div>
  );
};
