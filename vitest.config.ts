import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * Node environment, no jsdom. Everything under test here is pure logic — the
 * money maths, the parsers, the CSV escaper, the webhook's signature gate.
 * The parts that genuinely need a browser (the scanner, the canvas export)
 * are covered by the hardware drill on the launch checklist instead, because
 * a jsdom stand-in for a phone camera at a dark door proves nothing.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Without this the integration suite's "these did NOT run" warning is
    // swallowed by the reporter, and a silently skipped suite reads exactly
    // like a passing one.
    disableConsoleIntercept: true,
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, '.'),
      // See tests/stubs/server-only.ts — the real package throws outside a
      // React Server Component bundle, which vitest is not.
      'server-only': resolve(import.meta.dirname, 'tests/stubs/server-only.ts'),
    },
  },
});
