import Link from 'next/link';
import { eventConfig } from '@/config/event.config';
import { typographic } from '@/components/pages/event/event-format';

/**
 * Replaces the Vite router's <Navigate to="/"> catch-all. A silent redirect
 * hid broken links; this tells the visitor what happened and gives them a
 * route back rather than a dead end.
 */
export default function NotFound() {
  return (
    <main className="public-page min-h-screen bg-brand-surface text-brand-text flex flex-col items-start justify-center px-6 sm:px-12 gap-6 max-w-3xl mx-auto">
      <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight leading-[0.95] text-white">
        That page isn’t here.
      </h1>
      <p className="text-base text-brand-muted max-w-md">
        That link doesn’t exist. If you were sent here with a ticket link,
        check it was copied in full.
      </p>
      <Link
        href="/"
        className="min-h-[48px] px-6 py-3 rounded-[10px] bg-brand-primary hover:bg-brand-primary-hover text-white font-semibold inline-flex items-center transition-colors"
      >
        Back to {typographic(eventConfig.event.name)}
      </Link>
    </main>
  );
}
