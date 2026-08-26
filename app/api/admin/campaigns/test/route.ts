import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireStaffRequest } from '@/lib/api/staff-guard';
import { readCappedJson, cappedBodyError } from '@/lib/api/body-limit';
import { sendCampaignBatch, campaignConfigError } from '@/lib/campaign-email';

const schema = z.object({
  kind: z.enum(['essential', 'marketing']), subject: z.string().trim().min(1).max(150),
  message: z.string().trim().min(1).max(10000), email: z.string().trim().email().max(254),
});

export async function POST(req: Request) {
  const auth = await requireStaffRequest(req, 'admin', { mutating: true, limit: 10 });
  if ('error' in auth) return auth.error;
  const body = await readCappedJson(req);
  if (!body.ok) return cappedBodyError(body, 'Invalid test email.');
  const parsed = schema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: 'Complete the subject, message, and test email.' }, { status: 400 });
  // Same preflight as the batch worker, so a test send names the missing
  // variable instead of reporting a generic provider failure.
  const configError = campaignConfigError(parsed.data.kind);
  if (configError) {
    console.error('campaign test preflight failed:', configError);
    return NextResponse.json({ error: configError }, { status: 500 });
  }
  try {
    const id = randomUUID();
    const [result] = await sendCampaignBatch({ campaignId: id, batchKey: `test-${id}`,
      ...parsed.data, recipients: [{ id, email: parsed.data.email.toLowerCase(), buyerName: auth.staff.name }] });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
    return NextResponse.json({ sent: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Test send failed.' }, { status: 502 });
  }
}
