'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { X } from 'lucide-react';
import { eventConfig } from '@/config/event.config';
import { WHATSAPP_HREF } from './event-format';
import './top-bar.css';

const { event, copy } = eventConfig;

const NAV_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: '#tickets', label: 'Tickets' },
  { href: '#speakers', label: 'Speakers' },
  { href: '#programme', label: 'Programme' },
  { href: '#faq', label: 'FAQ' },
];

/** Three long strokes, the comp's menu mark. */
function MenuMark() {
  return (
    <svg viewBox="0 0 27 18" aria-hidden="true">
      <path d="M1.2 1.5h24.6M1.2 9h24.6M1.2 16.5h24.6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/** The light strip at the top of the page: logo chip, and a menu that opens a jump list. */
type EventTopBarProps = {
  /** "/" on pages other than the event page, so section links jump back to it. */
  linkBase?: string;
};

export function EventTopBar({ linkBase = '' }: EventTopBarProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen]);

  return (
    <header className="sp-top">
      <div className="sp-shell sp-top__in">
        <Link className="sp-top__logo" href="/" aria-label={`${event.hostedBy} — ${event.name}`}>
          <Image src="/assets/flagiq-logo-trim.png" alt="" width={252} height={289} priority />
        </Link>
        <nav className="sp-top__wide" aria-label="Page sections">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={`${linkBase}${link.href}`}>
              {link.label}
            </a>
          ))}
          <a href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer">
            {copy.hero.helpLabel}
          </a>
        </nav>
        <button
          type="button"
          className="sp-top__menu"
          aria-expanded={isOpen}
          aria-controls="sp-menu"
          aria-label={copy.hero.menuLabel}
          onClick={() => setIsOpen((open) => !open)}
        >
          {isOpen ? <X aria-hidden="true" strokeWidth={2.25} /> : <MenuMark />}
        </button>
      </div>
      <nav
        id="sp-menu"
        className="sp-menu"
        aria-label="Page sections"
        hidden={!isOpen}
        onClick={(clickEvent) => {
          if ((clickEvent.target as HTMLElement).closest('a')) setIsOpen(false);
        }}
      >
        <div className="sp-shell">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={`${linkBase}${link.href}`}>
              {link.label}
            </a>
          ))}
          <a href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer">
            {copy.hero.helpLabel}
          </a>
        </div>
      </nav>
    </header>
  );
}
