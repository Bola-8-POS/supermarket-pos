/**
 * seed-demo.ts
 *
 * Provisions the Demo Edition's local baseline: the three DEMO_STAFF PIN-login
 * accounts (Ana Admin / Luis Gerente / Sofía Cajera — the single source of truth for
 * these is src/shared/lib/license/demo-accounts.ts, shared with pages/login/DemoLoginHint),
 * the standard Indian-grocery product/category fixture data (scripts/seed-dev-data.ts),
 * and a `Tienda Demo` store name.
 *
 * Idempotent — safe to re-run; only ever adds/repairs, never touches the E2E_<ROLE>
 * accounts created by setup-dev-users.ts.
 *
 * Usage: npx tsx scripts/seed-demo.ts (or `npm run seed:demo`)
 * Requires: VITE_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 *
 * WARNING: Uses service role key — do NOT import this in the renderer.
 */

/* eslint-disable */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { DEMO_STAFF } from '../src/shared/lib/license/demo-accounts';
import { ensureStaffAccount } from './lib/ensure-staff-account';

// package.json sets "type": "module", so __dirname isn't defined — derive it
// from import.meta.url instead (same pattern as setup-dev-users.ts).
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const SUPABASE_URL = process.env['VITE_SUPABASE_URL'] ?? process.env['SUPABASE_URL'];
const SUPABASE_SERVICE_ROLE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'];

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Missing SUPABASE_URL (or VITE_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY in .env.local'
  );
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) as any;

const DEMO_STORE_NAME = 'Tienda Demo';

/** Merges `{ storeName: DEMO_STORE_NAME }` onto whatever the `general` settings row already
 * holds (or an empty object on a fresh install) — never clobbers other general settings fields. */
async function upsertDemoStoreName(): Promise<void> {
  const { data: existing, error: findErr } = await db
    .from('settings')
    .select('value')
    .eq('key', 'general')
    .maybeSingle();

  if (findErr) {
    console.error('Failed to look up settings row "general":', findErr);
    process.exit(1);
  }

  const existingValue = (existing?.value ?? {}) as Record<string, unknown>;
  const value = { ...existingValue, storeName: DEMO_STORE_NAME };

  const { error: upsertErr } = await db
    .from('settings')
    .upsert({ key: 'general', value }, { onConflict: 'key' });

  if (upsertErr) {
    console.error('Failed to upsert settings row "general":', upsertErr);
    process.exit(1);
  }

  console.log(`  storeName -> "${DEMO_STORE_NAME}"`);
}

async function main() {
  console.log('Seeding Demo Edition baseline...');

  console.log('Demo staff accounts:');
  for (const staff of DEMO_STAFF) {
    // Demo staff match the app's real default locale (es-MX, D-02) — unlike the
    // E2E-only accounts in setup-dev-users.ts, which pin to en-US for English selectors.
    await ensureStaffAccount(db, staff.role, staff.name, staff.pin, 'es-MX');
  }

  console.log('Product/category fixture data (scripts/seed-dev-data.ts):');
  execSync('npx tsx scripts/seed-dev-data.ts', { stdio: 'inherit' });

  console.log('Store settings:');
  await upsertDemoStoreName();

  console.log('Demo Edition seed complete.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
