import type { Metadata } from 'next';
import { ScanPage } from '@/components/pages/ScanPage';

export const metadata: Metadata = {
  title: 'Door Scanner',
  robots: { index: false, follow: false },
};

// TODO(handoff): unauthenticated. Session 2 adds middleware.
export default function Page() {
  return <ScanPage />;
}
