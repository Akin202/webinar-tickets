'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { eventConfig, doorsOpenIso } from '@/config/event.config';
import { computeOrderTotals, koboToNaira, type PublicSalesCounter } from '@/types/ticketing';
import { getPublicSalesCounter } from '@/lib/data-access';
import { CookieNotice } from '@/components/CookieNotice';
import './event-page.css';

/**
 * The public Summit page. Every string, price, speaker and programme slot
 * comes from config/event.config.ts — this file is layout only.
 *
 * Client component for two reasons only: the live seat counter and the
 * quantity stepper. The OG tags a WhatsApp preview needs are emitted by the
 * root layout on the server, so nothing here affects the link preview.
 */

const { event, ticketing, seat, livestream, copy, support } = eventConfig;

const LAGOS = 'Africa/Lagos';
const doorsOpen = new Date(doorsOpenIso);
const DATE_MASTHEAD = doorsOpen
  .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: LAGOS })
  .toUpperCase();
const DATE_WEEKDAY = doorsOpen.toLocaleDateString('en-GB', { weekday: 'long', timeZone: LAGOS });
const DATE_LONG = doorsOpen.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: LAGOS });

const WHATSAPP_HREF = `https://wa.me/${support.whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(
  support.whatsappMessage
)}`;

/** "Prof. Chika Yinka-Banjo" -> "CY". Titles ending in a full stop are skipped. */
function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter((word) => word && !word.endsWith('.'));
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
}

function HeroTitle() {
  const at = event.name.indexOf(event.nameHighlight);
  if (at < 0) return <>{event.name}</>;
  return (
    <>
      {event.name.slice(0, at)}
      <em>{event.nameHighlight}</em>
      {event.name.slice(at + event.nameHighlight.length)}
    </>
  );
}

/** The mockup's hero linework. Decorative, inline, and off the LCP path. */
function HeroArt() {
  return (
    <svg className="sp-hero__art" viewBox="0 0 1200 620" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1" opacity="0.14">
        <path d="M760 -40 L1240 300 M820 -40 L1240 360 M880 -40 L1240 420 M940 -40 L1240 480 M1000 -40 L1240 540 M1060 -40 L1240 600" />
        <path d="M700 660 L1240 260 M760 660 L1240 320 M820 660 L1240 380 M880 660 L1240 440" />
        <path d="M640 40 L1240 40 M620 120 L1240 120 M600 200 L1240 200 M600 420 L1240 420 M620 500 L1240 500 M640 580 L1240 580" />
      </g>
      <g fill="none" stroke="var(--brand-primary)" strokeWidth="1.4" opacity="0.5">
        <circle cx="1010" cy="200" r="5" />
        <circle cx="1010" cy="420" r="5" />
        <circle cx="880" cy="310" r="5" />
        <path d="M1010 200 L1010 420 M1010 310 L880 310" />
      </g>
    </svg>
  );
}

function SectionHead({ eyebrow, heading, body }: { eyebrow: string; heading: string; body?: string }) {
  return (
    <div className="sp-band__head">
      <p className="sp-eyebrow">{eyebrow}</p>
      <h2>{heading}</h2>
      {body && <p>{body}</p>}
    </div>
  );
}

export const EventPage: React.FC = () => {
  const [counter, setCounter] = useState<PublicSalesCounter | null>(null);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    let cancelled = false;
    getPublicSalesCounter()
      .then((live) => {
        if (!cancelled) setCounter(live);
      })
      .catch(() => {
        // The page stays usable on config values. Checkout re-checks price,
        // capacity and the sales gate authoritatively on the server.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const capacity = counter?.capacity ?? ticketing.capacity;
  const remaining = counter?.ticketsRemaining ?? capacity;
  const priceKobo = counter && counter.currentPriceKobo > 0 ? counter.currentPriceKobo : ticketing.priceKobo;
  const isSoldOut = counter?.isSoldOut ?? false;
  const isClosed = counter?.salesClosed ?? false;
  const canBuy = !isSoldOut && !isClosed;

  const maxQuantity = Math.max(1, Math.min(ticketing.maxPerOrder, remaining));
  const orderQuantity = Math.min(quantity, maxQuantity);
  const totals = computeOrderTotals({
    quantity: orderQuantity,
    unitPriceKobo: priceKobo,
    serviceChargeRate: ticketing.serviceChargeRate,
    passFeeToBuyer: ticketing.passFeeToBuyer,
  });

  const price = koboToNaira(priceKobo);
  const soldFraction = capacity > 0 ? Math.min(1, Math.max(0, (capacity - remaining) / capacity)) : 0;
  const seatStatus = isSoldOut
    ? 'Sold out'
    : isClosed
      ? 'Sales closed'
      : remaining <= ticketing.lowStockThreshold
        ? `Only ${remaining} left`
        : 'Sales open';

  const unavailableNote = isSoldOut
    ? `All ${capacity} seats are taken. There is no waitlist — the livestream is still free.`
    : 'Online sales are closed. The livestream is still free.';

  return (
    <div className="sp-root">
      <header className="sp-masthead">
        <div className="sp-shell sp-masthead__in">
          <a className="sp-mark" href="#top">
            <span className="sp-mark__glyph" aria-hidden="true" />
            <span className="sp-mark__text">{event.hostedBy}</span>
          </a>
          <span className="sp-masthead__meta">
            {DATE_MASTHEAD} · {event.venueName.toUpperCase()}, {event.venueArea.toUpperCase()}
          </span>
          <a className="sp-btn sp-btn--flag" href="#tickets">
            Get a seat
          </a>
        </div>
      </header>

      <main id="top">
        {/* ============ HERO ============ */}
        <section className="sp-hero" aria-labelledby="hero-heading">
          <HeroArt />
          <div className="sp-shell sp-hero__in">
            <p className="sp-eyebrow">{event.eyebrow}</p>
            <h1 id="hero-heading">
              <HeroTitle />
            </h1>
            <p className="sp-hero__lede">{event.lede}</p>
            <div className="sp-hero__actions">
              <a className="sp-btn sp-btn--flag" href="#tickets">
                Get a seat — {price}
              </a>
              <a className="sp-btn sp-btn--ghost" href="#livestream">
                Join the livestream free
              </a>
            </div>

            <dl className="sp-facts">
              <div className="sp-fact">
                <dt className="sp-fact__k">Date</dt>
                <dd className="sp-fact__v">
                  {DATE_WEEKDAY}
                  <br />
                  {DATE_LONG}
                </dd>
              </div>
              <div className="sp-fact">
                <dt className="sp-fact__k">Time</dt>
                <dd className="sp-fact__v">
                  {event.doorsOpen} – {event.endsAt}
                  <br />
                  Doors {event.doorsOpen}
                </dd>
              </div>
              <div className="sp-fact">
                <dt className="sp-fact__k">Venue</dt>
                <dd className="sp-fact__v">
                  {event.venueName}
                  <br />
                  {event.venueArea}
                </dd>
              </div>
              <div className="sp-fact">
                <dt className="sp-fact__k">Capacity</dt>
                <dd className="sp-fact__v">
                  {ticketing.capacity} seats
                  <br />
                  in the room
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* ============ TICKETS ============ */}
        <section className="sp-band" id="tickets" aria-labelledby="tickets-heading">
          <div className="sp-shell">
            <SectionHead {...copy.tickets} />

            <div className="sp-ways">
              <article className="sp-way" aria-label={seat.title}>
                <span className="sp-way__tag">{seat.tag}</span>
                <h3 id="tickets-heading">{seat.title}</h3>
                <p className="sp-way__price">
                  {price} <small>{seat.priceNote}</small>
                </p>

                {eventConfig.featureFlags.showLiveSalesCounter && (
                  <div className="sp-seats">
                    <div
                      className="sp-seats__bar"
                      role="progressbar"
                      aria-label="Seats taken"
                      aria-valuemin={0}
                      aria-valuemax={capacity}
                      aria-valuenow={capacity - remaining}
                    >
                      <div className="sp-seats__fill" style={{ transform: `scaleX(${soldFraction})` }} />
                    </div>
                    <div className="sp-seats__row">
                      <span>
                        {remaining} of {capacity} seats available
                      </span>
                      <span>{seatStatus}</span>
                    </div>
                  </div>
                )}

                <ul className="sp-incl">
                  {seat.includes.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>

                <div className="sp-order">
                  {canBuy && (
                    <>
                      <div className="sp-qty">
                        <span className="sp-qty__label" id="qty-label">
                          How many seats?
                        </span>
                        <div className="sp-stepper" role="group" aria-labelledby="qty-label">
                          <button
                            type="button"
                            aria-label="One fewer seat"
                            disabled={orderQuantity <= 1}
                            onClick={() => setQuantity(Math.max(1, orderQuantity - 1))}
                          >
                            −
                          </button>
                          <output aria-live="polite">{orderQuantity}</output>
                          <button
                            type="button"
                            aria-label="One more seat"
                            disabled={orderQuantity >= maxQuantity}
                            onClick={() => setQuantity(Math.min(maxQuantity, orderQuantity + 1))}
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <p className="sp-total">
                        <span>Total</span> <b>{koboToNaira(totals.totalKobo)}</b>
                      </p>
                      <Link className="sp-btn sp-btn--flag sp-btn--wide" href={`/checkout?qty=${orderQuantity}`}>
                        Continue to checkout
                      </Link>
                      <p className="sp-micro">
                        {seat.microcopy} Maximum {ticketing.maxPerOrder} seats per order.
                      </p>
                    </>
                  )}
                  {!canBuy && (
                    <>
                      <span className="sp-btn sp-btn--flag sp-btn--wide" aria-disabled="true">
                        {isSoldOut ? 'Sold out' : 'Sales closed'}
                      </span>
                      <p className="sp-micro">{unavailableNote}</p>
                    </>
                  )}
                </div>
              </article>

              <article className="sp-way sp-way--free" id="livestream" aria-label={livestream.title}>
                <span className="sp-way__tag">{livestream.tag}</span>
                <h3>{livestream.title}</h3>
                <p className="sp-way__price">
                  Free <small>{livestream.priceNote}</small>
                </p>
                <ul className="sp-incl">
                  {livestream.includes.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <div className="sp-order">
                  {/* Replaced by the registration form when the livestream
                      table and route ship. Never a button that goes nowhere. */}
                  <span className="sp-btn sp-btn--ghost sp-btn--wide" aria-disabled="true">
                    {livestream.comingSoonLabel}
                  </span>
                  <p className="sp-micro">{livestream.microcopy}</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ============ SPEAKERS ============ */}
        <section className="sp-band" id="speakers">
          <div className="sp-shell">
            <SectionHead {...copy.speakers} />
            <div className="sp-speakers">
              {eventConfig.speakers.map((speaker) => (
                <article key={speaker.id} className={`sp-spk${speaker.announced ? '' : ' sp-spk--tba'}`}>
                  <div className="sp-spk__frame">
                    <div className="sp-spk__photo">
                      {speaker.photoUrl ? (
                        <Image
                          src={speaker.photoUrl}
                          alt={speaker.name}
                          fill
                          sizes="(max-width: 520px) 90vw, 280px"
                          loading="lazy"
                        />
                      ) : (
                        <>
                          <span className="sp-spk__initials" aria-hidden="true">
                            {speaker.announced ? initialsOf(speaker.name) : '+1'}
                          </span>
                          <span className="sp-spk__ph">{speaker.announced ? 'Photo to come' : 'Announcing soon'}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <h3 className="sp-spk__name">{speaker.name}</h3>
                  {speaker.role && <p className="sp-spk__role">{speaker.role}</p>}
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ============ PROGRAMME ============ */}
        <section className="sp-band sp-band--ink" id="programme">
          <div className="sp-shell">
            <SectionHead {...copy.programme} />
            <ol className="sp-prog">
              {eventConfig.programme.map((slot) => (
                <li key={slot.time} className={`sp-slot${slot.isBreak ? ' sp-slot--break' : ''}`}>
                  <span className="sp-slot__t">{slot.time}</span>
                  <span className="sp-slot__n">{slot.title}</span>
                  <span className="sp-slot__w">{slot.durationMins ? `${slot.durationMins} min` : '—'}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ============ WHO ============ */}
        <section className="sp-band">
          <div className="sp-shell">
            <SectionHead {...copy.audiences} />
            <div className="sp-who">
              {eventConfig.audiences.map((audience) => (
                <div key={audience.title} className="sp-who__col">
                  <h3>{audience.title}</h3>
                  <p>{audience.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ FAQ ============ */}
        <section className="sp-band" id="faq">
          <div className="sp-shell">
            <SectionHead {...copy.faq} />
            <div className="sp-faq">
              {eventConfig.faq.map((item, index) => (
                <details key={item.question} className="sp-qa" open={index === 0}>
                  <summary>{item.question}</summary>
                  <p className="sp-qa__body">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ============ CLOSER ============ */}
        <section className="sp-shell sp-closer">
          <p className="sp-eyebrow">{DATE_LONG}</p>
          <h2>{copy.closer.heading}</h2>
          <p>{copy.closer.body}</p>
          <a className="sp-btn sp-btn--flag" href="#tickets">
            Get a seat — {price}
          </a>
          <p className="sp-micro">
            Questions?{' '}
            <a href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer">
              Message us on WhatsApp
            </a>
            .
          </p>
        </section>

        <footer className="sp-shell sp-foot">
          <span>
            {event.name} · {event.venueName}, {event.venueArea}
          </span>
          <span className="sp-foot__links">
            <a href="#tickets">Tickets</a>
            <a href="#programme">Programme</a>
            <a href="#faq">FAQ</a>
            <a href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
            <Link href="/cookies">Cookies</Link>
          </span>
        </footer>
      </main>

      <div aria-hidden="true" style={{ height: 'var(--cookie-notice-height, 0px)' }} />
      <CookieNotice />
    </div>
  );
};
