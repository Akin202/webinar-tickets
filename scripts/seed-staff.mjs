#!/usr/bin/env node
/**
 * Creates a staff account: Supabase Auth user + staff_users row, in one go.
 *
 *   node scripts/seed-staff.mjs --email admin@example.com --name "Ada" --role admin --password "..."
 *   node scripts/seed-staff.mjs --email scanner@example.com --name "Door Terminal" --role door --password 483920
 *
 * The door terminal's password IS the gate PIN (6 digits — Supabase's
 * password floor). Its email must match eventConfig.staff.scannerEmail.
 *
 * Zero-dependency: hits the Supabase Admin REST API directly with the
 * service-role key from .env.local. Never commit real PINs anywhere.
 * Idempotent-ish: re-running for an existing email updates the password and
 * upserts the staff row instead of failing.
 */
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);

const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !SERVICE_KEY) {
  console.error('✗ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env.local');
  process.exit(1);
}

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]?.replace(/^--/, '');
  args[key] = process.argv[i + 1];
}
const { email, name, role, password } = args;

if (!email || !name || !role || !password) {
  console.error('Usage: node scripts/seed-staff.mjs --email <e> --name <n> --role admin|door --password <p>');
  process.exit(1);
}
if (!['admin', 'door'].includes(role)) {
  console.error(`✗ role must be admin or door, got "${role}"`);
  process.exit(1);
}
if (password.length < 6) {
  console.error('✗ password/PIN must be at least 6 characters (Supabase minimum)');
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function findUserByEmail(target) {
  const res = await fetch(
    `${URL_BASE}/auth/v1/admin/users?page=1&per_page=1000`,
    { headers }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(`list users failed: ${JSON.stringify(json).slice(0, 200)}`);
  return (json.users ?? []).find((u) => u.email?.toLowerCase() === target.toLowerCase()) ?? null;
}

let user = await findUserByEmail(email);

if (user) {
  console.log(`• auth user exists (${user.id}) — updating password`);
  const res = await fetch(`${URL_BASE}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ password, email_confirm: true }),
  });
  if (!res.ok) {
    console.error(`✗ password update failed: ${JSON.stringify(await res.json()).slice(0, 200)}`);
    process.exit(1);
  }
} else {
  const res = await fetch(`${URL_BASE}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const json = await res.json();
  if (!res.ok) {
    console.error(`✗ user creation failed: ${JSON.stringify(json).slice(0, 200)}`);
    process.exit(1);
  }
  user = json;
  console.log(`✓ auth user created (${user.id})`);
}

// Upsert the authorisation row — the actual source of truth for role.
const upsert = await fetch(`${URL_BASE}/rest/v1/staff_users?on_conflict=id`, {
  method: 'POST',
  headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
  body: JSON.stringify({ id: user.id, name, role }),
});
const upsertJson = await upsert.json();
if (!upsert.ok) {
  console.error(`✗ staff_users upsert failed: ${JSON.stringify(upsertJson).slice(0, 200)}`);
  process.exit(1);
}

console.log(`✓ staff row: ${name} <${email}> as ${role}`);
console.log(role === 'door'
  ? '  Gate PIN set. Test it at /scan/login before event night.'
  : '  Admin credentials set. Test them at /admin/login.');
