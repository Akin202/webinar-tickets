import { ImageResponse } from 'next/og';
import { eventConfig } from '@/config/event.config';

export const runtime = 'edge';

// Image metadata
export const size = {
  width: 32,
  height: 32,
};
export const contentType = 'image/png';

// Image generation for URL bar favicon
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 20,
          background: eventConfig.brand.ink,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 8,
          border: `2px solid ${eventConfig.brand.primary}`,
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke={eventConfig.brand.primary}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon
            points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"
            fill={eventConfig.brand.primary}
          />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}
