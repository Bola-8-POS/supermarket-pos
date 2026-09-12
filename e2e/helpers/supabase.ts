import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function getUrl(): string {
  const u = process.env.VITE_SUPABASE_URL;
  if (!u) throw new Error('Missing VITE_SUPABASE_URL');
  return u;
}

function getServiceKey(): string {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  return k;
}

export function getServiceClient(): SupabaseClient {
  return createClient(getUrl(), getServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Bumps `version` per-row while applying `patch` to every row in `rows`. tabs
 * and caja_sessions both have a bump_version_on_update trigger
 * (Phase 15) that rejects any UPDATE not explicitly advancing `version` by 1 —
 * a single bulk `.update({...})` call can't express `version = version + 1`
 * per row (that needs a raw SQL expression, not a PostgREST literal), so each
 * matching row is updated individually with its own current version.
 */
async function bumpVersionedRows(
  admin: SupabaseClient,
  table: 'tabs' | 'caja_sessions',
  rows: { id: string; version: number }[],
  patch: Record<string, unknown>
): Promise<void> {
  for (const row of rows) {
    await admin
      .from(table)
      .update({ ...patch, version: row.version + 1 })
      .eq('id', row.id)
      .eq('version', row.version);
  }
}

/**
 * Best-effort reset: void open tabs, close caja, and end open shifts.
 */
export async function resetTestState(): Promise<void> {
  const admin = getServiceClient();

  const { data: openTabs } = await admin
    .from('tabs')
    .select('id, version')
    .eq('status', 'open')
    .eq('is_deleted', false);
  await bumpVersionedRows(admin, 'tabs', (openTabs ?? []) as { id: string; version: number }[], {
    status: 'voided',
    closed_at: new Date().toISOString(),
  });

  // Bulk-close ALL open caja sessions to avoid duplicate-key errors on next openCaja()
  const { data: mgrForReset } = await admin.from('profiles').select('id').eq('role', 'manager').limit(1).maybeSingle();
  const { data: openCajaSessions } = await admin.from('caja_sessions').select('id, version').eq('status', 'open');
  await bumpVersionedRows(
    admin,
    'caja_sessions',
    (openCajaSessions ?? []) as { id: string; version: number }[],
    {
      status: 'closed',
      closed_at: new Date().toISOString(),
      closed_by: mgrForReset?.id ?? null,
      closing_cash: 0,
    }
  );

  await admin.from('shifts').update({ clock_out: new Date().toISOString() }).is('clock_out', null);

  // PostgREST rejects a bulk UPDATE with no WHERE clause ("UPDATE requires a
  // WHERE clause", 21000) — `.not('id', 'is', null)` is an always-true filter
  // (id is the PK, never null) that satisfies the safety check while still
  // matching every row, restoring the "reset every row" intent these two
  // calls always had. Before this fix both calls silently no-op'd on every
  // test run (the error was never read from the query result), so inventory
  // and sold_by_weight only ever monotonically drifted from their seeded
  // state across a whole suite run instead of resetting per-test.
  await admin.from('inventory').update({ quantity_on_hand: 100 }).not('id', 'is', null);
  await admin.from('products').update({ sold_by_weight: false }).not('id', 'is', null);

  // Phase 21 (i18n): profiles.locale is a persistent per-staff preference
  // (D-02, default 'es-MX') that a locale-switching spec can leave at
  // 'en-US' if it errors before its own reset step runs. Force every
  // profile back to the documented default here so every spec starts from
  // a deterministic locale baseline, not whatever a prior run's failure
  // left behind.
  //
  // EXCEPT the 4 fixed E2E login accounts (setup-dev-users.ts pins these to
  // en-US, per 331e1b6) — nearly every other spec's selectors assert on
  // English UI text post-login. Blindly resetting every row here silently
  // reverted that pin on each test's beforeEach, since this reset predates
  // the en-US pin by three weeks (75dcdb4 vs 331e1b6) and was never updated
  // to account for it.
  const pinnedNames = [
    process.env['E2E_ADMIN_NAME'],
    process.env['E2E_MANAGER_NAME'],
    process.env['E2E_BARTENDER_NAME'],
    process.env['E2E_KITCHEN_NAME'],
  ].filter((n): n is string => !!n);
  const pinnedRows =
    pinnedNames.length > 0
      ? (await admin.from('profiles').select('id').in('name', pinnedNames)).data
      : [];
  const pinnedIds = (pinnedRows ?? []).map(r => (r as { id: string }).id);
  let localeResetQuery = admin.from('profiles').update({ locale: 'es-MX' }).neq('locale', 'es-MX');
  if (pinnedIds.length > 0) {
    localeResetQuery = localeResetQuery.not('id', 'in', `(${pinnedIds.join(',')})`);
  }
  await localeResetQuery;

  // The comment above documents pinned accounts as "pinned to en-US", but
  // until now this function only ever EXCLUDED them from the es-MX reset —
  // it never actively restored en-US. That's a silent no-op the moment
  // anything else (a locale-switching spec, or — under concurrent
  // multi-worktree E2E runs against one shared Supabase project — a sibling
  // process's test) leaves a pinned account on es-MX: every subsequent
  // English-text selector in every other spec starts failing until a human
  // re-runs setup-dev-users.ts. Actively re-pin on every reset instead.
  if (pinnedIds.length > 0) {
    await admin.from('profiles').update({ locale: 'en-US' }).in('id', pinnedIds);
  }

  // A promotion spec that fails between "create via UI" and "look up the new
  // row's id" leaves that row behind — its own afterEach only knows ids it
  // captured, so a UI-created row it never saw stays LIVE forever. A single
  // leaked store-wide promotion discounts every sale in every other spec
  // (found live in this session: two leaked "E2E percent-field-input <uuid>"
  // rows broke refund.spec.ts, reopen-closed-ticket.spec.ts and
  // promotion-deleted-mid-cart.spec.ts with AMOUNT_MISMATCH/stale-price
  // failures). Sweep any row named by the "E2E " test-data convention on
  // every reset; promotion_targets cascades on delete (verified via a select
  // count after this ran locally — zero orphaned targets).
  await admin.from('promotions').delete().like('name', 'E2E %');

  // Test-data isolation only: keeps refund.spec.ts's own ledger fixtures out
  // of every OTHER spec's Movements-tab assertions, same pattern as the
  // promotions sweep above.
  //
  // This sweep originally also contained an app bug: useInventoryLog() parsed
  // stock_movements rows with InventoryLogSchema, whose narrower
  // InventoryAdjustReasonSchema has no 'refund', and the resulting throw
  // aborted the whole 100-row fetch — blanking the Movements tab with no error
  // for every user the moment a refund landed in the window. That is fixed at
  // source (queries.ts now parses with StockMovementSchema and skips, not
  // aborts, on a bad row); the regression guard is the unit test
  // src/entities/inventory/model/queries.test.ts → "keeps a stock_movements row
  // with reason='refund' instead of dropping the whole batch". Do not rely on
  // this sweep to hide a parsing bug again.
  await admin.from('stock_movements').delete().eq('reason', 'refund');
}

/**
 * Opens a new caja session (requires no other open caja for `terminalId`). Uses first manager profile as opener.
 */
export async function openCaja(openingCash: number, terminalId = 'POS-1'): Promise<string> {
  const admin = getServiceClient();
  const { data: mgr, error: mErr } = await admin.from('profiles').select('id').eq('role', 'manager').limit(1).maybeSingle();
  if (mErr || !mgr) throw new Error('openCaja: no manager profile found');

  // Close any leftover open sessions from prior runs. caja_sessions has a
  // bump_version_on_update trigger (Phase 15, D-02) that rejects any UPDATE
  // that doesn't advance version by exactly +1 — so each open row must be
  // closed individually with its current version read first, rather than a
  // single blind UPDATE ... WHERE status = 'open' (which the trigger silently
  // rejects, leaving the stale row open and the INSERT below failing on the
  // caja_sessions_one_open unique constraint).
  const { data: openRows, error: openErr } = await admin
    .from('caja_sessions')
    .select('id, version')
    .eq('status', 'open');
  if (openErr) throw new Error(`openCaja: failed to read open sessions - ${openErr.message}`);
  for (const openRow of openRows ?? []) {
    const { error: closeErr } = await admin
      .from('caja_sessions')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        closed_by: mgr.id,
        closing_cash: openingCash,
        version: ((openRow as { version: number | null }).version ?? 0) + 1,
      })
      .eq('id', (openRow as { id: string }).id);
    if (closeErr) throw new Error(`openCaja: failed to close stale session - ${closeErr.message}`);
  }

  const { data: row, error } = await admin
    .from('caja_sessions')
    .insert({
      opened_by: mgr.id,
      opening_cash: openingCash,
      status: 'open',
      terminal_id: terminalId,
    })
    .select('id')
    .single();

  if (error || !row) throw new Error(`openCaja failed: ${error?.message ?? 'no row'}`);
  return row.id as string;
}

export async function getInventoryQty(productName: string): Promise<number> {
  const admin = getServiceClient();
  const { data: prod, error: pErr } = await admin.from('products').select('id').eq('name', productName).maybeSingle();
  if (pErr || !prod) throw new Error(`getInventoryQty: product "${productName}" not found`);
  const { data: inv, error: iErr } = await admin
    .from('inventory')
    .select('quantity_on_hand')
    .eq('product_id', prod.id)
    .maybeSingle();
  if (iErr || inv == null) throw new Error(`getInventoryQty: no inventory row for "${productName}"`);
  return Number(inv.quantity_on_hand);
}

export async function setInventoryQty(productName: string, qty: number): Promise<void> {
  const admin = getServiceClient();
  const { data: prod, error: pErr } = await admin.from('products').select('id').eq('name', productName).maybeSingle();
  if (pErr || !prod) throw new Error(`setInventoryQty: product "${productName}" not found`);
  const { error } = await admin.from('inventory').update({ quantity_on_hand: qty }).eq('product_id', prod.id);
  if (error) throw new Error(`setInventoryQty failed: ${error.message}`);
}

export async function getOrderCount(tabId: string): Promise<number> {
  const admin = getServiceClient();
  const { count, error } = await admin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('tab_id', tabId)
    .eq('is_deleted', false);
  if (error) throw new Error(`getOrderCount: ${error.message}`);
  return count ?? 0;
}

/**
 * Lists migration files on disk and marks applied=true if `supabase migration list` shows them as applied.
 * If the CLI is unavailable, returns applied:false for all (infra test documents the gap).
 */
export async function getMigrationList(): Promise<{ name: string; applied: boolean }[]> {
  const dir = path.join(PROJECT_ROOT, 'supabase', 'migrations');
  const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

  let cliOutput = '';
  try {
    cliOutput = execSync('npx supabase migration list', {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60_000,
    });
  } catch {
    return files.map(name => ({ name, applied: false }));
  }

  return files.map(name => {
    // CLI output shows only the timestamp prefix (e.g. "20260414000001"), not the full filename.
    // String.split always returns at least one element, so the `?? name` fallback is unreachable
    // in practice — it exists only to satisfy noUncheckedIndexedAccess.
    const timestamp = name.split('_')[0] ?? name;
    return {
      name,
      applied: cliOutput.includes(timestamp),
    };
  });
}

export async function forceCloseAllOpenTabs(): Promise<void> {
  const admin = getServiceClient();
  // `tabs` carries a bump_version_on_update trigger (Phase 15, D-02) that
  // silently rejects any UPDATE not paired with `version = version + 1` per
  // row (STALE_VERSION, P0V01) — a blind bulk UPDATE with no version bump
  // (as this function did before) fails on EVERY row, leaving all tabs still
  // 'open'. This surfaced once 17-06 un-skipped "Manager closes caja"
  // (e78559d) — the test.skip'd version never actually exercised this path.
  // Reuse the same per-row bump pattern resetTestState() already uses.
  const { data: openTabs } = await admin
    .from('tabs')
    .select('id, version')
    .eq('status', 'open')
    .eq('is_deleted', false);
  await bumpVersionedRows(admin, 'tabs', (openTabs ?? []) as { id: string; version: number }[], {
    status: 'voided',
    closed_at: new Date().toISOString(),
  });
}

export async function getOpenTabIdByCustomerName(customerName: string): Promise<string | null> {
  const admin = getServiceClient();
  const { data, error } = await admin
    .from('tabs')
    .select('id')
    .eq('customer_name', customerName)
    .eq('status', 'open')
    .eq('is_deleted', false)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.id as string | undefined) ?? null;
}

/**
 * Simulates a second POS terminal winning the race: bumps `tabs.version` for
 * the given tab out-of-band via the service-role client, without touching
 * any other column. The returned value is the version the app's cached copy
 * (fetched before this call) is now stale against — driving a UI action that
 * still carries the pre-bump version should surface a STALE_VERSION conflict.
 *
 * Read-then-guarded-write, mirroring the private `bumpVersionedRows` above:
 * the `bump_version_on_update` trigger (Phase 15) rejects any `tabs` UPDATE
 * that doesn't advance `version` by exactly 1, and PostgREST cannot express
 * `version = version + 1` as a literal, so the current version must be read
 * first and the UPDATE re-guarded with `.eq('version', currentVersion)`.
 */
export async function bumpTabVersion(tabId: string): Promise<number> {
  const admin = getServiceClient();
  const { data: current, error: readErr } = await admin
    .from('tabs')
    .select('version')
    .eq('id', tabId)
    .single();
  if (readErr) throw new Error(readErr.message);

  const currentVersion = (current as { version: number }).version;
  const nextVersion = currentVersion + 1;

  const { data: updated, error: updateErr } = await admin
    .from('tabs')
    .update({ version: nextVersion })
    .eq('id', tabId)
    .eq('version', currentVersion)
    .select('id');
  if (updateErr) throw new Error(updateErr.message);
  if (!updated || updated.length === 0) {
    throw new Error(`bumpTabVersion: no row matched id=${tabId} version=${currentVersion}`);
  }

  return nextVersion;
}

// ---------------------------------------------------------------------------
// New helpers added for specs 18-26
// ---------------------------------------------------------------------------

// Maps a seedOpenTab `role` to the pinned E2E fixture account's env-var name
// (mirrors e2e/helpers/auth.ts's staffForRole) — the DB can carry many other
// profiles sharing the same role (staff-management specs create/seed dozens
// over a full suite run), so picking "any profile with this role" is not
// deterministic enough to guarantee the seeded tab's shift belongs to the
// SAME staff member a subsequent `loginAs(page, role)` call authenticates
// as. Falls back to the old "first profile with this role" behavior when the
// env var is unset/doesn't match any profile, so this stays backward
// compatible for callers that don't care which specific staff member seeds
// the fixture.
const ROLE_ENV_NAME: Record<'cashier' | 'manager' | 'admin' | 'kitchen', string> = {
  cashier: 'E2E_BARTENDER_NAME',
  manager: 'E2E_MANAGER_NAME',
  admin: 'E2E_ADMIN_NAME',
  kitchen: 'E2E_KITCHEN_NAME',
};

export async function findRoleStaffId(
  admin: ReturnType<typeof getServiceClient>,
  role: 'cashier' | 'manager' | 'admin' | 'kitchen'
): Promise<string> {
  const pinnedName = process.env[ROLE_ENV_NAME[role]]?.trim();
  if (pinnedName) {
    const { data: pinnedStaff } = await admin
      .from('profiles')
      .select('id')
      .eq('role', role)
      .eq('name', pinnedName)
      .limit(1)
      .maybeSingle();
    if (pinnedStaff) return pinnedStaff.id as string;
  }
  const { data: anyStaff, error: sErr } = await admin
    .from('profiles')
    .select('id')
    .eq('role', role)
    .limit(1)
    .single();
  if (sErr || !anyStaff) throw new Error(`findRoleStaffId: no "${role}" profile found – ${sErr?.message}`);
  return anyStaff.id as string;
}

/**
 * Seed an open tab (optionally with one order/order_item) directly via the
 * service-role client, bypassing the /pos page — deleted in Plan 01-11 per
 * D-07 (no checkout stub until Phase 2 rebuilds it). Returns tabId and,
 * when `withItem` is true, orderId so item-level assertions can still run.
 */
export async function seedOpenTab(opts: {
  customerName: string;
  role?: 'cashier' | 'manager' | 'admin' | 'kitchen';
  withItem?: boolean;
  productName: string;
  /**
   * `tabs.caja_session_id` is nullable with no default/trigger — omitting it
   * leaves a seeded tab invisible to close_caja_session's OPEN_TABS_EXIST
   * guard (`WHERE caja_session_id = p_caja_id`) and to
   * useOpenTabsPendingTotal's `.eq('caja_session_id', cajaId)` query. Pass
   * the id returned by `openCaja()` whenever the seeded tab needs to count
   * as "open" for THIS session's guard/pending-total checks.
   */
  cajaSessionId?: string;
}): Promise<{ tabId: string; orderId: string | null }> {
  const admin = getServiceClient();
  const role = opts.role ?? 'cashier';

  const staff = { id: await findRoleStaffId(admin, role) };

  let shiftId: string;
  const { data: existingShift } = await admin
    .from('shifts')
    .select('id')
    .eq('staff_id', staff.id)
    .is('clock_out', null)
    .limit(1)
    .maybeSingle();
  if (existingShift) {
    shiftId = existingShift.id as string;
  } else {
    const { data: newShift, error: shiftErr } = await admin
      .from('shifts')
      .insert({ staff_id: staff.id, opening_cash: 0 })
      .select('id')
      .single();
    if (shiftErr || !newShift) throw new Error(`seedOpenTab: shift create failed – ${shiftErr?.message}`);
    shiftId = newShift.id as string;
  }

  const { data: tab, error: tabErr } = await admin
    .from('tabs')
    .insert({
      customer_name: opts.customerName,
      staff_id: staff.id,
      shift_id: shiftId,
      status: 'open',
      is_deleted: false,
      ...(opts.cajaSessionId ? { caja_session_id: opts.cajaSessionId } : {}),
    })
    .select('id')
    .single();
  if (tabErr || !tab) throw new Error(`seedOpenTab: tab insert failed – ${tabErr?.message}`);

  if (!opts.withItem) {
    return { tabId: tab.id as string, orderId: null };
  }

  const productName = opts.productName;
  const { data: product, error: pErr } = await admin
    .from('products')
    .select('id, base_price')
    .eq('name', productName)
    .maybeSingle();
  if (pErr || !product) throw new Error(`seedOpenTab: product "${productName}" not found – ${pErr?.message}`);

  const { data: order, error: oErr } = await admin
    .from('orders')
    .insert({ tab_id: tab.id, staff_id: staff.id, status: 'pending' })
    .select('id')
    .single();
  if (oErr || !order) throw new Error(`seedOpenTab: order insert failed – ${oErr?.message}`);

  const { error: iErr } = await admin.from('order_items').insert({
    order_id: order.id,
    product_id: product.id,
    quantity: 1,
    unit_price: product.base_price,
    modifier_price_delta: 0,
  });
  if (iErr) throw new Error(`seedOpenTab: order_item insert failed – ${iErr.message}`);

  return { tabId: tab.id as string, orderId: order.id as string };
}

/**
 * Seed a closed/paid tab with one payment row.
 * Returns the tabId.
 */
export async function seedClosedTab(): Promise<string> {
  const admin = getServiceClient();

  const { data: staff } = await admin.from('profiles').select('id').limit(1).single();
  if (!staff) throw new Error('seedClosedTab: no profile found');

  // Find or create a shift
  let shiftId: string;
  const { data: existingShift } = await admin
    .from('shifts')
    .select('id')
    .eq('staff_id', staff.id)
    .is('clock_out', null)
    .limit(1)
    .maybeSingle();
  if (existingShift) {
    shiftId = existingShift.id as string;
  } else {
    const { data: newShift, error: shiftErr } = await admin
      .from('shifts')
      .insert({ staff_id: staff.id, opening_cash: 0 })
      .select('id')
      .single();
    if (shiftErr || !newShift) throw new Error(`seedClosedTab: shift create failed – ${shiftErr?.message}`);
    shiftId = newShift.id as string;
  }

  const { data: tab, error: tabErr } = await admin
    .from('tabs')
    .insert({
      customer_name: 'Closed Tab E2E',
      staff_id: staff.id,
      shift_id: shiftId,
      status: 'paid',
      closed_at: new Date().toISOString(),
      is_deleted: false,
    })
    .select('id')
    .single();
  if (tabErr || !tab) throw new Error(`seedClosedTab: tab insert failed – ${tabErr?.message}`);

  // Insert a payment row. idempotency_key is NOT NULL on `payments`
  // (20260417000001_payment_processing.sql) — omitting it makes this insert
  // fail silently (no .select()/error check below), leaving the seeded tab
  // with zero payment rows. Deterministic per-tab key mirrors the pattern in
  // e2e/35-refund.spec.ts's local seedPaidTab helper.
  const { error: paymentErr } = await admin.from('payments').insert({
    tab_id: tab.id,
    amount: 10,
    method: 'cash',
    square_payment_id: null,
    square_receipt_url: null,
    processed_by: staff.id,
    idempotency_key: `e2e-seed-closed-tab-${(tab.id as string).slice(0, 8)}`,
  });
  if (paymentErr) {
    throw new Error(`seedClosedTab: payment insert failed – ${paymentErr.message}`);
  }

  return tab.id as string;
}

/**
 * Seed a caja_entries row for the open caja session.
 * Returns the entryId.
 */
export async function seedCajaEntry(
  type: 'expense' | 'income',
  amount: number,
  concept: string
): Promise<string> {
  const admin = getServiceClient();

  const { data: caja, error: cErr } = await admin
    .from('caja_sessions')
    .select('id')
    .eq('status', 'open')
    .maybeSingle();
  if (cErr || !caja) throw new Error(`seedCajaEntry: no open caja session – ${cErr?.message}`);

  const { data: staff } = await admin.from('profiles').select('id').limit(1).single();
  if (!staff) throw new Error('seedCajaEntry: no profile found');

  const { data: entry, error: eErr } = await admin
    .from('caja_entries')
    .insert({
      caja_session_id: caja.id,
      type,
      amount,
      concept,
      staff_id: staff.id,
    })
    .select('id')
    .single();
  if (eErr || !entry) throw new Error(`seedCajaEntry: insert failed – ${eErr?.message}`);

  return entry.id as string;
}

/**
 * Set is_active on a product by name.
 */
export async function setProductActive(productName: string, active: boolean): Promise<void> {
  const admin = getServiceClient();
  const { error } = await admin
    .from('products')
    .update({ is_active: active })
    .eq('name', productName);
  if (error) throw new Error(`setProductActive failed: ${error.message}`);
}

/**
 * Set quantity_on_hand = 0 for the inventory row linked to the named product.
 */
export async function setStockToZero(productName: string): Promise<void> {
  const admin = getServiceClient();
  const { data: prod, error: pErr } = await admin
    .from('products')
    .select('id')
    .eq('name', productName)
    .maybeSingle();
  if (pErr || !prod) throw new Error(`setStockToZero: product "${productName}" not found`);

  const { error } = await admin
    .from('inventory')
    .update({ quantity_on_hand: 0 })
    .eq('product_id', prod.id);
  if (error) throw new Error(`setStockToZero failed: ${error.message}`);
}

/**
 * Seed a new staff member via Supabase Auth admin + profiles upsert.
 * Returns the userId.
 */
export async function seedNewStaffMember(
  name: string,
  pin: string,
  role: 'cashier' | 'manager' | 'admin'
): Promise<string> {
  const admin = getServiceClient();

  // Use name as deterministic email
  const email = `${name.toLowerCase().replace(/\s+/g, '-')}@e2e-test.local`;

  // Password MUST equal the raw PIN, not a wrapped string — PINLoginForm.tsx
  // signs in with `password: enteredPin` (the PIN keypad value verbatim), so
  // an account seeded with any other password can never pass PIN login.
  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email,
    password: pin,
    email_confirm: true,
  });
  if (authErr || !authUser.user) throw new Error(`seedNewStaffMember: auth create failed – ${authErr?.message}`);

  const userId = authUser.user.id;

  const { error: profileErr } = await admin.from('profiles').upsert({
    id: userId,
    name,
    email,
    role,
    pin,
    is_active: true,
  });
  if (profileErr) throw new Error(`seedNewStaffMember: profile upsert failed – ${profileErr.message}`);

  return userId;
}

/**
 * Set stock_threshold on a product by name.
 * Pass null to clear the threshold.
 */
export async function setStockThreshold(productName: string, threshold: number | null): Promise<void> {
  const admin = getServiceClient();
  const { data: prod, error: pErr } = await admin
    .from('products')
    .select('id')
    .eq('name', productName)
    .maybeSingle();
  if (pErr || !prod) throw new Error(`setStockThreshold: "${productName}" not found`);
  const { error } = await admin
    .from('products')
    .update({ stock_threshold: threshold })
    .eq('id', prod.id);
  if (error) throw new Error(`setStockThreshold failed: ${error.message}`);
}

/**
 * Clear stock_threshold (set to null) on a product by name.
 */
export async function clearStockThreshold(productName: string): Promise<void> {
  await setStockThreshold(productName, null);
}

/**
 * Get the most recent stock_movements entry for a product by name with a given reason.
 * Returns null if no matching row exists.
 */
export async function getLatestInventoryLog(
  productName: string,
  reason: string
): Promise<{ quantity_delta: number; reason: string } | null> {
  const admin = getServiceClient();
  const { data: prod, error: pErr } = await admin
    .from('products')
    .select('id')
    .eq('name', productName)
    .maybeSingle();
  if (pErr || !prod) throw new Error(`getLatestInventoryLog: "${productName}" not found`);
  const { data, error } = await admin
    .from('stock_movements')
    .select('quantity_delta, reason')
    .eq('product_id', prod.id)
    .eq('reason', reason)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getLatestInventoryLog failed: ${error.message}`);
  if (!data) return null;
  return { quantity_delta: Number(data.quantity_delta), reason: data.reason as string };
}

export async function deleteTestStaff(name: string): Promise<void> {
  const admin = getServiceClient();

  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('name', name)
    .maybeSingle();

  if (profile) {
    // shifts.staff_id FK-references profiles.id with no ON DELETE CASCADE --
    // a test that opened a shift for this staff member (e.g. to call a
    // shift/Caja-scoped RPC as them) must have that shift removed first, or
    // both the profile delete and the auth user delete fail (the latter
    // failing opaquely as a 500 "Database error deleting user" once the
    // profile row -- which the auth trigger also depends on -- survives).
    await admin.from('shifts').delete().eq('staff_id', profile.id);
    await admin.from('profiles').delete().eq('id', profile.id);
    await admin.auth.admin.deleteUser(profile.id as string);
    return;
  }

  // seedNewStaffMember creates the auth user before upserting its profiles
  // row. A test that throws between those two steps (e.g. an assertion
  // failure on the following action) leaves an orphaned auth.users row with
  // no matching profile -- invisible to the lookup above, so it collides
  // with "email already registered" on every subsequent seed attempt.
  // Sweep it by the same deterministic email seedNewStaffMember derives.
  const email = `${name.toLowerCase().replace(/\s+/g, '-')}@e2e-test.local`;
  const { data: usersPage } = await admin.auth.admin.listUsers();
  const orphan = usersPage.users.find(u => u.email === email);
  if (orphan) {
    await admin.auth.admin.deleteUser(orphan.id);
  }
}
