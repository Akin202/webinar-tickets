import 'server-only';

import { eventConfig, doorsOpenIso } from '@/config/event.config';
import { getSiteUrl } from '@/lib/site-url';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Ticket delivery by email — the backup channel.
 *
 * WhatsApp is how the link actually travels and the pass itself is saved from
 * the ticket page, so this exists for the case where someone loses the tab,
 * changes phone, or simply never saved anything. It carries a link, never the
 * QR: an emailed image is a bearer credential sitting in an inbox forever,
 * and the ticket page can at least show current status.
 *
 * Plain fetch rather than the Resend SDK. One POST does not justify a
 * dependency, and the failure modes are easier to see when the call is right
 * here.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export type EmailResult = { ok: true; id: string } | { ok: false; reason: string };

interface TicketEmailInput {
  reference: string;
  buyerName: string;
  buyerEmail: string;
  quantity: number;
}

/** Email bodies are HTML. Buyer names are attacker-supplied free text. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function siteUrl(): string {
  return getSiteUrl();
}

function doorsOpenLine(): string {
  const date = new Date(doorsOpenIso).toLocaleDateString('en-NG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Africa/Lagos',
  });
  return `${date}, doors ${eventConfig.event.doorsOpen}`;
}

/**
 * Table layout with inline styles, no images, no web fonts, under 20KB.
 * Gmail on Android is the renderer that matters here and it strips <style>
 * blocks, external CSS and most modern layout.
 */
function buildHtml(input: TicketEmailInput, ticketUrl: string): string {
  const name = escapeHtml(input.buyerName.split(' ')[0] || 'there');
  const passes = input.quantity === 1 ? 'pass' : 'passes';

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f5f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">

  <tr><td style="background:#0b0c10;padding:28px 24px;">
    <div style="color:${eventConfig.brand.primary};font-size:30px;font-weight:bold;letter-spacing:-0.5px;">
      ${escapeHtml(eventConfig.event.tagline)}
    </div>
    <div style="color:#cbd5e1;font-size:14px;padding-top:6px;">
      ${escapeHtml(eventConfig.event.name)}
    </div>
  </td></tr>

  <tr><td style="padding:28px 24px 8px;">
    <p style="margin:0 0 14px;font-size:16px;color:#0b0c10;">Hi ${name},</p>
    <p style="margin:0 0 14px;font-size:15px;color:#3f4654;line-height:1.6;">
      Your payment is confirmed and your ${input.quantity} ${passes} ${
        input.quantity === 1 ? 'is' : 'are'
      } ready.
    </p>
    <p style="margin:0 0 22px;font-size:15px;color:#3f4654;line-height:1.6;">
      Open the link below and save your pass to your phone before the day —
      venue wifi is unreliable, so do not plan on loading it at the door.
    </p>
  </td></tr>

  <tr><td align="center" style="padding:0 24px 24px;">
    <a href="${ticketUrl}" style="display:inline-block;background:#0b0c10;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:15px 34px;border-radius:8px;">
      Open your pass
    </a>
    <p style="margin:14px 0 0;font-size:12px;color:#6b7280;word-break:break-all;">
      Or paste this into your browser:<br>${ticketUrl}
    </p>
  </td></tr>

  <tr><td style="padding:0 24px 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fb;border-radius:8px;">
      <tr><td style="padding:16px 18px;font-size:14px;color:#3f4654;line-height:1.7;">
        <strong style="color:#0b0c10;">Reference</strong><br>${escapeHtml(input.reference)}<br><br>
        <strong style="color:#0b0c10;">When</strong><br>${escapeHtml(doorsOpenLine())}<br><br>
        <strong style="color:#0b0c10;">Where</strong><br>${escapeHtml(eventConfig.event.venueName)}<br>
        ${escapeHtml(eventConfig.event.venueAddress)}
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:0 24px 28px;">
    <p style="margin:0;font-size:13px;color:#9a3412;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px 14px;line-height:1.6;">
      <strong>One entry only.</strong> Each code works once — the first scan admits,
      and a forwarded copy is refused. Door staff may ask for the last four digits
      of the phone number you bought with.
    </p>
  </td></tr>

  <tr><td style="background:#f8f9fb;padding:18px 24px;font-size:12px;color:#6b7280;line-height:1.6;">
    Questions? Message the organisers on WhatsApp:
    <a href="https://wa.me/${eventConfig.support.whatsappNumber.replace(/\D/g, '')}" style="color:#0b0c10;">
      ${escapeHtml(eventConfig.support.whatsappNumber)}
    </a>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

function buildText(input: TicketEmailInput, ticketUrl: string): string {
  return [
    `${eventConfig.event.tagline} — ${eventConfig.event.name}`,
    '',
    `Hi ${input.buyerName.split(' ')[0] || 'there'},`,
    '',
    `Your payment is confirmed. ${input.quantity} pass(es) are ready.`,
    '',
    `Open your pass: ${ticketUrl}`,
    '',
    `Reference: ${input.reference}`,
    `When: ${doorsOpenLine()}`,
    `Where: ${eventConfig.event.venueName}, ${eventConfig.event.venueAddress}`,
    '',
    'One entry only. Each code works once — the first scan admits, and a',
    'forwarded copy is refused. Door staff may ask for the last four digits',
    'of the phone number you bought with.',
    '',
    `Help on WhatsApp: ${eventConfig.support.whatsappNumber}`,
  ].join('\n');
}

/** Posts one email. Never throws — the caller decides what a failure means. */
export async function sendTicketEmail(input: TicketEmailInput): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    // Loud, because a silently disabled delivery channel is how buyers end up
    // with nothing and nobody notices until the door.
    console.error('email: RESEND_API_KEY / RESEND_FROM_EMAIL not configured — nothing sent');
    return { ok: false, reason: 'Email is not configured on this deployment.' };
  }

  const ticketUrl = `${siteUrl()}/ticket/${encodeURIComponent(input.reference)}`;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.buyerEmail],
        subject: `Your ${eventConfig.event.tagline} pass — ${input.reference}`,
        html: buildHtml(input, ticketUrl),
        text: buildText(input, ticketUrl),
      }),
    });

    const body = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (!res.ok) {
      const reason = body?.message ?? `Resend returned ${res.status}`;
      console.error(`email: send to ${input.buyerEmail} failed — ${reason}`);
      return { ok: false, reason };
    }
    return { ok: true, id: body?.id ?? 'sent' };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Network error contacting Resend';
    console.error(`email: send to ${input.buyerEmail} threw — ${reason}`);
    return { ok: false, reason };
  }
}

/**
 * Looks the order up and sends. One place that knows how an order becomes an
 * email, so the webhook, the lazy-verify path and the admin resend button
 * cannot drift apart.
 *
 * Refuses anything not actually paid: an email saying "your payment is
 * confirmed" for an order that is not is worse than no email at all.
 */
export async function deliverTicketEmail(reference: string): Promise<EmailResult> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('orders')
    .select('reference, buyer_name, buyer_email, quantity, status')
    .eq('reference', reference)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, reason: 'Order not found.' };
  }
  if (data.status !== 'paid') {
    return { ok: false, reason: `Order is ${data.status}, not paid — nothing sent.` };
  }
  // Complimentary tickets are minted against a placeholder address so they
  // fight for capacity through the same path as a purchase. There is no
  // inbox behind it.
  if (data.buyer_email.endsWith('@invalid.local')) {
    return { ok: false, reason: 'Complimentary ticket — no real email address on file.' };
  }

  return sendTicketEmail({
    reference: data.reference,
    buyerName: data.buyer_name,
    buyerEmail: data.buyer_email,
    quantity: data.quantity,
  });
}
