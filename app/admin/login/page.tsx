import type { Metadata } from 'next';
import { AdminLoginPage } from '@/components/pages/AdminLoginPage';

export const metadata: Metadata = {
  title: 'Admin Sign-In',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminLoginPage />;
}
