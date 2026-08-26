import React from 'react';
import { koboToNaira, computeOrderTotals } from '@/types/ticketing';
import { eventConfig } from '@/config/event.config';

interface PriceTagProps {
  /** Quantity to price. Defaults to a single ticket. */
  quantity?: number;
  size?: 'sm' | 'md' | 'lg';
  unitPriceKobo?: number;
}

/**
 * Displays the headline ticket price and, when the buyer covers them, the
 * charges added on top. Derives everything from computeOrderTotals so the
 * public page can never disagree with the checkout summary or the server.
 */
export const PriceTag: React.FC<PriceTagProps> = ({
  quantity = 1,
  size = 'md',
  unitPriceKobo = eventConfig.ticketing.priceKobo,
}) => {
  const totals = computeOrderTotals({
    quantity,
    unitPriceKobo,
    serviceChargeRate: eventConfig.ticketing.serviceChargeRate,
    passFeeToBuyer: eventConfig.ticketing.passFeeToBuyer,
  });

  const extrasKobo = totals.totalKobo - totals.baseKobo;
  const formattedBase = koboToNaira(totals.unitPriceKobo);
  const formattedTotal = koboToNaira(totals.totalKobo);
  const hasExtras = extrasKobo > 0;

  if (size === 'lg') {
    return (
      <div id="price-tag-large" className="flex flex-col items-center sm:items-start gap-1">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl sm:text-5xl font-black text-brand-text tracking-tight font-display">
            {formattedBase}
          </span>
          <span className="text-xs sm:text-sm font-bold text-brand-muted uppercase tracking-wider">/ pass</span>
        </div>
        {hasExtras && (
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 text-xs text-brand-muted font-medium">
            <span>
              + {eventConfig.ticketing.serviceChargeLabel.toLowerCase()} &amp; payment fee
            </span>
            <span className="text-brand-primary font-semibold font-mono">({formattedTotal} all-in)</span>
          </div>
        )}
      </div>
    );
  }

  if (size === 'sm') {
    return (
      <div
        id="price-tag-small"
        className="inline-flex items-baseline gap-1.5 text-sm font-bold text-brand-text"
      >
        <span className="font-display text-base font-extrabold text-brand-primary">{formattedBase}</span>
        {hasExtras && (
          <span className="text-[11px] text-brand-muted font-normal">+ fees</span>
        )}
      </div>
    );
  }

  return (
    <div id="price-tag-medium" className="flex flex-col gap-0.5">
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl sm:text-3xl font-extrabold text-brand-text font-display">
          {formattedBase}
        </span>
        <span className="text-xs text-brand-muted font-bold uppercase tracking-wider">per pass</span>
      </div>
      {hasExtras && (
        <span className="text-xs text-brand-muted font-medium">
          + {eventConfig.ticketing.serviceChargeLabel.toLowerCase()} &amp; processing at checkout ({formattedTotal} total)
        </span>
      )}
    </div>
  );
};
