import { ImageResponse } from 'next/og';
import { eventConfig, doorsOpenIso } from '@/config/event.config';

/**
 * The WhatsApp link preview, generated server-side at 1200x630.
 *
 * Generated rather than committed as a binary so it stays driven by
 * event.config.ts like every other instance-specific string — the next
 * faculty changes the config and the preview follows. Also keeps the repo
 * free of a large asset that would drift from the config.
 *
 * PNG here is well under WhatsApp's ~300KB preview ceiling because it is
 * flat colour and text.
 */
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = eventConfig.seo.title;

export default async function OpengraphImage() {
  const doorsOpen = new Date(doorsOpenIso).toLocaleDateString('en-NG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Africa/Lagos',
  });

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: eventConfig.brand.surface,
          padding: '64px 72px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 26,
              letterSpacing: 6,
              textTransform: 'uppercase',
              color: eventConfig.brand.accent,
              fontWeight: 700,
            }}
          >
            {eventConfig.event.hostedBy}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 128,
              lineHeight: 1,
              fontWeight: 900,
              color: eventConfig.brand.primary,
              letterSpacing: -3,
            }}
          >
            {eventConfig.event.tagline.toUpperCase()}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 46,
              fontWeight: 800,
              color: eventConfig.brand.ink,
              letterSpacing: -1,
            }}
          >
            {eventConfig.event.name}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: `3px solid ${eventConfig.brand.primary}`,
            paddingTop: 28,
            fontSize: 30,
            color: eventConfig.brand.ink,
            fontWeight: 600,
          }}
        >
          <div style={{ display: 'flex' }}>{doorsOpen}</div>
          <div style={{ display: 'flex', opacity: 0.75 }}>{eventConfig.event.venueName}</div>
        </div>
      </div>
    ),
    size
  );
}
