'use client';

import React, { useState, useEffect } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface CountdownProps {
  targetIso: string;
}

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
}

function calculateTimeRemaining(targetIso: string): TimeRemaining {
  const targetDate = new Date(targetIso).getTime();
  const now = new Date().getTime();
  const difference = targetDate - now;

  if (difference <= 0 || isNaN(targetDate)) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true };
  }

  const days = Math.floor(difference / (1000 * 60 * 60 * 24));
  const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((difference / 1000 / 60) % 60);
  const seconds = Math.floor((difference / 1000) % 60);

  return { days, hours, minutes, seconds, isExpired: false };
}

export const Countdown: React.FC<CountdownProps> = ({ targetIso }) => {
  // Always initialize with calculated time so there is never a "--" flash
  const [timeLeft, setTimeLeft] = useState<TimeRemaining>(() => calculateTimeRemaining(targetIso));

  useEffect(() => {
    // Sync immediately on mount to local clock
    setTimeLeft(calculateTimeRemaining(targetIso));

    const timer = setInterval(() => {
      setTimeLeft(calculateTimeRemaining(targetIso));
    }, 1000);

    return () => clearInterval(timer);
  }, [targetIso]);

  if (timeLeft.isExpired) {
    return (
      <div
        id="countdown-timer"
        suppressHydrationWarning
        className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-brand-card border border-brand-primary/40 text-brand-primary text-sm font-bold uppercase tracking-wider"
      >
        <span>Doors Are Now Open!</span>
      </div>
    );
  }

  const units = [
    { label: 'DAYS', value: timeLeft.days },
    { label: 'HRS', value: timeLeft.hours },
    { label: 'MINS', value: timeLeft.minutes },
    { label: 'SECS', value: timeLeft.seconds },
  ];

  return (
    <div
      id="countdown-timer"
      suppressHydrationWarning
      className="inline-flex items-center justify-center gap-1.5 sm:gap-2.5 p-1.5 sm:p-2 rounded-2xl bg-brand-surface/90 border border-brand-border"
      aria-label="Countdown to event doors open"
    >
      {units.map((unit, idx) => (
        <React.Fragment key={unit.label}>
          <div className="flex flex-col items-center justify-center min-w-[56px] sm:min-w-[70px] py-1.5 px-2 rounded-xl bg-brand-card/90 border border-brand-border/80">
            <span
              suppressHydrationWarning
              className="text-xl sm:text-2xl font-extrabold text-brand-text tracking-tight font-display tabular-nums leading-none"
            >
              {String(unit.value).padStart(2, '0')}
            </span>
            <span className="text-[9px] sm:text-[10px] font-semibold tracking-widest text-brand-muted uppercase mt-1">
              {unit.label}
            </span>
          </div>
          {idx < units.length - 1 && (
            <span className="text-brand-border font-bold text-xs -mx-0.5 select-none">:</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};
