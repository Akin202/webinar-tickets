import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaffRequest } from '@/lib/api/staff-guard';
import { readCappedJson, cappedBodyError } from '@/lib/api/body-limit';
import { resolveCampaignRecipients } from '@/lib/api/campaigns';

const schema = z.object({
  kind: z.enum(['essential', 'marketing']),
  audience: z.enum(['all_paid', 'checked_in', 'not_checked_in']),
});

export async function POST(req: Request) {
  const auth = await requireStaffRequest(req, 'admin', { mutating: true, limit: 30 });
  if ('error' in auth) return auth.error;
  const body = await readCappedJson(req);
  if (!body.ok) return cappedBodyError(body, 'Invalid audience.');
  const parsed = schema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid audience.' }, { status: 400 });
  try {
    const recipients = await resolveCampaignRecipients(parsed.data.kind, parsed.data.audience);
    return NextResponse.json({ count: recipients.length });
  } catch {
    return NextResponse.json({ error: 'Could not count recipients.' }, { status: 500 });
  }
}
