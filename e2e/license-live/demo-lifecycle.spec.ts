/**
 * Live integration check against the REAL local license-server stack (pos-license-server's
 * Supabase + `functions serve`) — the one deliberate exception to this repo's hermetic
 * `e2e/license/` suite. NO `page.route()` mocking anywhere in this file: every request in
 * here crosses the wire to a real Postgres database and real edge functions, so it catches
 * classes of bug the hermetic suite's mocks structurally cannot (real RLS, real constraint
 * violations, the real token-signing key). See `playwright.license-live.config.ts` for the
 * required env vars and how to start the stack this depends on.
 *
 * Never run in CI, not part of `npm run test:e2e` — opt-in only, via
 * `npm run test:e2e:license:live`.
 */
import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/auth';

const LICENSE_API = 'http://127.0.0.1:55321';
const TERMINAL_ID_KEY = 'pos.license.terminal_id';
const PAID_KEY = 'DE00-0000-0000-0001';

/**
 * Reads a required env var at CALL time, never at module load — this file is discovered
 * (and its module body executed) by every Playwright config whose testDir includes it,
 * so throwing here at the top level would break `--list`/discovery under configs that
 * don't set LICENSE_LOCAL_* (e.g. an accidental default-config scan). Callers only reach
 * this after `test.beforeAll`'s `test.skip` guard has already bailed out when unset.
 */
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required env: ${name}. Export it from ` +
        '`npx supabase status -o env` in D:\\Projects\\Code\\pos-license-server ' +
        '(see playwright.license-live.config.ts header).'
    );
  }
  return value.trim();
}

/** Thin REST helper against the license server's PostgREST, authenticated as service role. */
async function licenseRest<T>(path: string, method: 'GET' | 'DELETE' = 'GET'): Promise<T> {
  const serviceRoleKey = requiredEnv('LICENSE_LOCAL_SERVICE_ROLE_KEY');
  const res = await fetch(`${LICENSE_API}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`REST ${path} -> ${String(res.status)}: ${await res.text()}`);
  }
  // A DELETE with no `Prefer: return=representation` responds 204 with an empty body.
  const text = await res.text();
  return (text ? JSON.parse(text) : []) as T;
}

interface TerminalTenantRow {
  tenant_id: string;
  tenants: { plan: string; slug: string } | null;
}

test.beforeAll(async () => {
  // Env is read here (runtime), not at module scope, so a tool that merely loads/lists
  // this file without LICENSE_LOCAL_* set (e.g. the default config's discovery) never
  // hard-crashes — it skips instead.
  test.skip(
    !process.env.LICENSE_LOCAL_SERVICE_ROLE_KEY?.trim(),
    'LICENSE_LOCAL_SERVICE_ROLE_KEY not set — see playwright.license-live.config.ts header'
  );

  // Self-healing per Task 14's brief: `demo-store` is a persistent seeded tenant with
  // max_terminals: 2 that accumulates bound terminals across reruns of this suite (each
  // run mints a fresh terminal id for steps 1-2, but the conversion step in step 3 binds
  // that terminal to this same shared tenant). Clear stale terminals first so `activate`
  // never fails with TERMINAL_LIMIT.
  const tenants = await licenseRest<Array<{ id: string }>>(
    'tenants?slug=eq.demo-store&select=id'
  );
  const tenantId = tenants[0]?.id;
  if (tenantId) {
    await licenseRest(`terminals?tenant_id=eq.${tenantId}`, 'DELETE');
  }
});

test('demo lifecycle: start demo, entitlements, convert to paid — verified server-side', async ({
  page,
}) => {
  // --- 1. Fresh gate -> start-demo (real edge function call) ---
  await page.goto('/login');
  await expect(page.getByTestId('license-gate')).toHaveAttribute('data-reason', 'unlicensed');

  const startDemoResponsePromise = page.waitForResponse(
    r => r.url().includes('/functions/v1/start-demo') && r.request().method() === 'POST'
  );
  await page.getByTestId('start-demo-button').click();
  const startDemoResponse = await startDemoResponsePromise;
  expect(startDemoResponse.status()).toBe(200);
  const startDemoJson = (await startDemoResponse.json()) as {
    token?: string;
    license_key?: string;
  };
  expect(typeof startDemoJson.token).toBe('string');
  expect(typeof startDemoJson.license_key).toBe('string');

  await expect(page.getByTestId('license-gate')).toBeHidden();
  await expect(page.getByTestId('demo-login-hint')).toBeVisible();

  // --- 2. Log in, check entitlements ---
  await loginAs(page, 'admin');
  await expect(page.getByTestId('demo-bar')).toHaveAttribute('data-days-left', '14');

  await page.goto('/reports');
  await expect(
    page.locator('[data-testid="locked-feature"][data-feature="report_export"]')
  ).toBeVisible();

  await page.goto('/settings');
  await page.getByRole('tab', { name: /licen/i }).click();
  await expect(page.getByTestId('license-settings-tab')).toContainText(/Demo/);

  // Server-side proof BEFORE conversion: this terminal's tenant is on the demo plan.
  const terminalId = await page.evaluate(
    key => localStorage.getItem(key),
    TERMINAL_ID_KEY
  );
  if (!terminalId) throw new Error(`localStorage['${TERMINAL_ID_KEY}'] was empty after login`);

  const beforeRows = await licenseRest<TerminalTenantRow[]>(
    `terminals?id=eq.${terminalId}&select=tenant_id,tenants(plan,slug)`
  );
  expect(beforeRows).toHaveLength(1);
  expect(beforeRows[0]?.tenants?.plan).toBe('demo');
  const oldTenantId = beforeRows[0]?.tenant_id;

  // --- 3. Conversion (spec R6): activate the seeded paid key on the same terminal ---
  await page.getByRole('button', { name: /cambiar clave|change key/i }).click();
  await page.getByLabel(/clave de licencia|license key/i).fill(PAID_KEY);

  const activateResponsePromise = page.waitForResponse(
    r => r.url().includes('/functions/v1/activate') && r.request().method() === 'POST'
  );
  await page.getByRole('button', { name: /^activar$|^activate$/i }).click();
  const activateResponse = await activateResponsePromise;
  expect(activateResponse.status()).toBe(200);

  await expect(page.getByTestId('demo-bar')).toBeHidden();
  await page.goto('/reports');
  await expect(page.locator('[data-testid="locked-feature"]')).toHaveCount(0);

  await page.goto('/settings');
  await page.getByRole('tab', { name: /licen/i }).click();
  await expect(page.getByTestId('license-settings-tab')).toContainText(/Mensual|Monthly/);

  // Server-side proof AFTER conversion: same terminal, re-bound to the paid `demo-store`
  // tenant, and the old throwaway demo tenant row is gone (R6's delete-on-convert).
  const afterRows = await licenseRest<TerminalTenantRow[]>(
    `terminals?id=eq.${terminalId}&select=tenant_id,tenants(plan,slug)`
  );
  expect(afterRows).toHaveLength(1);
  expect(afterRows[0]?.tenants?.plan).toBe('monthly');
  expect(afterRows[0]?.tenants?.slug).toBe('demo-store');

  if (oldTenantId) {
    const oldTenantRows = await licenseRest<unknown[]>(`tenants?id=eq.${oldTenantId}`);
    expect(oldTenantRows).toHaveLength(0);
  }
});
