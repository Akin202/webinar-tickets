import { eventConfig } from '@/config/event.config';

/**
 * Emits the brand custom properties from event.config.ts.
 *
 * This is what makes the config a real switch: change `brand` in
 * event.config.ts and the public surfaces repaint. The neutral scale
 * (cards, borders, muted text) is DERIVED from these in index.css via
 * color-mix, so a light-surface event stays coherent without editing CSS.
 *
 * Deliberately NOT config-driven:
 *  - scanner result colours (--scan-*), which are safety signals. Green
 *    must mean admitted at every event, whatever the brand palette is.
 *  - tool chrome (--tool-*) for /admin and /scan/login, which are
 *    instruments, not marketing surfaces.
 */
export function brandCssVars(): string {
  const b = eventConfig.brand;
  return [
    ':root{',
    `--brand-primary:${b.primary};`,
    `--brand-accent:${b.accent};`,
    `--brand-surface:${b.surface};`,
    `--brand-text:${b.ink};`,
    `--font-heading:${b.fontHeading};`,
    `--font-body:${b.fontBody};`,
    `--font-mono:${b.fontMono};`,
    '}',
  ].join('');
}

/**
 * Renders the block above into the document. Server-rendered under
 * Next.js, so there is no flash of unthemed content.
 */
export function BrandThemeStyle() {
  return <style id="brand-theme" dangerouslySetInnerHTML={{ __html: brandCssVars() }} />;
}
