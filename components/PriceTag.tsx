import React from 'react';
import { koboToNaira, computeOrderTotals } from '@/types/ticketing';
import { eventConfig } from '@/config/event.config';

interface PriceTagProps {
  /** Quantity to price. Defaults to a single ticket. */
  quantity?: number;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Displays the headline ticket price and, when the buyer covers them, the
 * charges added on top. Derives everything from computeOrderTotals so the
 * public page can never disagree with the checkout summary or the server.
 */
export const PriceTag: React.FC<PriceTagProps> = ({ quantity = 1, size = 'md' }) => {
  const totals = computeOrderTotals({
    quantity,
    unitPriceKobo: eventConfig.ticketing.priceKobo,
    serviceChargeRate: eventConfig.ticketing.serviceChargeRate,
    passFeeToBuyer: eventConfig.ticketing.passFeeToBuyer,
  });

  const extrasKobo = totals.totalKobo - totals.baseKobo;
  const formattedBase = koboToNaira(totals.unitPriceKobo);
  const formattedTotal = koboToNaira(totals.totalKobo);
  const hasExtras = extrasKobo > 0;

  if (size === 'lg') {
    return (
      <div id="price-tag-large" className="flex flex-col items-start gap-1">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl sm:text-4xl font-extrabold text-brand-text tracking-tight font-mono">
            {formattedBase}
          </span>
          <span className="text-sm font-semibold text-brand-muted uppercase">/ ticket</span>
        </div>
        {hasExtras && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs sm:text-sm text-brand-muted">
            <span>
              + {eventConfig.ticketing.serviceChargeLabel.toLowerCase()} &amp; payment fee
            </span>
            <span className="text-brand-dim font-mono">({formattedTotal} total)</span>
          </div>
        )}
      </div>
    );
  }

  if (size === 'sm') {
    return (
      <div
        id="price-tag-small"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-text"
      >
        <span className="font-mono font-bold text-brand-primary">{formattedBase}</span>
        {hasExtras && (
          <span className="text-xs text-brand-muted font-normal">+ fees</span>
        )}
      </div>
    );
  }

  return (
    <div id="price-tag-medium" className="flex flex-col gap-0.5">
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl sm:text-3xl font-bold text-brand-text font-mono">
          {formattedBase}
        </span>
        <span className="text-xs text-brand-muted font-medium uppercase">per pass</span>
      </div>
      {hasExtras && (
        <span className="text-xs text-brand-muted">
          + {eventConfig.ticketing.serviceChargeLabel.toLowerCase()} &amp; payment fee at checkout
        </span>
      )}
    </div>
  );
};
