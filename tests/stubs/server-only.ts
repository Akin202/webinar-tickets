/**
 * The real `server-only` package resolves to a module that throws unless the
 * bundler is in React Server Component mode. Vitest is neither a bundler nor
 * in that mode, so importing a server module under test would blow up on the
 * guard rather than on anything real. This no-op stands in for it; the guard
 * still does its job in the actual Next build, which is where it matters.
 */
export {};
