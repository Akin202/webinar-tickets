import Link from 'next/link';
import { Check } from 'lucide-react';
import { eventConfig } from '@/config/event.config';
import { SeatMeter } from './SeatMeter';
import { typographic } from './event-format';

const { ticketing, seat, livestream, copy } = eventConfig;

export type SeatState = {
  capacity: number;
  remaining: number;
  price: string;
  total: string;
  soldFraction: number;
  seatStatus: string;
  canBuy: boolean;
  isSoldOut: boolean;
  unavailableNote: string;
  orderQuantity: number;
  maxQuantity: number;
};

type TicketsSectionProps = {
  state: SeatState;
  onQuantityChange: (next: number) => void;
};

function Includes({ lines }: { lines: ReadonlyArray<string> }) {
  return (
    <ul className="sp-incl">
      {lines.map((line) => (
        <li key={line}>
          <Check aria-hidden="true" strokeWidth={2.5} />
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}

/** The two ways in: the paid seat with the live counter and stepper, and the free livestream. */
export function TicketsSection({ state, onQuantityChange }: TicketsSectionProps) {
  const {
    capacity,
    remaining,
    price,
    total,
    soldFraction,
    seatStatus,
    canBuy,
    isSoldOut,
    unavailableNote,
    orderQuantity,
    maxQuantity,
  } = state;

  return (
    <section className="sp-band" id="tickets" aria-labelledby="tickets-heading">
      <div className="sp-shell">
        <div className="sp-head">
          <h2 id="tickets-heading">{copy.tickets.heading}</h2>
          <p>{typographic(copy.tickets.body)}</p>
        </div>

        <div className="sp-ways">
          <article className="sp-way sp-way--seat" aria-labelledby="seat-title">
            <div className="sp-way__head">
              <h3 id="seat-title">{seat.title}</h3>
              <p className="sp-chip">{seat.tag}</p>
            </div>
            <p className="sp-way__price">
              <span className="sp-money">{price}</span> <small>{seat.priceNote}</small>
            </p>

            {eventConfig.featureFlags.showLiveSalesCounter && (
              <div className="sp-seats">
                <p className="sp-seats__row">
                  <span>
                    <b>{remaining}</b> of {capacity} seats left
                  </span>
                  <span className="sp-seats__status">{seatStatus}</span>
                </p>
                <SeatMeter capacity={capacity} remaining={remaining} soldFraction={soldFraction} />
              </div>
            )}

            <Includes lines={seat.includes} />

            <div className="sp-order">
              {canBuy ? (
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
                        onClick={() => onQuantityChange(Math.max(1, orderQuantity - 1))}
                      >
                        −
                      </button>
                      <output aria-live="polite">{orderQuantity}</output>
                      <button
                        type="button"
                        aria-label="One more seat"
                        disabled={orderQuantity >= maxQuantity}
                        onClick={() => onQuantityChange(Math.min(maxQuantity, orderQuantity + 1))}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <p className="sp-total">
                    <span>Total</span> <b className="sp-money">{total}</b>
                  </p>
                  <p className="sp-micro">{typographic(seat.feeNote)}</p>
                  <Link className="sp-btn sp-btn--primary sp-btn--wide" href={`/checkout?qty=${orderQuantity}`}>
                    Continue to checkout
                  </Link>
                  <p className="sp-micro">
                    {seat.microcopy} Maximum {ticketing.maxPerOrder} seats per order.
                  </p>
                </>
              ) : (
                <>
                  <span className="sp-btn sp-btn--primary sp-btn--wide" aria-disabled="true">
                    {isSoldOut ? 'Sold out' : 'Sales closed'}
                  </span>
                  <p className="sp-micro">{unavailableNote}</p>
                </>
              )}
            </div>
          </article>

          <article className="sp-way sp-way--free" id="livestream" aria-labelledby="livestream-title">
            <div className="sp-way__head">
              <h3 id="livestream-title">{livestream.title}</h3>
              <p className="sp-chip">{livestream.tag}</p>
            </div>
            <p className="sp-way__price">
              <span className="sp-money">Free</span> <small>{livestream.priceNote}</small>
            </p>
            <Includes lines={livestream.includes} />
            <div className="sp-order">
              {/* Replaced by the registration form when the livestream
                  table and route ship. Never a button that goes nowhere. */}
              <span className="sp-btn sp-btn--outline sp-btn--wide" aria-disabled="true">
                {livestream.comingSoonLabel}
              </span>
              <p className="sp-micro">{livestream.microcopy}</p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
