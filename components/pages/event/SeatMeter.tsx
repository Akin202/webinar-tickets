'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

type SeatMeterProps = {
  capacity: number;
  remaining: number;
  soldFraction: number;
};

/**
 * The seat bar. It renders at its true fill first, so a visitor with no
 * JavaScript or reduced motion sees the real number immediately. When motion
 * is allowed and the bar is still below the fold, it empties and fills once
 * as it scrolls into view: the page's one authored motion moment.
 */
export function SeatMeter({ capacity, remaining, soldFraction }: SeatMeterProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const [isArmed, setIsArmed] = useState(false);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar || prefersReducedMotion || !('IntersectionObserver' in window)) return;
    if (bar.getBoundingClientRect().top < window.innerHeight) return;

    setIsArmed(true);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsArmed(false);
          observer.disconnect();
        }
      },
      { threshold: 1 }
    );
    observer.observe(bar);
    return () => observer.disconnect();
  }, [prefersReducedMotion]);

  return (
    <div
      ref={barRef}
      className="sp-seats__bar"
      role="progressbar"
      aria-label="Seats taken"
      aria-valuemin={0}
      aria-valuemax={capacity}
      aria-valuenow={capacity - remaining}
    >
      <div className="sp-seats__fill" style={{ transform: `scaleX(${isArmed ? 0 : soldFraction})` }} />
    </div>
  );
}
