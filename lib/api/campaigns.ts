import 'server-only';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import type { EmailCampaign, EmailCampaignAudience, EmailCampaignKind } from '@/types/ticketing';

export interface CampaignRecipient { email: string; buyerName: string }

/**
 * Everyone registered for the free livestream. Marketing consent is honoured
 * exactly as it is for buyers: an essential send (the stream link) reaches
 * everyone, a marketing send only those who ticked the box and have not
 * unsubscribed since.
 */
async function resolveLivestreamRecipients(
  kind: EmailCampaignKind
): Promise<CampaignRecipient[]> {
  const supabase = getSupabaseAdminClient();
  const { data: registrations, error } = await supabase
    .from('livestream_registrations')
    .select('email,name,created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const { data: preferences, error: preferenceError } = kind === 'marketing'
    ? await supabase.from('marketing_preferences').select('email,consented_at,unsubscribed_at')
    : { data: [], error: null };
  if (preferenceError) throw preferenceError;
  const allowed = new Set((preferences ?? []).filter((p) => p.consented_at && !p.unsubscribed_at)
    .map((p) => p.email));

  const unique = new Map<string, CampaignRecipient>();
  for (const registration of registrations ?? []) {
    const email = registration.email.trim().toLowerCase();
    if (!email || email.endsWith('@invalid.local')) continue;
    if (kind === 'marketing' && !allowed.has(email)) continue;
    if (!unique.has(email)) unique.set(email, { email, buyerName: registration.name });
  }
  return [...unique.values()];
}

export async function resolveCampaignRecipients(
  kind: EmailCampaignKind,
  audience: EmailCampaignAudience
): Promise<CampaignRecipient[]> {
  const supabase = getSupabaseAdminClient();

  // The livestream audience lives in its own table and shares no row with
  // orders, so it resolves on a separate path rather than by filtering one.
  // This is how the stream link reaches the people watching online and nobody
  // who paid for a seat.
  if (audience === 'livestream') {
    return resolveLivestreamRecipients(kind);
  }

  const { data: orders, error } = await supabase.from('orders')
    .select('buyer_email,buyer_name,paid_at,tickets(status)')
    .eq('status', 'paid').order('paid_at', { ascending: false });
  if (error) throw error;

  const { data: preferences, error: preferenceError } = kind === 'marketing'
    ? await supabase.from('marketing_preferences').select('email,consented_at,unsubscribed_at')
    : { data: [], error: null };
  if (preferenceError) throw preferenceError;
  const allowed = new Set((preferences ?? []).filter((p) => p.consented_at && !p.unsubscribed_at)
    .map((p) => p.email));

  const unique = new Map<string, CampaignRecipient>();
  for (const order of orders ?? []) {
    const email = order.buyer_email.trim().toLowerCase();
    if (!email || email.endsWith('@invalid.local')) continue;
    if (kind === 'marketing' && !allowed.has(email)) continue;
    const tickets = (order.tickets ?? []) as Array<{ status: string }>;
    const hasCheckedIn = tickets.some((ticket) => ticket.status === 'checked_in');
    if (audience === 'checked_in' && !hasCheckedIn) continue;
    if (audience === 'not_checked_in' && hasCheckedIn) continue;
    if (!unique.has(email)) unique.set(email, { email, buyerName: order.buyer_name });
  }
  return [...unique.values()];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function campaignFromRow(row: any): EmailCampaign {
  return {
    id: row.id, kind: row.kind, audience: row.audience, subject: row.subject,
    message: row.message, status: row.status, targetedCount: row.targeted_count,
    sentCount: row.sent_count, failedCount: row.failed_count, createdAt: row.created_at,
    startedAt: row.started_at, completedAt: row.completed_at,
  };
}
