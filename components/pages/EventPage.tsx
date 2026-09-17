'use client';

import React, { useEffect, useState } from 'react';
import { eventConfig } from '@/config/event.config';
import { computeOrderTotals, koboToNaira, type PublicSalesCounter } from '@/types/ticketing';
import { getPublicSalesCounter } from '@/lib/data-access';
import { CookieNotice } from '@/components/CookieNotice';
import { EventTopBar } from './event/EventTopBar';
import { EventHero } from './event/EventHero';
import { DayPreview } from './event/DayPreview';
import { TicketsSection, type SeatState } from './event/TicketsSection';
import { SpeakersSection } from './event/SpeakersSection';
import { ProgrammeSection } from './event/ProgrammeSection';
import { AudienceSection, Closer, EventFooter, FaqSection } from './event/ReadingSections';
import './event-page.css';

/**
 * The public Summit page. Every string, price, speaker and programme slot
 * comes from config/event.config.ts — the parts under ./event are layout only.
 *
 * Client component for two reasons only: the live seat counter and the
 * quantity stepper. The OG tags a WhatsApp preview needs are emitted by the
 * root layout on the server, so nothing here affects the link preview.
 */

const { ticketing } = eventConfig;

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
    serviceChargeKoboPerSeat: ticketing.serviceChargeKoboPerSeat,
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

  const seatState: SeatState = {
    capacity,
    remaining,
    price,
    total: koboToNaira(totals.totalKobo),
    soldFraction,
    seatStatus,
    canBuy,
    isSoldOut,
    unavailableNote,
    orderQuantity,
    maxQuantity,
  };

  return (
    <div className="sp-root">
      <EventTopBar />

      <main id="top">
        <EventHero price={price} />
        <DayPreview />
        <TicketsSection state={seatState} onQuantityChange={setQuantity} />
        <SpeakersSection />
        <ProgrammeSection />
        <AudienceSection />
        <FaqSection />
        <Closer price={price} />
      </main>
      <EventFooter />

      <div aria-hidden="true" style={{ height: 'var(--cookie-notice-height, 0px)' }} />
      <CookieNotice />
    </div>
  );
};
