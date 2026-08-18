import type { Metadata } from 'next';
import { AdminPage } from '@/components/pages/AdminPage';

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

// TODO(handoff): unauthenticated. Session 2 adds middleware in front of
// /admin and /scan, redirecting to login.
export default function Page() {
  return <AdminPage />;
}
