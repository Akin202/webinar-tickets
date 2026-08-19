import type { Metadata } from 'next';
import { ScanPage } from '@/components/pages/ScanPage';

export const metadata: Metadata = {
  title: 'Door Scanner',
  robots: { index: false, follow: false },
};

// Guarded by middleware.ts; the door RPCs additionally check the caller's
// staff_users role inside the SECURITY DEFINER functions.
export default function Page() {
  return <ScanPage />;
}
