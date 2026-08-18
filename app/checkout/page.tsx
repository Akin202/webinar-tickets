import type { Metadata } from 'next';
import { CheckoutPage } from '@/components/pages/CheckoutPage';

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <CheckoutPage />;
}
