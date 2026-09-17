import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { eventConfig, doorsOpenIso } from '@/config/event.config';
import { EVENT_NAME } from '@/components/pages/event/event-format';

/**
 * The WhatsApp link preview, generated server-side at 1200x630.
 *
 * Generated rather than committed as a binary so it stays driven by
 * event.config.ts like every other instance-specific string — change the
 * config and the preview follows. It mirrors the page's first screen: navy
 * ground, the logo on its light chip, the date pill, the event name, and the
 * venue-and-price line. Flat colour plus one small logo keeps the PNG well
 * under WhatsApp's ~300KB preview ceiling.
 *
 * Fonts are read from assets/fonts (SIL OFL): Figtree 800 for the type, and
 * Noto Sans as a fallback because Figtree has no ₦ glyph. The page itself gets
 * ₦ from the phone's system font; the image renderer has no system fonts.
 */
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = eventConfig.seo.title;

const NAVY = eventConfig.brand.surface;
const TEXT = eventConfig.brand.ink;

export default async function OpengraphImage() {
  const { event, ticketing, copy } = eventConfig;
  const doorsOpen = new Date(doorsOpenIso)
    .toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Africa/Lagos',
    })
    .replace(',', '')
    .toUpperCase();
  const naira = `₦${(ticketing.priceKobo / 100).toLocaleString('en-NG')}`;
  const [logo, figtree, noto] = await Promise.all([
    readFile(path.join(process.cwd(), 'public/assets/flagiq-logo.png')),
    readFile(path.join(process.cwd(), 'assets/fonts/figtree-latin-800.ttf')),
    readFile(path.join(process.cwd(), 'assets/fonts/noto-sans-latin-ext-700.ttf')),
  ]);
  const logoSrc = `data:image/png;base64,${logo.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: NAVY,
          padding: '56px 72px 64px',
          fontFamily: 'Figtree, Noto Sans',
          color: TEXT,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 112,
              height: 112,
              borderRadius: 24,
              background: '#E9EDF2',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc} width={96} height={96} alt="" />
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              height: 52,
              padding: '0 24px',
              borderRadius: 999,
              border: '2px solid #1d3157',
              background: '#0b1733',
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: 4,
            }}
          >
            {`${doorsOpen} · ${event.doorsOpen}–${event.endsAt}`}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ display: 'flex', maxWidth: 820, fontSize: 124, lineHeight: 0.95, fontWeight: 800, letterSpacing: -4, color: '#ffffff' }}>
            {EVENT_NAME}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, fontSize: 36, fontWeight: 800, color: '#eef1f6' }}>
            <span>{`${event.venueName}, ${event.venueArea}.`}</span>
            <span
              style={{
                display: 'flex',
                padding: '8px 22px',
                borderRadius: 10,
                background: eventConfig.brand.primary,
                color: '#ffffff',
                fontWeight: 800,
              }}
            >
              {`${ticketing.capacity} ${copy.hero.seatsWord} · ${naira} ${copy.hero.priceSuffix}`}
            </span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Figtree', data: figtree, weight: 800, style: 'normal' },
        { name: 'Noto Sans', data: noto, weight: 700, style: 'normal' },
      ],
    }
  );
}
