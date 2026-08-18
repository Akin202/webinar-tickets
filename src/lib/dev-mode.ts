/**
 * Single source of truth for "are we in a development build".
 *
 * Anything gated on this must NOT ship to production: the dev state
 * switcher, the simulated-payment buttons, and any fixture loading.
 *
 * Kept in its own module so the Vite -> Next.js migration only has to
 * change one line (import.meta.env.DEV -> process.env.NODE_ENV).
 */
export const IS_DEV: boolean = import.meta.env.DEV;
