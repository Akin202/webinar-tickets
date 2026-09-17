'use client';
import { useState } from 'react';

export function UnsubscribePage({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  async function unsubscribe() {
    setState('busy');
    const res = await fetch('/api/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }) });
    setState(res.ok ? 'done' : 'error');
  }
  return <main className="public-page min-h-screen bg-brand-surface text-brand-text grid place-items-center p-6">
    <section className="w-full max-w-md rounded-2xl border border-brand-border bg-brand-card p-7 text-center">
      <h1 className="text-2xl font-extrabold text-white">Email preferences</h1>
      {state === 'done' ? <p className="mt-4 text-brand-muted">You have been unsubscribed from marketing emails.</p> : <>
        <p className="mt-3 text-sm text-brand-muted">You will still receive essential messages about tickets you purchase.</p>
        <button type="button" onClick={unsubscribe} disabled={!token || state === 'busy'}
          className="mt-6 min-h-12 rounded-[10px] bg-brand-primary hover:bg-brand-primary-hover px-6 font-semibold text-white disabled:opacity-50">
          {state === 'busy' ? 'Saving…' : 'Unsubscribe'}
        </button>
        {state === 'error' && <p className="mt-3 text-sm text-brand-urgent">This link is invalid or could not be saved.</p>}
      </>}
    </section>
  </main>;
}
