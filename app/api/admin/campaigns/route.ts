import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaffRequest } from '@/lib/api/staff-guard';
import { readCappedJson, cappedBodyError } from '@/lib/api/body-limit';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { campaignFromRow, resolveCampaignRecipients } from '@/lib/api/campaigns';

const schema = z.object({
  kind: z.enum(['essential', 'marketing']),
  audience: z.enum(['all_paid', 'checked_in', 'not_checked_in']),
  subject: z.string().trim().min(1).max(150),
  message: z.string().trim().min(1).max(10000),
  // A dry run of the real thing: same campaign row, same recipient rows, same
  // batch worker, one address. /api/admin/campaigns/test proves the provider
  // call works but writes nothing, so until now the batch path could only be
  // exercised for the first time on the whole paid audience.
  testEmail: z.string().trim().email().max(254).optional(),
});

export async function GET(req: Request) {
  const auth = await requireStaffRequest(req, 'admin');
  if ('error' in auth) return auth.error;
  const { data, error } = await getSupabaseAdminClient().from('email_campaigns').select('*')
    .order('created_at', { ascending: false }).limit(20);
  if (error) return NextResponse.json({ error: 'Could not load campaign history.' }, { status: 500 });
  return NextResponse.json({ campaigns: (data ?? []).map(campaignFromRow) });
}

export async function POST(req: Request) {
  const auth = await requireStaffRequest(req, 'admin', { mutating: true, limit: 10 });
  if ('error' in auth) return auth.error;
  const body = await readCappedJson(req);
  if (!body.ok) return cappedBodyError(body, 'Invalid campaign.');
  const parsed = schema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: 'Complete all campaign fields.' }, { status: 400 });
  const supabase = getSupabaseAdminClient();
  // testEmail is a request-only field — email_campaigns has no such column, and
  // the row below is built from a spread. Pull it out before that spread rather
  // than after, so it can never reach the insert.
  const { testEmail, ...campaignFields } = parsed.data;
  try {
    // No new capability: /api/admin/campaigns/test already sends admin-authored
    // copy to an arbitrary address. This routes the same power through the batch
    // machinery instead of around it, behind the same admin guard. Marketing
    // consent is deliberately bypassed for this one typed address — a test
    // recipient is not in marketing_preferences and never would be.
    const recipients = testEmail
      ? [{ email: testEmail.toLowerCase(), buyerName: auth.staff.name }]
      : await resolveCampaignRecipients(campaignFields.kind, campaignFields.audience);
    if (recipients.length === 0) return NextResponse.json({ error: 'This audience has no eligible recipients.' }, { status: 409 });
    const { data: campaign, error } = await supabase.from('email_campaigns').insert({
      ...campaignFields, created_by: auth.staff.id, targeted_count: recipients.length,
    }).select('*').single();
    if (error || !campaign) throw error ?? new Error('Campaign insert failed');
    const { error: recipientError } = await supabase.from('email_campaign_recipients').insert(
      recipients.map((r) => ({ campaign_id: campaign.id, email: r.email, buyer_name: r.buyerName }))
    );
    if (recipientError) {
      await supabase.from('email_campaigns').delete().eq('id', campaign.id);
      throw recipientError;
    }
    await supabase.from('settings_audit').insert({ actor_id: auth.staff.id,
      field: 'email_campaign_created', old_value: null, new_value: campaign.id });
    return NextResponse.json({ campaign: campaignFromRow(campaign) }, { status: 201 });
  } catch (error) {
    console.error('campaign create failed:', error);
    return NextResponse.json({ error: 'Could not create campaign.' }, { status: 500 });
  }
}
