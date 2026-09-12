# Caja Per Terminal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One open caja (cash register session) per terminal instead of one per database, with a single runtime-configurable terminal identity.

**Architecture:** `caja_sessions.terminal_id` + partial-unique index per terminal; `caja_open` stores it; the sale RPC optionally verifies it. A new `src/shared/lib/terminal.ts` becomes the only source of the terminal id (localStorage → env → `POS-1`), replacing 13 inline copies. `useCurrentCaja` filters by terminal. Close returns the reconciliation the RPC already computes.

**Tech Stack:** Postgres/plpgsql migrations (Supabase CLI, local stack on 127.0.0.1:54321), React 19 + TanStack Query + Zustand, Zod v4, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-12-combos-and-terminal-caja-design.md` (Part B).

## Global Constraints

- Repo root is `D:\Projects\Code\supermarket-pos` (there is **no** nested `supermarket-pos/` dir despite CLAUDE.md wording). Run npm/npx from the root.
- `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` are on: write `prop: T | undefined`, never `prop?: T` for mutation inputs; index access returns `T | undefined`.
- No `any`. All async returns `Result<T>` (`src/shared/lib/result.ts`). Logging via `src/shared/lib/logger.ts`.
- Every UI string goes through `react-i18next`; `i18next/no-literal-string` is a lint error in `shared/ui`, `entities`, `features`, `widgets`, `pages`. Add keys to **both** `src/shared/lib/i18n/locales/en-US/*.json` and `es-MX/*.json` (es-MX values in Spanish).
- FSD import direction `app → pages → widgets → features → entities → shared` is lint-enforced.
- Migrations: the newest existing file is `20260912000002_platform_tenders_rappi_uber_eats.sql`. When re-creating an RPC, copy the **latest** body across all migrations (search by function name, highest timestamp wins) and patch it — never an older copy. Wrap in `BEGIN; … COMMIT;`, end with `NOTIFY pgrst, 'reload schema';`, add a commented DOWN block.
- Apply locally with `npx supabase migration up` (local stack must be running: `npx supabase status`). Regenerate types after schema changes: `npx supabase gen types typescript --local > src/shared/lib/supabase.types.ts` (never hand-edit that file).
- Terminal id format: `/^[A-Za-z0-9_-]{1,32}$/`, default `'POS-1'`.
- Commit convention: `<type>(<scope>): <description>`; every commit ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Run `npm run typecheck && npm run lint` before each commit (pre-commit hooks may be inert).
- Scoped test runs while iterating (`npx vitest run <file> --project unit`, `npx playwright test <spec>`); the full suite only at the integration gate. Playwright needs `npm run dev` (port 1520) — `webServer.reuseExistingServer` is true.

---

### Task 1: `src/shared/lib/terminal.ts` — single terminal identity

**Files:**
- Create: `src/shared/lib/terminal.ts`, `src/shared/lib/terminal.test.ts`
- Modify: `src/shared/lib/license/terminal-id.ts:28-30` (`getTerminalName` delegates)
- Delete: `src/shared/config/constants.ts` (only export is `TERMINAL_ID`) — update its importers: `src/features/edit-paid-tab/ui/EditPaidTabDialog.tsx`, `src/features/reopen-tab/ui/ReopenTabDialog.tsx`, `src/widgets/PaymentPane/ui/EditReopenedItemsPanel.tsx`, `src/features/close-tab/index.ts` (imports from `version-error`)
- Modify (replace the inline `const TERMINAL_ID = (import.meta.env.VITE_TERMINAL_ID as string | undefined) ?? 'POS-1'` pattern with `import { getTerminalId } from '@shared/lib/terminal'` and call it at use time): `src/app/OfflineQueueProcessor.tsx`, `src/entities/caja/model/queries.ts`, `src/entities/settings/model/queries.ts`, `src/entities/staff/model/queries.ts`, `src/features/force-pin-change/model/useForcePinChange.ts`, `src/features/idle-screen-lock/model/useIdleLockAudit.ts`, `src/features/lookup-product-by-barcode/model/useLookupProductByBarcode.ts`, `src/features/toggle-permission/useMutationTogglePermission.ts`, `src/pages/login/index.tsx`, `src/shared/lib/logger-instance.ts`, `src/shared/lib/version-error.ts` (keep exporting `TERMINAL_ID` **removed** — switch its consumers), `src/widgets/AppShell/ui/Sidebar.tsx`, `src/widgets/PINLoginForm/PINLoginForm.tsx`. Integration tests that reference `TERMINAL_ID` (`src/entities/settings/model/terminal-lock-settings-rls.integration.test.ts`, `src/features/idle-screen-lock/model/idle-lock-audit.integration.test.ts`) switch to `getTerminalId()`.

**Interfaces:**
- Produces: `getTerminalId(): string`, `setTerminalId(id: string): Result<void>` (returns `err({code:'VALIDATION_ERROR', message})` on bad format), `TERMINAL_ID_STORAGE_KEY = 'pos.terminal_id'`, `TERMINAL_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/`, `DEFAULT_TERMINAL_ID = 'POS-1'`.

- [ ] **Step 1: Write the failing test** `src/shared/lib/terminal.test.ts`

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TERMINAL_ID, TERMINAL_ID_STORAGE_KEY, getTerminalId, setTerminalId } from './terminal';

describe('terminal identity', () => {
  beforeEach(() => { localStorage.clear(); vi.unstubAllEnvs(); });

  it('falls back to POS-1 when nothing is configured', () => {
    expect(getTerminalId()).toBe(DEFAULT_TERMINAL_ID);
  });
  it('prefers VITE_TERMINAL_ID over the default', () => {
    vi.stubEnv('VITE_TERMINAL_ID', 'POS-9');
    expect(getTerminalId()).toBe('POS-9');
  });
  it('prefers localStorage over the env var', () => {
    vi.stubEnv('VITE_TERMINAL_ID', 'POS-9');
    localStorage.setItem(TERMINAL_ID_STORAGE_KEY, 'CAJA_2');
    expect(getTerminalId()).toBe('CAJA_2');
  });
  it('setTerminalId persists a valid id and trims it', () => {
    expect(setTerminalId('  POS-2 ').ok).toBe(true);
    expect(getTerminalId()).toBe('POS-2');
  });
  it('setTerminalId rejects invalid ids', () => {
    expect(setTerminalId('').ok).toBe(false);
    expect(setTerminalId('has space').ok).toBe(false);
    expect(setTerminalId('x'.repeat(33)).ok).toBe(false);
    expect(getTerminalId()).toBe(DEFAULT_TERMINAL_ID);
  });
  it('ignores a corrupted localStorage value', () => {
    localStorage.setItem(TERMINAL_ID_STORAGE_KEY, 'bad value!');
    expect(getTerminalId()).toBe(DEFAULT_TERMINAL_ID);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/shared/lib/terminal.test.ts --project unit` → FAIL (module missing).

- [ ] **Step 3: Implement** `src/shared/lib/terminal.ts`

```ts
import { err, ok, type Result } from './result';

export const TERMINAL_ID_STORAGE_KEY = 'pos.terminal_id';
export const TERMINAL_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
export const DEFAULT_TERMINAL_ID = 'POS-1';

function readStored(): string | null {
  try {
    const v = localStorage.getItem(TERMINAL_ID_STORAGE_KEY);
    return v && TERMINAL_ID_PATTERN.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** Per-install terminal identity: Settings → Hardware (localStorage) → VITE_TERMINAL_ID → POS-1. */
export function getTerminalId(): string {
  const stored = readStored();
  if (stored) return stored;
  const env = (import.meta.env.VITE_TERMINAL_ID as string | undefined)?.trim();
  return env && TERMINAL_ID_PATTERN.test(env) ? env : DEFAULT_TERMINAL_ID;
}

export function setTerminalId(raw: string): Result<void> {
  const id = raw.trim();
  if (!TERMINAL_ID_PATTERN.test(id)) {
    return err({ code: 'VALIDATION_ERROR', message: 'Terminal id must be 1-32 chars: letters, digits, _ or -' });
  }
  try {
    localStorage.setItem(TERMINAL_ID_STORAGE_KEY, id);
  } catch {
    /* localStorage unavailable — value stays env/default for this session */
  }
  return ok(undefined);
}
```
(Check `result.ts` for the exact `err`/`ok` helper names/shape — `AppError` may require more fields; match it.)

- [ ] **Step 4: Run test** → PASS.

- [ ] **Step 5: Replace all inline `TERMINAL_ID` definitions** with `getTerminalId()` calls (grep `TERMINAL_ID` under `src/`; after this step the only hits should be inside `terminal.ts`, `terminal.test.ts`, and `TERMINAL_ID_STORAGE_KEY`/`TERMINAL_ID_PATTERN` usages). Delete `src/shared/config/constants.ts`. In `license/terminal-id.ts` make `getTerminalName()` return `getTerminalId()`. Evaluate lazily (call at use-time, not module-level), so a Settings change takes effect without reload.

- [ ] **Step 6: Verify** `npm run typecheck && npm run lint && npm run test` → all green; `grep -rn "VITE_TERMINAL_ID" src` should only hit `terminal.ts`.

- [ ] **Step 7: Commit** `refactor(terminal): single runtime terminal identity source`

---

### Task 2: Migration `20260913000000_caja_per_terminal.sql`

**Files:**
- Create: `supabase/migrations/20260913000000_caja_per_terminal.sql`
- Modify (regenerate): `src/shared/lib/supabase.types.ts`
- Test: `src/entities/caja/model/caja-terminal-rpc.integration.test.ts` (new, integration project — mirrors the style of `src/entities/promotion/model/promotion-rpc.integration.test.ts`: service-role client from `VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, fixture staff from `scripts/setup-test-fixtures.ts`)

**Interfaces:**
- Produces: `caja_sessions.terminal_id text NOT NULL DEFAULT 'POS-1'`; `caja_open(p_opening_cash, p_opened_by, p_terminal_id)` stores it; `process_direct_sale_atomic(... , p_terminal_id text DEFAULT NULL)` as the 20th parameter; returns `CAJA_CLOSED` with message `'Caja session belongs to terminal <terminal_id>'` on mismatch.

- [ ] **Step 1: Write the failing integration test** (service role; uses raw SQL via `supabase.rpc`/`from`):

```ts
// src/entities/caja/model/caja-terminal-rpc.integration.test.ts
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.VITE_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const db = createClient(url!, key!, { auth: { persistSession: false } });
const MANAGER_ID = '<copy Jamie Chen fixed uuid from scripts/setup-test-fixtures.ts>';

async function closeAllOpen() {
  const { data } = await db.from('caja_sessions').select('id, version').eq('status', 'open');
  for (const row of data ?? []) {
    await db.from('caja_sessions').update({ status: 'closed', closed_at: new Date().toISOString(), version: row.version + 1 })
      .eq('id', row.id).eq('version', row.version);
  }
}

describe('caja per terminal (schema + RPC)', () => {
  beforeAll(closeAllOpen); afterAll(closeAllOpen);

  it('allows one open caja per terminal and rejects a second on the same terminal', async () => {
    const a = await db.from('caja_sessions').insert({ opened_by: MANAGER_ID, opening_cash: 100, terminal_id: 'POS-1' }).select('id, terminal_id').single();
    expect(a.error).toBeNull(); expect(a.data?.terminal_id).toBe('POS-1');
    const b = await db.from('caja_sessions').insert({ opened_by: MANAGER_ID, opening_cash: 100, terminal_id: 'POS-2' }).select('id').single();
    expect(b.error).toBeNull();
    const dup = await db.from('caja_sessions').insert({ opened_by: MANAGER_ID, opening_cash: 0, terminal_id: 'POS-1' }).select('id').single();
    expect(dup.error?.code).toBe('23505');
  });

  it('defaults terminal_id to POS-1 and rejects malformed ids', async () => {
    await closeAllOpen();
    const d = await db.from('caja_sessions').insert({ opened_by: MANAGER_ID, opening_cash: 0 }).select('terminal_id').single();
    expect(d.data?.terminal_id).toBe('POS-1');
    const bad = await db.from('caja_sessions').insert({ opened_by: MANAGER_ID, opening_cash: 0, terminal_id: 'no spaces' }).select('id').single();
    expect(bad.error?.code).toBe('23514');
  });

  it('process_direct_sale_atomic rejects a caja from another terminal', async () => {
    await closeAllOpen();
    const s = await db.from('caja_sessions').insert({ opened_by: MANAGER_ID, opening_cash: 0, terminal_id: 'POS-2' }).select('id').single();
    const r = await db.rpc('process_direct_sale_atomic', {
      p_staff_id: MANAGER_ID, p_shift_id: '00000000-0000-0000-0000-000000000000', p_caja_session_id: s.data!.id,
      p_items: [], p_idempotency_key: `t-${Date.now()}`, p_terminal_id: 'POS-1',
    });
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ ok: false, code: 'CAJA_CLOSED' });
    expect((r.data as { message: string }).message).toContain('POS-2');
  });
});
```
(Look at `promotion-rpc.integration.test.ts` for how it obtains an open shift/staff; the mismatch test must hit the caja guard **before** the shift guard, which it does because the caja check runs first.)

- [ ] **Step 2: Run** `npx vitest run src/entities/caja/model/caja-terminal-rpc.integration.test.ts --project integration` → FAIL (column missing).

- [ ] **Step 3: Write the migration**

```sql
-- Caja per terminal: one open register session per terminal instead of one per database.
BEGIN;

ALTER TABLE caja_sessions
  ADD COLUMN terminal_id text NOT NULL DEFAULT 'POS-1'
  CHECK (terminal_id ~ '^[A-Za-z0-9_-]{1,32}$');

DROP INDEX IF EXISTS caja_sessions_one_open;
CREATE UNIQUE INDEX caja_sessions_one_open_per_terminal
  ON caja_sessions (terminal_id) WHERE status = 'open';
CREATE INDEX idx_caja_sessions_terminal_opened ON caja_sessions (terminal_id, opened_at DESC);

-- caja_open now persists the terminal (previously only forwarded to record_audit).
CREATE OR REPLACE FUNCTION public.caja_open(p_opening_cash numeric, p_opened_by uuid, p_terminal_id text DEFAULT NULL)
RETURNS caja_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller_role TEXT; v_row caja_sessions; v_terminal text;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('manager', 'admin') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Only managers and admins can open the caja.';
  END IF;
  v_terminal := COALESCE(NULLIF(trim(p_terminal_id), ''), 'POS-1');
  INSERT INTO caja_sessions (opening_cash, opened_by, terminal_id)
  VALUES (p_opening_cash, p_opened_by, v_terminal) RETURNING * INTO v_row;
  PERFORM record_audit('caja.open', 'caja_session', v_row.id, NULL, to_jsonb(v_row), 'rpc', v_terminal);
  RETURN v_row;
END; $$;

-- process_direct_sale_atomic: body copied VERBATIM from
-- 20260912000002_platform_tenders_rappi_uber_eats.sql (lines 623-…), with two changes:
--   1. new trailing parameter  p_terminal_id text DEFAULT NULL
--   2. caja guard becomes:
--        SELECT terminal_id INTO v_caja_terminal FROM caja_sessions
--          WHERE id = p_caja_session_id AND status = 'open' FOR UPDATE;
--        IF NOT FOUND THEN RETURN ... 'CAJA_CLOSED' ... END IF;
--        IF p_terminal_id IS NOT NULL AND v_caja_terminal <> p_terminal_id THEN
--          RETURN jsonb_build_object('ok', false, 'code', 'CAJA_CLOSED',
--            'message', 'Caja session belongs to terminal ' || v_caja_terminal);
--        END IF;
--      (declare  v_caja_terminal text;  in DECLARE)
-- Because the signature changes, DROP the 19-arg overload first so PostgREST does not see two.
DROP FUNCTION IF EXISTS public.process_direct_sale_atomic(uuid, uuid, uuid, jsonb, text, text, numeric, numeric, text, jsonb, numeric, text, text, numeric, numeric, text, text, boolean, text);
CREATE OR REPLACE FUNCTION public.process_direct_sale_atomic( …19 existing params… , p_terminal_id text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
  -- full body here
$function$;
REVOKE ALL ON FUNCTION public.process_direct_sale_atomic FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_direct_sale_atomic(uuid, uuid, uuid, jsonb, text, text, numeric, numeric, text, jsonb, numeric, text, text, numeric, numeric, text, text, boolean, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- DOWN (manual): DROP INDEX caja_sessions_one_open_per_terminal; CREATE UNIQUE INDEX caja_sessions_one_open ON caja_sessions (status) WHERE status='open';
-- ALTER TABLE caja_sessions DROP COLUMN terminal_id; re-create caja_open / process_direct_sale_atomic from 20260703000003 / 20260912000002.
```
Check how the existing migration grants EXECUTE on the RPC (grep `GRANT EXECUTE ON FUNCTION public.process_direct_sale_atomic`) and mirror it exactly.

- [ ] **Step 4: Apply + regenerate types** `npx supabase migration up` then `npx supabase gen types typescript --local > src/shared/lib/supabase.types.ts`. Confirm `caja_sessions.Row.terminal_id: string` appears and the RPC `Args` include `p_terminal_id?`.

- [ ] **Step 5: Run the integration test** → PASS. Also `npx vitest run src/entities/promotion/model/promotion-rpc.integration.test.ts --project integration` (sale RPC still works without `p_terminal_id`).

- [ ] **Step 6: Commit** `feat(caja): one open caja per terminal (schema + RPCs)`

---

### Task 3: Edge function + contracts + checkout send terminal id

**Files:**
- Modify: `supabase/functions/process-direct-sale/index.ts` (body schema line ~25: add `terminalId: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/).optional()`; RPC call line ~312: `p_terminal_id: body.data.terminalId ?? null`)
- Modify: `src/shared/lib/edge-function-contracts.ts` (`ProcessDirectSaleRequestSchema` ~line 635: `terminalId: z.string().optional()`)
- Modify: `src/features/checkout-sale/model/useCheckoutSale.ts` (~line 125: `terminalId: getTerminalId()` next to `cajaSessionId`)
- Test: `src/features/checkout-sale/model/useCheckoutSale.test.ts` (add assertion that `callProcessDirectSale` receives `terminalId: 'POS-1'`)

- [ ] **Step 1:** Add the failing assertion in the existing happy-path test (`expect(callProcessDirectSaleMock).toHaveBeenCalledWith(expect.objectContaining({ terminalId: 'POS-1' }))`). Run scoped → FAIL.
- [ ] **Step 2:** Implement the three modifications. Run scoped → PASS. `npm run typecheck && npm run lint`.
- [ ] **Step 3:** Redeploy the edge function locally: `npx supabase functions serve` is not used here — the local stack's edge runtime container reloads from disk; confirm with `docker ps | findstr edge` that `supabase_edge_runtime_*` is Up (if it exited: `docker start supabase_edge_runtime_supermarket-pos-selfhosted`).
- [ ] **Step 4: Commit** `feat(checkout): send terminal id to process-direct-sale`

---

### Task 4: Entity + store: terminal-scoped current caja, duplicate mapping, close reconciliation

**Files:**
- Modify: `src/shared/lib/domain.ts:977-991` (`CajaSessionSchema` add `terminalId: z.string().default('POS-1')`)
- Modify: `src/entities/caja/model/queries.ts` (`mapCajaRow` maps `terminal_id`; `cajaKeys.current = (terminalId) => [...cajaKeys.all, 'current', terminalId]`; `useCurrentCaja` adds `.eq('terminal_id', getTerminalId())`; `useMutationOpenCaja` passes `p_terminal_id: getTerminalId()` and maps Postgres `23505` to `{ code: 'DUPLICATE_ENTRY', message: i18n.t('entities:caja.alreadyOpenOnTerminal', { terminal }) }`; `useMutationCloseCaja` returns `ok(cashReconciliation)` parsed with `CashReconciliationSchema` from the RPC JSON, `Result<CashReconciliation>`)
- Modify: `src/shared/lib/agent/tools/posTools.ts:105-113` (`resolveOpenCajaId`: `.eq('status','open').eq('terminal_id', getTerminalId())`)
- Modify: `src/shared/lib/i18n/locales/{en-US,es-MX}/entities.json` (`caja.alreadyOpenOnTerminal`: "Terminal {{terminal}} already has an open caja" / "La terminal {{terminal}} ya tiene una caja abierta")
- Test: `src/entities/caja/model/queries.test.ts` (extend existing supabase mock pattern)

- [ ] **Step 1: Failing tests** in `queries.test.ts`:
  - `useCurrentCaja filters by status=open AND terminal_id` — assert the chained `.eq` calls include `['terminal_id', 'POS-1']`.
  - `useMutationOpenCaja maps 23505 to DUPLICATE_ENTRY`.
  - `useMutationCloseCaja resolves with the RPC cashReconciliation` (mock rpc returning `{ ok: true, cashReconciliation: { openingCash: 100, cashSales: 50, expectedCash: 150, closingCash: 140, variance: -10 } }`).
- [ ] **Step 2:** Run scoped → FAIL. Implement. Run → PASS. `CajaDashboard.test.tsx`, `useRegisterCajaEntry.test.ts`, `useCheckoutSale.test.ts` still pass.
- [ ] **Step 3: Commit** `feat(caja): terminal-scoped current session, duplicate-open mapping, close reconciliation result`

---

### Task 5: CajaDashboard — terminal badge, post-close summary; CajaReportPanel — terminal in picker

**Files:**
- Modify: `src/widgets/CajaDashboard/CajaDashboard.tsx` (header `Badge` "Terminal {{id}}" using `getTerminalId()`; open dialog subtitle "Opening caja for terminal {{id}}"; `handleCloseCaja` success → `setCloseSummary(result.data)` and render a `Dialog` with a 5-row `dl`: opening cash, cash sales, expected, counted, variance (variance `text-destructive` when `< 0`, `text-success`/muted otherwise) + a Close button; `data-testid="caja-close-summary"` and `data-testid="caja-close-variance"`)
- Modify: `src/widgets/CajaReportPanel/CajaReportPanel.tsx:95-101` (option label appends ` · ${session.terminalId}`) and `useCajaList` mapping (Task 4's `mapCajaRow` already covers it).
- Modify: `src/shared/lib/i18n/locales/{en-US,es-MX}/wPanels.json` → `cajaDashboard.terminalBadge`, `cajaDashboard.openForTerminal`, `cajaDashboard.closeSummary.{title,openingCash,cashSales,expectedCash,countedCash,variance,close}`; `wAdmin.json` if `CajaReportPanel` uses that namespace (check its `useTranslation` call).
- Test: `src/widgets/CajaDashboard/CajaDashboard.test.tsx`

- [ ] **Step 1: Failing tests:** "renders terminal badge POS-1"; "shows close summary with variance after closing" (mock `useMutationCloseCaja` to resolve `ok({...variance:-10})`, click close, fill count, submit, expect `getByTestId('caja-close-variance')` to contain `-$10.00` — use the app's `formatMoney`).
- [ ] **Step 2:** Implement, run scoped → PASS, `npm run lint`.
- [ ] **Step 3: Commit** `feat(caja): terminal badge and post-close reconciliation summary`

---

### Task 6: Settings → Hardware "Terminal ID" field

**Files:**
- Modify: `src/widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.tsx` (new first card "Terminal": `Input` bound to local state initialised from `getTerminalId()`, Save button calls `setTerminalId`, on `ok` → toast success + `queryClient.invalidateQueries({ queryKey: cajaKeys.all })`, on `err` → inline error text; helper text explains it keys this terminal's caja + audit; `data-testid="terminal-id-input"` / `"terminal-id-save"`)
- Modify: `src/shared/lib/i18n/locales/{en-US,es-MX}/settings.json` → `hardware.terminal.{title,label,help,save,saved,invalid}`
- Test: `src/widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.test.tsx`

- [ ] **Step 1: Failing tests:** "saves a valid terminal id to localStorage"; "shows validation error for an invalid id and does not persist".
- [ ] **Step 2:** Implement → PASS. Lint/typecheck.
- [ ] **Step 3: Commit** `feat(settings): per-terminal id configurable on the Hardware tab`

---

### Task 7: E2E `e2e/caja/per-terminal.spec.ts` + helper touch

**Files:**
- Create: `e2e/caja/per-terminal.spec.ts`
- Modify: `e2e/helpers/supabase.ts:169-212` — `openCaja(openingCash, terminalId = 'POS-1')` inserts `terminal_id`; the leftover-close loop already closes every open session regardless of terminal (keep).

- [ ] **Step 1: Write the spec** (uses `test` from `../fixtures`, `loginAs`, `resetTestState`, `getServiceClient`):

```ts
test.describe('caja per terminal', () => {
  test.beforeEach(async () => { await resetTestState(); });

  test('two terminals hold independent open cajas; sale binds to its own terminal', async ({ browser }) => {
    // Terminal A (default POS-1)
    const ctxA = await browser.newContext(); const pageA = await ctxA.newPage();
    await loginAs(pageA, 'manager'); await pageA.goto('/staff');
    await pageA.getByTestId('open-caja-button').click();           // use the real testid/label from CajaDashboard
    await pageA.getByTestId('opening-cash-input').fill('100'); await pageA.getByRole('button', { name: /open/i }).click();
    await expect(pageA.getByTestId('caja-terminal-badge')).toContainText('POS-1');

    // Terminal B
    const ctxB = await browser.newContext(); await ctxB.addInitScript(() => localStorage.setItem('pos.terminal_id', 'POS-2'));
    const pageB = await ctxB.newPage(); await loginAs(pageB, 'manager'); await pageB.goto('/staff');
    await pageB.getByTestId('open-caja-button').click(); await pageB.getByTestId('opening-cash-input').fill('50');
    await pageB.getByRole('button', { name: /open/i }).click();
    await expect(pageB.getByTestId('caja-terminal-badge')).toContainText('POS-2');

    const db = getServiceClient();
    const { data: open } = await db.from('caja_sessions').select('terminal_id').eq('status', 'open');
    expect(open?.map(r => r.terminal_id).sort()).toEqual(['POS-1', 'POS-2']);

    // A sale on POS-2 lands on POS-2's session (reuse the happy-path checkout steps from e2e/checkout/happy-path.spec.ts)
    // ... perform one cash sale on pageB ...
    const { data: sessB } = await db.from('caja_sessions').select('id').eq('terminal_id', 'POS-2').eq('status', 'open').single();
    const { data: tab } = await db.from('tabs').select('caja_session_id').order('created_at', { ascending: false }).limit(1).single();
    expect(tab?.caja_session_id).toBe(sessB?.id);

    // Closing POS-2 leaves POS-1 open; summary dialog shows
    // ... close on pageB, expect getByTestId('caja-close-summary') visible ...
    const { data: stillOpen } = await db.from('caja_sessions').select('terminal_id').eq('status', 'open');
    expect(stillOpen?.map(r => r.terminal_id)).toEqual(['POS-1']);
    await ctxA.close(); await ctxB.close();
  });

  test('second open on the same terminal is refused', async ({ page }) => {
    await openCaja(100);                       // helper, POS-1
    await loginAs(page, 'manager'); await page.goto('/staff');
    await expect(page.getByTestId('open-caja-button')).toBeHidden();   // dashboard already shows open state
  });
});
```
Replace placeholder testids with the real ones found in `CajaDashboard.tsx` / `e2e/caja/session-management.spec.ts` (add `data-testid` attributes where missing — allowed).

- [ ] **Step 2:** Run `npx playwright test e2e/caja/per-terminal.spec.ts e2e/caja/session-management.spec.ts e2e/caja/entries.spec.ts e2e/checkout/happy-path.spec.ts` → all pass. If a failure is not obviously caused by this task after two fix attempts, STOP and report (owner's rule: do not loop on E2E).
- [ ] **Step 3: Commit** `test(caja): per-terminal caja E2E`
