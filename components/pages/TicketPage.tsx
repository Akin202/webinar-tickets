'use client';

import React, { useState, useEffect } from 'react';

import Link from 'next/link';
import { ArrowLeft, Ticket as TicketIcon, Loader2, AlertCircle } from 'lucide-react';
import {
  getOrderByReference,
  listOrders,
} from '@/lib/data-access';
import { IS_DEV } from '@/lib/dev-mode';
import { Order, Ticket, TicketStatus } from '@/types/ticketing';
import { TicketCard } from '@/components/TicketCard';
import { useDevState } from '@/components/dev/DevStateProvider';

interface TicketPageProps {
  /** Route segment, resolved by the server component and passed down. */
  reference?: string;
}

export const TicketPage: React.FC<TicketPageProps> = ({ reference }) => {
  const { forcedTicketStatus: forcedStatus } = useDevState();
  const [order, setOrder] = useState<Order | null>(null);
  const [ticketsList, setTicketsList] = useState<Ticket[]>([]);
  const [selectedTicketIndex, setSelectedTicketIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      try {
        let result: { order: Order; tickets: Ticket[] } | null = null;
        if (reference) {
          result = await getOrderByReference(reference);
        }
        // DEV ONLY: with no reference, preview the most recent order.
        // listOrders is admin-only in production — an anonymous visitor
        // without a reference gets not-found, never someone else's ticket.
        if (!result && IS_DEV) {
          const { orders } = await listOrders({ limit: 1 });
          if (orders[0]) {
            result = await getOrderByReference(orders[0].reference);
          }
        }

        if (result && isMounted) {
          setOrder(result.order);
          setTicketsList(result.tickets);
        }
      } catch (err) {
        console.error('Error loading ticket:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [reference]);

  const handleUpdateAttendeeName = (ticketId: string, newName: string) => {
    setTicketsList((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, holderName: newName } : t))
    );
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-brand-surface text-brand-text flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-brand-primary animate-spin" />
          <p className="text-xs font-mono text-brand-muted">Fetching Ticket Details...</p>
        </div>
      </main>
    );
  }

  if (!order || ticketsList.length === 0) {
    return (
      <main className="min-h-screen bg-brand-surface text-brand-text py-12 px-4 sm:px-6">
        <div className="max-w-md mx-auto text-center space-y-4">
          <div className="p-4 rounded-2xl bg-brand-urgent-bg text-brand-urgent inline-block">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold">Ticket Not Found</h1>
          <p className="text-sm text-brand-muted">
            We could not find an issued ticket matching reference "{reference}".
          </p>
          <Link
            href="/"
            className="inline-flex min-h-[44px] px-4 py-2 rounded-xl bg-brand-primary text-brand-surface font-bold text-sm items-center justify-center"
          >
            Return to Event Page
          </Link>
        </div>
      </main>
    );
  }

  const activeTicket = ticketsList[selectedTicketIndex] || ticketsList[0];

  return (
    <main className="min-h-screen bg-brand-surface text-brand-text py-8 sm:py-12 px-4 sm:px-6">
      <div className="max-w-xl mx-auto space-y-6">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            id="ticket-back-link"
            className="inline-flex items-center gap-2 min-h-[48px] px-3 py-2 text-sm font-semibold text-brand-muted hover:text-brand-text transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Event</span>
          </Link>
          <span className="text-xs font-mono font-bold text-brand-primary bg-brand-subtle px-2.5 py-1 rounded-md border border-brand-border">
            {order.reference}
          </span>
        </div>

        {/* Multi-ticket selector if order has more than 1 ticket */}
        {ticketsList.length > 1 && (
          <div className="p-3 rounded-2xl bg-brand-card border border-brand-border space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-muted">
                Order Passes ({ticketsList.length})
              </span>
              <span className="text-xs text-brand-dim">
                Select pass to view QR
              </span>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {ticketsList.map((t, idx) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTicketIndex(idx)}
                  className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-all ${
                    selectedTicketIndex === idx
                      ? 'bg-brand-primary text-brand-surface shadow-md'
                      : 'bg-brand-subtle text-brand-muted hover:text-brand-text border border-brand-border'
                  }`}
                >
                  <TicketIcon className="w-3.5 h-3.5" />
                  <span>Pass #{idx + 1}: {t.holderName.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Ticket Card Component */}
        <TicketCard
          ticket={activeTicket}
          forcedStatus={forcedStatus}
          onUpdateAttendeeName={handleUpdateAttendeeName}
        />

        {/* Order Meta Footer */}
        <div className="text-center space-y-1 text-xs text-brand-dim pt-4">
          <p>Purchased by <span className="text-brand-muted font-medium">{order.buyerName}</span> ({order.buyerEmail})</p>
          <p>Order Reference: <span className="font-mono text-brand-muted">{order.reference}</span></p>
        </div>
      </div>
    </main>
  );
};
