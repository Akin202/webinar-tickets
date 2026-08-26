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
  return <main className="min-h-screen bg-zinc-950 text-zinc-100 grid place-items-center p-6">
    <section className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-7 text-center">
      <h1 className="text-2xl font-bold">Email preferences</h1>
      {state === 'done' ? <p className="mt-4 text-zinc-300">You have been unsubscribed from marketing emails.</p> : <>
        <p className="mt-3 text-sm text-zinc-400">You will still receive essential messages about tickets you purchase.</p>
        <button type="button" onClick={unsubscribe} disabled={!token || state === 'busy'}
          className="mt-6 min-h-11 rounded-lg bg-white px-5 font-semibold text-zinc-950 disabled:opacity-50">
          {state === 'busy' ? 'Saving…' : 'Unsubscribe'}
        </button>
        {state === 'error' && <p className="mt-3 text-sm text-red-400">This link is invalid or could not be saved.</p>}
      </>}
    </section>
  </main>;
}
