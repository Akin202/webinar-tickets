/**
 * Single source of truth for "are we in a development build".
 *
 * Anything gated on this must NOT ship to production: the dev state
 * switcher, the simulated-payment buttons, and any fixture loading.
 *
 * NOTE: no type annotation, deliberately. Next replaces
 * `process.env.NODE_ENV` with a string literal at build time, and an
 * un-annotated const lets the bundler fold this to `false` and drop the
 * guarded branches. Annotating it (`: boolean`) is enough to defeat that
 * and ship the dev code to production — which is exactly what happened
 * once already.
 *
 * For a guard that must also drop a static IMPORT, inline the comparison
 * at the call site instead; see components/dev/DevStateProvider.tsx.
 */
export const IS_DEV = process.env.NODE_ENV !== 'production';
