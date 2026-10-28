#!/usr/bin/env node
/**
 * Adds or updates a test livestream registration in Supabase so you can test
 * the livestream email campaigns and exclusive attendee checkout discounts.
 *
 * Usage:
 *   node scripts/add-test-livestream.mjs --email test@example.com --name "Test User" --phone 08012345678
 */

import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_BASE || !SERVICE_KEY) {
  console.error('✗ NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env.local');
  process.exit(1);
}

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]?.replace(/^--/, '');
  args[key] = process.argv[i + 1];
}

const email = (args.email || 'test@example.com').trim().toLowerCase();
const name = (args.name || 'Test Attendee').trim();
let phone = (args.phone || '08012345678').trim().replace(/\D/g, '');

if (phone.startsWith('234') && phone.length === 13) {
  phone = '+' + phone;
} else if (phone.startsWith('0') && phone.length === 11) {
  phone = '+234' + phone.slice(1);
} else if (phone.length === 10) {
  phone = '+234' + phone;
} else {
  phone = '+2348012345678';
}

console.log(`Adding test livestream registration for: ${email}...`);

async function run() {
  try {
    const res = await fetch(`${URL_BASE}/rest/v1/livestream_registrations`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({
        name,
        email,
        phone,
        attendee_type: 'student',
        marketing_opt_in: true,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase returned ${res.status}: ${text}`);
    }

    const data = await res.json();
    console.log('✓ Successfully registered for livestream:');
    console.log(data);

    // Also ensure marketing preference is set for marketing campaign testing
    await fetch(`${URL_BASE}/rest/v1/marketing_preferences`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        email,
        consented_at: new Date().toISOString(),
      }),
    });

    console.log('\nReady to test!');
    console.log(`Test URL: https://webinar.flagiq.org/checkout?code=STREAM2SUMMIT&email=${encodeURIComponent(email)}`);
  } catch (err) {
    console.error('✗ Registration failed:', err.message);
    process.exit(1);
  }
}

run();

