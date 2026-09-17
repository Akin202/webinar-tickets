import { eventConfig } from '@/config/event.config';
import { DATE_FULL_CAPS, EVENT_NAME, HOURS } from './event-format';

const { event, ticketing, copy } = eventConfig;

type EventHeroProps = {
  /** Live price from the sales counter, already formatted ("₦10,000"). */
  price: string;
};

/** Ring with a filled triangle: the comp's play mark, icon-sized. */
function PlayMark() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="8.6" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8.1 6.6v6.8l5.4-3.4z" fill="currentColor" />
    </svg>
  );
}

/** First screen: date pill, event name, venue-and-price line, the two ways in. */
export function EventHero({ price }: EventHeroProps) {
  return (
    <section className="sp-hero" aria-labelledby="hero-heading">
      <img
        className="sp-hero__waves"
        src="/assets/plates/wave-lines.webp"
        alt=""
        aria-hidden="true"
        width={1128}
        height={484}
        decoding="async"
      />
      <div className="sp-shell sp-hero__in">
        <p className="sp-pill">
          {DATE_FULL_CAPS} <span aria-hidden="true">·</span> {HOURS}
        </p>
        <h1 id="hero-heading">{EVENT_NAME}</h1>
        <p className="sp-hero__sub">
          <span>
            {event.venueName}, {event.venueArea}.
          </span>{' '}
          <span>
            {ticketing.capacity} {copy.hero.seatsWord}, {price} {copy.hero.priceSuffix}.
          </span>
        </p>
        <div className="sp-hero__actions">
          <a className="sp-btn sp-btn--primary" href="#tickets">
            {copy.hero.seatCta}
          </a>
          <a className="sp-btn sp-btn--outline" href="#livestream">
            <PlayMark />
            {copy.hero.livestreamCta}
          </a>
        </div>
      </div>
    </section>
  );
}
