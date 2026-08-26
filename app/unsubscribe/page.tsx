import type { Metadata } from 'next';
import { UnsubscribePage } from '@/components/pages/UnsubscribePage';

export const metadata: Metadata = { title: 'Email preferences', robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  return <UnsubscribePage token={token} />;
}
