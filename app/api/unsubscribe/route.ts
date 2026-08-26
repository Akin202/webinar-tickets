import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readCappedJson, cappedBodyError } from '@/lib/api/body-limit';
import { emailFromUnsubscribeToken } from '@/lib/campaign-email';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

const schema = z.object({ token: z.string().min(20).max(1000) });

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token');
  const email = token ? emailFromUnsubscribeToken(token) : null;
  if (!email) return NextResponse.json({ error: 'This unsubscribe link is invalid.' }, { status: 400 });
  const now = new Date().toISOString();
  const { error } = await getSupabaseAdminClient().from('marketing_preferences').upsert({
    email, unsubscribed_at: now, updated_at: now,
  }, { onConflict: 'email' });
  if (error) return NextResponse.json({ error: 'Could not save your preference.' }, { status: 500 });
  return NextResponse.json({ unsubscribed: true });
}

export async function POST(req: Request) {
  const contentType = req.headers.get('content-type') ?? '';
  let token: string | null = null;
  if (contentType.includes('application/json')) {
    const body = await readCappedJson(req);
    if (!body.ok) return cappedBodyError(body, 'Invalid unsubscribe request.');
    const parsed = schema.safeParse(body.value);
    token = parsed.success ? parsed.data.token : null;
  } else {
    token = new URL(req.url).searchParams.get('token');
  }
  const email = token ? emailFromUnsubscribeToken(token) : null;
  if (!email) return NextResponse.json({ error: 'This unsubscribe link is invalid.' }, { status: 400 });
  const now = new Date().toISOString();
  const { error } = await getSupabaseAdminClient().from('marketing_preferences').upsert({
    email, unsubscribed_at: now, updated_at: now,
  }, { onConflict: 'email' });
  if (error) return NextResponse.json({ error: 'Could not save your preference.' }, { status: 500 });
  return new NextResponse(contentType.includes('application/json') ? JSON.stringify({ unsubscribed: true }) : null,
    { status: 200, headers: contentType.includes('application/json') ? { 'Content-Type': 'application/json' } : undefined });
}

