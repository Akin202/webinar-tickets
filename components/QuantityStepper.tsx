'use client';

import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface QuantityStepperProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (newValue: number) => void;
  disabled?: boolean;
}

export const QuantityStepper: React.FC<QuantityStepperProps> = ({
  value,
  min = 1,
  max = 5,
  onChange,
  disabled = false,
}) => {
  const prefersReducedMotion = useReducedMotion();

  const handleDecrement = () => {
    if (!disabled && value > min) {
      onChange(value - 1);
    }
  };

  const handleIncrement = () => {
    if (!disabled && value < max) {
      onChange(value + 1);
    }
  };

  const isMin = value <= min;
  const isMax = value >= max;

  return (
    <div
      id="quantity-stepper"
      className="inline-flex items-center gap-1.5 p-1 rounded-2xl bg-brand-surface border border-brand-border"
      role="group"
      aria-label="Select ticket quantity"
    >
      <button
        type="button"
        id="quantity-decrement-btn"
        onClick={handleDecrement}
        disabled={disabled || isMin}
        aria-label="Decrease quantity"
        className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-lg border transition-all ${
          disabled || isMin
            ? 'opacity-30 cursor-not-allowed bg-transparent border-transparent text-brand-dim'
            : 'bg-brand-card hover:bg-brand-card-hover border-brand-border text-brand-text active:scale-95'
        }`}
        style={{
          transition: prefersReducedMotion ? 'none' : 'transform 0.15s ease, opacity 0.15s ease',
        }}
      >
        <Minus className="w-4 h-4" />
      </button>

      <div className="min-w-[48px] h-11 flex flex-col items-center justify-center px-2">
        <span className="text-xl font-extrabold font-display text-brand-text leading-none">
          {value}
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-wider text-brand-muted mt-0.5">
          {value === 1 ? 'Pass' : 'Passes'}
        </span>
      </div>

      <button
        type="button"
        id="quantity-increment-btn"
        onClick={handleIncrement}
        disabled={disabled || isMax}
        aria-label="Increase quantity"
        className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-lg border transition-all ${
          disabled || isMax
            ? 'opacity-30 cursor-not-allowed bg-transparent border-transparent text-brand-dim'
            : 'bg-brand-card hover:bg-brand-card-hover border-brand-border text-brand-text active:scale-95'
        }`}
        style={{
          transition: prefersReducedMotion ? 'none' : 'transform 0.15s ease, opacity 0.15s ease',
        }}
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
};
