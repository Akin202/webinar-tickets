import Link from 'next/link';
import { Plus } from 'lucide-react';
import { eventConfig } from '@/config/event.config';
import { EVENT_NAME, WHATSAPP_HREF, typographic } from './event-format';

const { event, audiences, organisers, partners, faq, support, copy } = eventConfig;

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

/** About the organisers: the same divided list as the audiences, one item each. */
export function OrganisersSection() {
  return (
    <section className="sp-band" aria-labelledby="organisers-heading">
      <div className="sp-shell">
        <div className="sp-head">
          <h2 id="organisers-heading">{copy.organisers.heading}</h2>
        </div>
        <div className="sp-who">
          {organisers.map((organiser) => (
            <div key={organiser.name} className="sp-who__item">
              <h3>{organiser.name}</h3>
              <p>{typographic(organiser.body)}</p>
              {organiser.url && (
                <a className="sp-who__link" href={organiser.url} target="_blank" rel="noopener noreferrer">
                  {new URL(organiser.url).host}
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Partner logos from config, or a plain placeholder line while the list is empty. */
export function PartnersSection() {
  return (
    <section className="sp-band" aria-labelledby="partners-heading">
      <div className="sp-shell">
        <div className="sp-head">
          <h2 id="partners-heading">{copy.partners.heading}</h2>
        </div>
        {partners.length === 0 ? (
          <p className="sp-partners__tba">{copy.partners.placeholder}</p>
        ) : (
          <ul className="sp-partners">
            {partners.map((partner) => {
              const logo = (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={partner.logoUrl} alt={partner.name} height={48} loading="lazy" decoding="async" />
              );
              return (
                <li key={partner.name}>
                  {partner.url ? (
                    <a href={partner.url} target="_blank" rel="noopener noreferrer">
                      {logo}
                    </a>
                  ) : (
                    logo
                  )}
                </li>
              );
            })}
          </ul>
        )}
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
          {EVENT_NAME} · {event.venueName}, {event.venueArea} · Powered by {event.poweredBy}
        </span>
        <nav className="sp-foot__links" aria-label="Footer">
          <a href="#tickets">Tickets</a>
          <a href="#programme">Programme</a>
          <a href="#faq">FAQ</a>
          <a href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
          <a href={support.linkedinUrl} target="_blank" rel="noopener noreferrer">
            LinkedIn
          </a>
          <Link href="/cookies">Cookies</Link>
        </nav>
      </div>
    </footer>
  );
}
