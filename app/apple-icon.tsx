import { ImageResponse } from 'next/og';
import { eventConfig } from '@/config/event.config';

export const runtime = 'edge';

export const size = {
  width: 180,
  height: 180,
};
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#060709',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 36,
          border: `6px solid ${eventConfig.brand.primary}`,
        }}
      >
        <svg
          width="100"
          height="100"
          viewBox="0 0 24 24"
          fill="none"
          stroke={eventConfig.brand.primary}
          strokeWidth="2"
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
