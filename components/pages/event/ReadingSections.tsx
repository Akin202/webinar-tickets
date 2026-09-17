import Link from 'next/link';
import { Plus } from 'lucide-react';
import { eventConfig } from '@/config/event.config';
import { EVENT_NAME, WHATSAPP_HREF, typographic } from './event-format';

const { event, audiences, faq, copy } = eventConfig;

/** Who the room is for: three plain statements, divided by rules, no card shells. */
export function AudienceSection() {
  return (
    <section className="sp-band" aria-labelledby="who-heading">
      <div className="sp-shell">
        <div className="sp-head">
          <h2 id="who-heading">{copy.audiences.heading}</h2>
        </div>
        <div className="sp-who">
          {audiences.map((audience) => (
            <div key={audience.title} className="sp-who__item">
              <h3>{audience.title}</h3>
              <p>{typographic(audience.body)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FaqSection() {
  return (
    <section className="sp-band" id="faq" aria-labelledby="faq-heading">
      <div className="sp-shell sp-faq">
        <div className="sp-head">
          <h2 id="faq-heading">{typographic(copy.faq.heading)}</h2>
        </div>
        <div className="sp-faq__list">
          {faq.map((item, index) => (
            <details key={item.question} className="sp-qa" open={index === 0}>
              <summary>
                <span>{typographic(item.question)}</span>
                <Plus aria-hidden="true" strokeWidth={2} />
              </summary>
              <p className="sp-qa__body">{typographic(item.answer)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

type CloserProps = {
  price: string;
};

/** The close: the promise once more, the seat action, the venue and a way to ask. */
export function Closer({ price }: CloserProps) {
  return (
    <section className="sp-closer" aria-labelledby="closer-heading">
      <img
        className="sp-closer__waves"
        src="/assets/plates/wave-lines.webp"
        alt=""
        aria-hidden="true"
        width={1128}
        height={484}
        loading="lazy"
        decoding="async"
      />
      <div className="sp-shell sp-closer__in">
        <h2 id="closer-heading">{copy.closer.heading}</h2>
        <p className="sp-closer__body">{typographic(copy.closer.body)}</p>
        <div className="sp-closer__actions">
          <a className="sp-btn sp-btn--primary" href="#tickets">
            {copy.hero.seatCta} — <span className="sp-money">{price}</span>
          </a>
          <a className="sp-btn sp-btn--outline" href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer">
            {copy.hero.helpLabel}
          </a>
        </div>
        <p className="sp-closer__venue">
          {event.venueAddress}.{' '}
          <a href={event.venueMapUrl} target="_blank" rel="noopener noreferrer">
            Open in Maps
          </a>
        </p>
      </div>
    </section>
  );
}

export function EventFooter() {
  return (
    <footer className="sp-foot">
      <div className="sp-shell sp-foot__in">
        <span>
          {EVENT_NAME} · {event.venueName}, {event.venueArea}
        </span>
        <nav className="sp-foot__links" aria-label="Footer">
          <a href="#tickets">Tickets</a>
          <a href="#programme">Programme</a>
          <a href="#faq">FAQ</a>
          <a href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
          <Link href="/cookies">Cookies</Link>
        </nav>
      </div>
    </footer>
  );
}
