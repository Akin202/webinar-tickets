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
  const [mounted, setMounted] = useState(false);
  const [timeLeft, setTimeLeft] = useState<TimeRemaining>(() => calculateTimeRemaining(targetIso));
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    setMounted(true);
    setTimeLeft(calculateTimeRemaining(targetIso));

    const timer = setInterval(() => {
      setTimeLeft(calculateTimeRemaining(targetIso));
    }, 1000);

    return () => clearInterval(timer);
  }, [targetIso]);

  if (!mounted) {
    return (
      <div
        id="countdown-timer"
        className="flex items-center justify-center gap-2 sm:gap-3 py-2"
        aria-label="Countdown to event"
      >
        {['DAYS', 'HOURS', 'MINUTES', 'SECONDS'].map((label) => (
          <div
            key={label}
            className="flex flex-col items-center justify-center min-w-[70px] sm:min-w-[80px] px-2.5 py-2.5 rounded-xl bg-brand-card border border-brand-border shadow-sm relative overflow-hidden"
          >
            <div className="absolute top-0 inset-x-0 h-0.5 bg-brand-primary/40" />
            <span className="text-2xl sm:text-3xl font-black text-brand-primary tracking-tight font-display">
              --
            </span>
            <span className="text-[10px] sm:text-xs font-bold tracking-widest text-slate-400 uppercase mt-0.5">
              {label}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (timeLeft.isExpired) {
    return (
      <div
        id="countdown-timer"
        className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-brand-card border border-brand-border text-brand-primary text-base font-semibold"
      >
        <span>Doors Are Now Open!</span>
      </div>
    );
  }

  const units = [
    { label: 'DAYS', value: timeLeft.days },
    { label: 'HOURS', value: timeLeft.hours },
    { label: 'MINUTES', value: timeLeft.minutes },
    { label: 'SECONDS', value: timeLeft.seconds },
  ];

  return (
    <div
      id="countdown-timer"
      className="flex items-center justify-center gap-2 sm:gap-3 py-2"
      aria-label="Countdown to event"
    >
      {units.map((unit) => (
        <div
          key={unit.label}
          className={`flex flex-col items-center justify-center min-w-[70px] sm:min-w-[80px] px-2.5 py-2.5 rounded-xl bg-brand-card border border-brand-border shadow-sm relative overflow-hidden ${
            prefersReducedMotion ? '' : 'transition-transform duration-200 hover:scale-105'
          }`}
        >
          <div className="absolute top-0 inset-x-0 h-0.5 bg-brand-primary/40" />
          <span className="text-2xl sm:text-3xl font-black text-brand-primary tracking-tight font-display">
            {String(unit.value).padStart(2, '0')}
          </span>
          <span className="text-[10px] sm:text-xs font-bold tracking-widest text-slate-400 uppercase mt-0.5">
            {unit.label}
          </span>
        </div>
      ))}
    </div>
  );
};
