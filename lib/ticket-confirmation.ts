import 'server-only';

import QRCode from 'qrcode';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { eventConfig } from '@/config/event.config';
import { getSiteUrl } from '@/lib/site-url';

export type ConfirmationResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; reason: string };

export interface TicketConfirmationPayload {
  reference: string;
  customer_name: string;
  customer_email: string;
  event_name: string;
  event_date: string;
  event_date_display: string;
  event_time: string;
  event_venue: string;
  amount: string;
  currency: string;
  ticket_page_url: string;
  tickets: Array<{
    ticket_code: string;
    ticket_type: string;
    holder_name: string;
    qr_png_base64: string;
  }>;
}

/**
 * Dispatches ticket confirmation to the n8n webhook for a paid order.
 *
 * Idempotent via an atomic claim on public.orders.confirmation_email_sent_at:
 *   UPDATE orders SET confirmation_email_sent_at = now()
 *   WHERE id = $1 AND confirmation_email_sent_at IS NULL RETURNING ...
 *
 * Only sends if a row was claimed. If n8n fails or times out, reverts the
 * timestamp back to NULL so the cron sweep or retry can pick it up.
 * Never logs bearer credentials.
 */
export async function sendTicketConfirmation(
  orderId: string,
  client?: SupabaseClient
): Promise<ConfirmationResult> {
  const supabase = client ?? getSupabaseAdminClient();

  // Atomic claim: only one process gets to send the confirmation.
  const { data: order, error: claimError } = await supabase
    .from('orders')
    .update({ confirmation_email_sent_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('status', 'paid')
    .is('confirmation_email_sent_at', null)
    .select('id, reference, buyer_name, buyer_email, attendee_type, total_kobo, status')
    .maybeSingle();

  if (claimError) {
    console.error('ticket confirmation: claim query errored', claimError);
    return { ok: false, reason: 'Database error claiming confirmation' };
  }

  // Not our claim (already sent, or order not found, or not paid)
  if (!order) {
    return { ok: true, skipped: true };
  }

  try {
    const webhookUrl = process.env.N8N_TICKET_WEBHOOK_URL;
    if (!webhookUrl) {
      await supabase
        .from('orders')
        .update({ confirmation_email_sent_at: null })
        .eq('id', order.id);
      console.warn(`ticket confirmation: N8N_TICKET_WEBHOOK_URL not configured for order ${order.reference}`);
      return { ok: false, reason: 'N8N_TICKET_WEBHOOK_URL not configured' };
    }

    const { data: tickets, error: ticketsError } = await supabase
      .from('tickets')
      .select('code, holder_name, status')
      .eq('order_id', order.id)
      .neq('status', 'void')
      .order('issued_at', { ascending: true });

    if (ticketsError || !tickets || tickets.length === 0) {
      await supabase
        .from('orders')
        .update({ confirmation_email_sent_at: null })
        .eq('id', order.id);
      console.error(`ticket confirmation: tickets lookup failed for order ${order.reference}`, ticketsError);
      return { ok: false, reason: 'Tickets not found' };
    }

    // Render QR codes server-side with qrcode package
    // Error correction level 'H', margin 4, black on white, plain ticket code
    const ticketsPayload = await Promise.all(
      tickets.map(async (t) => {
        const qrPngBuffer = await QRCode.toBuffer(t.code, {
          type: 'png',
          errorCorrectionLevel: 'H',
          margin: 4,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        });

        return {
          ticket_code: t.code,
          ticket_type: order.attendee_type ?? 'complimentary',
          holder_name: t.holder_name,
          qr_png_base64: qrPngBuffer.toString('base64'),
        };
      })
    );

    // Format display date: e.g. "Saturday, 31 October 2026"
    const eventDateObj = new Date(`${eventConfig.event.date}T00:00:00${eventConfig.event.utcOffset}`);
    const eventDateDisplay = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Africa/Lagos',
    }).format(eventDateObj);

    // Event time
    const eventTime = `${eventConfig.event.doorsOpen} - ${eventConfig.event.endsAt}`;

    // Event venue (name + address)
    const eventVenue = eventConfig.event.venueAddress.startsWith(eventConfig.event.venueName)
      ? eventConfig.event.venueAddress
      : `${eventConfig.event.venueName}, ${eventConfig.event.venueAddress}`;

    // Amount in naira as a string ("Complimentary" for comp orders)
    const amount = order.total_kobo === 0
      ? 'Complimentary'
      : (order.total_kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 0 });

    const ticketPageUrl = `${getSiteUrl()}/ticket/${encodeURIComponent(order.reference)}`;

    const payload: TicketConfirmationPayload = {
      reference: order.reference,
      customer_name: order.buyer_name,
      customer_email: order.buyer_email,
      event_name: eventConfig.event.name,
      event_date: eventConfig.event.date,
      event_date_display: eventDateDisplay,
      event_time: eventTime,
      event_venue: eventVenue,
      amount,
      currency: 'NGN',
      ticket_page_url: ticketPageUrl,
      tickets: ticketsPayload,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const webhookSecret = process.env.N8N_WEBHOOK_SECRET;
    if (webhookSecret) {
      headers['X-Webhook-Secret'] = webhookSecret;
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`n8n webhook responded with status ${response.status}`);
    }

    return { ok: true };
  } catch (err) {
    // If the n8n call fails, set the column back to NULL and log the error (no bearer codes in logs)
    await supabase
      .from('orders')
      .update({ confirmation_email_sent_at: null })
      .eq('id', order.id);

    const reason = err instanceof Error ? err.message : String(err);
    console.error(`ticket confirmation: dispatch failed for order ${order.reference}:`, reason);
    return { ok: false, reason };
  }
}
