import type { Metadata } from 'next';
import { AdminPage } from '@/components/pages/AdminPage';

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

// Guarded by middleware.ts (session required) and by requireStaff on every
// /api/admin/* route (admin role required).
export default function Page() {
  return <AdminPage />;
}
