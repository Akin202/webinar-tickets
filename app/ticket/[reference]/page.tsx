import type { Metadata } from 'next';
import { TicketPage } from '@/components/pages/TicketPage';

/**
 * noindex: a ticket reference is a bearer token. It must never appear in
 * a search index.
 */
export const metadata: Metadata = {
  title: 'Your Ticket',
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  return <TicketPage reference={reference} />;
}
