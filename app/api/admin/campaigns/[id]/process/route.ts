import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaffRequest } from '@/lib/api/staff-guard';
import { readCappedJson, cappedBodyError } from '@/lib/api/body-limit';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { campaignFromRow } from '@/lib/api/campaigns';
import { sendCampaignBatch, campaignConfigError } from '@/lib/campaign-email';

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({ retryFailed: z.boolean().optional().default(false) });

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireStaffRequest(req, 'admin', { mutating: true, limit: 30 });
  if ('error' in auth) return auth.error;
  const params = paramsSchema.safeParse(await context.params);
  const body = await readCappedJson(req);
  if (!body.ok) return cappedBodyError(body, 'Invalid request.');
  const parsedBody = bodySchema.safeParse(body.value);
  if (!params.success || !parsedBody.success) return NextResponse.json({ error: 'Invalid campaign.' }, { status: 400 });

  const supabase = getSupabaseAdminClient();
  const { data: campaign, error: campaignError } = await supabase.from('email_campaigns')
    .select('*').eq('id', params.data.id).maybeSingle();
  if (campaignError || !campaign) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });

  // Preflight BEFORE claiming anything. A misconfiguration used to surface as
  // a throw from inside sendCampaignBatch, after rows had already been flipped
  // to `processing` — and because the cause was an unset variable, every retry
  // failed identically and the campaign could never drain. Checking here makes
  // a misconfigured send cost nothing.
  const configError = campaignConfigError(campaign.kind);
  if (configError) {
    console.error('campaign preflight failed:', configError);
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  if (parsedBody.data.retryFailed) {
    await supabase.from('email_campaign_recipients').update({ status: 'pending', error: null })
      .eq('campaign_id', campaign.id).eq('status', 'failed');
  }

  // Claim pending rows conditionally. A second worker receives none. Rows left
  // processing by an interrupted request are resumed with the same idempotency key.
  let { data: batch } = await supabase.from('email_campaign_recipients')
    .select('id,email,buyer_name,attempt_count').eq('campaign_id', campaign.id)
    .eq('status', 'processing').order('id').limit(100);
  if (!batch?.length) {
    const pending = await supabase.from('email_campaign_recipients')
      .select('id').eq('campaign_id', campaign.id).eq('status', 'pending').order('id').limit(100);
    const ids = (pending.data ?? []).map((r) => r.id);
    if (ids.length) {
      const claimed = await supabase.from('email_campaign_recipients')
        .update({ status: 'processing' }).eq('campaign_id', campaign.id).eq('status', 'pending')
        .in('id', ids).select('id,email,buyer_name,attempt_count');
      batch = claimed.data;
    }
  }

  if (batch?.length) {
    await supabase.from('email_campaigns').update({ status: 'sending',
      started_at: campaign.started_at ?? new Date().toISOString() }).eq('id', campaign.id);
    try {
      const batchKey = `campaign-${campaign.id}-${batch[0].id}-${batch[0].attempt_count}`;
      const results = await sendCampaignBatch({ campaignId: campaign.id, batchKey,
        kind: campaign.kind, subject: campaign.subject, message: campaign.message,
        recipients: batch.map((r) => ({ id: r.id, email: r.email, buyerName: r.buyer_name })) });
      await Promise.all(results.map((result) => supabase.from('email_campaign_recipients').update({
        status: result.ok ? 'sent' : 'failed', provider_id: result.providerId ?? null,
        error: result.error ?? null, sent_at: result.ok ? new Date().toISOString() : null,
        attempt_count: (batch?.find((r) => r.id === result.id)?.attempt_count ?? 0) + 1,
      }).eq('id', result.id).eq('status', 'processing')));
    } catch (error) {
      // Leave claimed rows as processing. The next call resumes with the same
      // provider idempotency key, covering an interrupted network response.
      console.error('campaign batch interrupted:', error);
      return NextResponse.json({ error: 'Delivery was interrupted; retry to resume safely.' }, { status: 502 });
    }
  }

  const { data: recipients } = await supabase.from('email_campaign_recipients')
    .select('status').eq('campaign_id', campaign.id);
  const statuses = recipients ?? [];
  const sent = statuses.filter((r) => r.status === 'sent').length;
  const failed = statuses.filter((r) => r.status === 'failed').length;
  const unfinished = statuses.some((r) => r.status === 'pending' || r.status === 'processing');
  const status = unfinished ? 'sending' : failed === 0 ? 'completed' : sent > 0 ? 'completed_with_failures' : 'failed';
  const { data: updated, error: updateError } = await supabase.from('email_campaigns').update({
    status, sent_count: sent, failed_count: failed,
    completed_at: unfinished ? null : new Date().toISOString(),
  }).eq('id', campaign.id).select('*').single();
  if (updateError || !updated) return NextResponse.json({ error: 'Could not update campaign.' }, { status: 500 });
  if (!unfinished) await supabase.from('settings_audit').insert({ actor_id: auth.staff.id,
    field: 'email_campaign_completed', old_value: null, new_value: `${campaign.id}:${status}` });
  return NextResponse.json({ campaign: campaignFromRow(updated), hasMore: unfinished });
}
