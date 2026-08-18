import type { Metadata } from 'next';
import { ScanLoginPage } from '@/components/pages/ScanLoginPage';

export const metadata: Metadata = {
  title: 'Staff Login',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <ScanLoginPage />;
}
