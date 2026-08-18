import React from 'react';
import { koboToNaira } from '@/types/ticketing';

interface PriceTagProps {
  priceKobo: number;
  feeKobo?: number;
  passFeeToBuyer?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const PriceTag: React.FC<PriceTagProps> = ({
  priceKobo,
  feeKobo = 0,
  passFeeToBuyer = false,
  size = 'md',
}) => {
  const formattedBase = koboToNaira(priceKobo);
  const formattedFee = feeKobo > 0 ? koboToNaira(feeKobo) : null;
  const totalKobo = passFeeToBuyer ? priceKobo + feeKobo : priceKobo;
  const formattedTotal = koboToNaira(totalKobo);

  if (size === 'lg') {
    return (
      <div id="price-tag-large" className="flex flex-col items-start gap-1">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl sm:text-4xl font-extrabold text-brand-text tracking-tight font-mono">
            {formattedBase}
          </span>
          <span className="text-sm font-semibold text-brand-muted uppercase">/ ticket</span>
        </div>
        {passFeeToBuyer && formattedFee && (
          <div className="flex items-center gap-1.5 text-xs sm:text-sm text-brand-muted">
            <span>+ {formattedFee} processing fee</span>
            <span className="text-brand-dim font-mono">({formattedTotal} total)</span>
          </div>
        )}
      </div>
    );
  }

  if (size === 'sm') {
    return (
      <div id="price-tag-small" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-text">
        <span className="font-mono font-bold text-brand-primary">{formattedBase}</span>
        {passFeeToBuyer && formattedFee && (
          <span className="text-xs text-brand-muted font-normal">+ {formattedFee} fee</span>
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
      {passFeeToBuyer && formattedFee && (
        <span className="text-xs text-brand-muted">
          + {formattedFee} gateway fee at checkout
        </span>
      )}
    </div>
  );
};
