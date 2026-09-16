import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { eventConfig } from '@/config/event.config';
import { getSiteUrl } from '@/lib/site-url';
import type { EmailCampaignKind } from '@/types/ticketing';

const RESEND_BATCH_ENDPOINT = 'https://api.resend.com/emails/batch';

export function escapeEmailHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function secret(): string {
  const value = process.env.EMAIL_UNSUBSCRIBE_SECRET;
  if (!value) throw new Error('EMAIL_UNSUBSCRIBE_SECRET is not configured.');
  return value;
}

/**
 * Everything a send needs, checked BEFORE any recipient row is claimed.
 *
 * Without this the throw from secret() lands after rows have been flipped to
 * `processing`, and since the missing variable is still missing on every
 * retry, a marketing campaign wedges permanently. Returns a human-readable
 * reason, or null when the send may proceed. Admin-only surface, so naming the
 * missing variable is a help rather than a leak.
 */
export function campaignConfigError(kind: EmailCampaignKind): string | null {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    return 'Email is not configured: RESEND_API_KEY and RESEND_FROM_EMAIL must both be set.';
  }
  if (kind === 'marketing' && !process.env.EMAIL_UNSUBSCRIBE_SECRET) {
    return 'EMAIL_UNSUBSCRIBE_SECRET is not set, and marketing emails need it to build unsubscribe links.';
  }
  return null;
}

export function unsubscribeToken(email: string): string {
  const normalized = email.trim().toLowerCase();
  const payload = Buffer.from(normalized).toString('base64url');
  const signature = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function emailFromUnsubscribeToken(token: string): string | null {
  const [payload, supplied] = token.split('.');
  if (!payload || !supplied) return null;
  const expected = createHmac('sha256', secret()).update(payload).digest();
  let actual: Buffer;
  try { actual = Buffer.from(supplied, 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const email = Buffer.from(payload, 'base64url').toString('utf8').trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  } catch { return null; }
}

export function campaignContent(input: {
  kind: EmailCampaignKind;
  subject: string;
  message: string;
  buyerName: string;
  email: string;
}) {
  const firstName = escapeEmailHtml(input.buyerName.trim().split(/\s+/)[0] || 'there');
  const paragraphs = input.message.split(/\n{2,}/).map((part) =>
    `<p style="margin:0 0 16px;line-height:1.65">${escapeEmailHtml(part).replace(/\n/g, '<br>')}</p>`
  ).join('');
  const site = getSiteUrl();
  const unsub = input.kind === 'marketing'
    ? `${site}/unsubscribe?token=${encodeURIComponent(unsubscribeToken(input.email))}` : null;
  const footer = unsub
    ? `<p style="margin:24px 0 0;font-size:12px;color:#6b7280">You received this because you opted in at checkout. <a href="${unsub}">Unsubscribe</a>.</p>`
    : `<p style="margin:24px 0 0;font-size:12px;color:#6b7280">This essential update relates to your purchased ${escapeEmailHtml(eventConfig.event.name)} ticket.</p>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f7;padding:24px 12px"><div style="max-width:560px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;font-family:Arial,sans-serif"><div style="background:#0b0c10;color:${eventConfig.brand.primary};padding:24px;font-size:26px;font-weight:bold">${escapeEmailHtml(eventConfig.event.tagline)}</div><div style="padding:24px;color:#303744"><p style="margin:0 0 16px">Hi ${firstName},</p>${paragraphs}${footer}</div></div></body></html>`;
  const text = `Hi ${input.buyerName.trim().split(/\s+/)[0] || 'there'},\n\n${input.message}${unsub ? `\n\nUnsubscribe: ${unsub}` : ''}`;
  return { html, text, unsubscribeUrl: unsub };
}

export async function sendCampaignBatch(input: {
  campaignId: string;
  batchKey: string;
  kind: EmailCampaignKind;
  subject: string;
  message: string;
  recipients: Array<{ id: string; email: string; buyerName: string }>;
}): Promise<Array<{ id: string; ok: boolean; providerId?: string; error?: string }>> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error('Resend is not configured.');
  const messages = input.recipients.map((recipient) => {
    const content = campaignContent({ ...input, ...recipient });
    return {
      from, to: [recipient.email], subject: input.subject, html: content.html, text: content.text,
      headers: content.unsubscribeUrl ? {
        'List-Unsubscribe': `<${content.unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      } : undefined,
      tags: [{ name: 'campaign_id', value: input.campaignId.replace(/-/g, '_') }],
    };
  });
  const res = await fetch(RESEND_BATCH_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json',
      'Idempotency-Key': input.batchKey },
    body: JSON.stringify(messages),
  });
  const body = await res.json().catch(() => null) as { data?: Array<{ id: string }>; message?: string } | Array<{ id: string }> | null;
  if (!res.ok) {
    const reason = body && !Array.isArray(body) && body.message ? body.message : `Resend returned ${res.status}`;
    return input.recipients.map((r) => ({ id: r.id, ok: false, error: reason }));
  }
  const ids = Array.isArray(body) ? body : body?.data ?? [];
  return input.recipients.map((r, index) => ({ id: r.id, ok: Boolean(ids[index]?.id),
    providerId: ids[index]?.id, error: ids[index]?.id ? undefined : 'Provider returned no message id.' }));
}
