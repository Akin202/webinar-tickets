import Link from 'next/link';
import { eventConfig } from '@/config/event.config';

/**
 * Replaces the Vite router's <Navigate to="/"> catch-all. A silent redirect
 * hid broken links; this tells the visitor what happened and gives them a
 * route back rather than a dead end.
 */
export default function NotFound() {
  return (
    <main className="min-h-screen bg-brand-surface text-brand-text flex flex-col items-center justify-center px-6 text-center gap-6">
      <p className="font-mono-code text-sm uppercase tracking-widest text-brand-primary">
        404
      </p>
      <h1 className="font-display text-5xl sm:text-7xl uppercase leading-[0.9] text-brand-text">
        Page not found
      </h1>
      <p className="text-base text-brand-muted max-w-md">
        That link doesn&apos;t exist. If you were sent here with a ticket link,
        check it was copied in full.
      </p>
      <Link
        href="/"
        className="min-h-[48px] px-8 py-3 rounded-2xl bg-brand-primary text-brand-surface font-black uppercase tracking-wider inline-flex items-center"
      >
        Back to {eventConfig.event.name}
      </Link>
    </main>
  );
}
