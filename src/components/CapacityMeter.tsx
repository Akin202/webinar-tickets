import React from 'react';
import { AlertTriangle, CheckCircle2, Flame, Users } from 'lucide-react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface CapacityMeterProps {
  sold: number;
  capacity: number;
  lowStockThreshold?: number;
  showCount?: boolean;
}

export const CapacityMeter: React.FC<CapacityMeterProps> = ({
  sold,
  capacity,
  lowStockThreshold = 50,
  showCount = true,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const remaining = Math.max(0, capacity - sold);
  const percentage = Math.min(100, Math.max(0, Math.round((sold / capacity) * 100)));
  const isSoldOut = remaining === 0 || sold >= capacity;
  const isLowStock = !isSoldOut && remaining <= lowStockThreshold;

  if (isSoldOut) {
    return (
      <div
        id="capacity-meter-sold-out"
        className="w-full p-4 rounded-xl bg-brand-urgent-bg border border-brand-urgent-border flex items-center justify-between gap-3 text-brand-text"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-brand-urgent flex items-center justify-center text-brand-text font-bold">
            !
          </div>
          <div>
            <h4 className="text-base sm:text-lg font-bold text-brand-text">SOLD OUT</h4>
            <p className="text-sm text-brand-muted">All {capacity} tickets have been claimed.</p>
          </div>
        </div>
        <span className="px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-md bg-brand-urgent text-brand-text">
          Closed
        </span>
      </div>
    );
  }

  return (
    <div
      id="capacity-meter"
      className={`w-full p-4 rounded-xl border transition-colors ${
        isLowStock
          ? 'bg-brand-urgent-bg border-brand-urgent-border'
          : 'bg-brand-card border-brand-border'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isLowStock ? (
            <span className="flex items-center gap-1.5 text-brand-urgent font-bold text-sm sm:text-base">
              <Flame className="w-4 h-4 text-brand-urgent" />
              <span>ALMOST SOLD OUT</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-brand-text font-semibold text-sm sm:text-base">
              <Users className="w-4 h-4 text-brand-primary" />
              <span>Ticket Capacity</span>
            </span>
          )}
        </div>

        <div className="text-right">
          {isLowStock ? (
            <span className="text-sm sm:text-base font-bold text-brand-urgent">
              Only {remaining} left!
            </span>
          ) : (
            showCount && (
              <span className="text-sm sm:text-base font-medium text-brand-muted">
                <strong className="text-brand-text font-bold">{sold}</strong> / {capacity} claimed
              </span>
            )
          )}
        </div>
      </div>

      {/* Progress track */}
      <div
        className="w-full h-3 rounded-full bg-brand-subtle overflow-hidden relative"
        role="progressbar"
        aria-valuenow={sold}
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-label="Ticket sales progress"
      >
        <div
          className={`h-full w-full rounded-full transition-transform duration-500 origin-left ${
            isLowStock ? 'bg-brand-urgent' : 'bg-brand-primary'
          }`}
          style={{
            transform: `scaleX(${percentage / 100})`,
            transition: prefersReducedMotion ? 'none' : 'transform 0.5s ease-out',
          }}
        />
      </div>

      <div className="flex items-center justify-between mt-2 text-xs text-brand-muted">
        <span>{percentage}% Sold</span>
        <span>{remaining} Available</span>
      </div>
    </div>
  );
};
