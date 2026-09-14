# Demo Edition + Online Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a license-driven Demo edition of the POS (14-day, feature-locked, upgrade prompts) and everything needed to host the same app as an auto-provisioned online demo at `demo.bola8pos.com`.

**Architecture:** The signed license token gains `plan: 'demo'` and a `features` allow-list; a pure `isFeatureEnabled()` plus a `LockedFeature` wrapper (sibling of `ProtectedAction`) gate ten lock points; a new `start-demo` edge function on the license server self-provisions demo tenants. The web build is the existing Vite bundle without the cargo step, deployed to Firebase Hosting, with a nightly `supabase db reset --linked` + seed workflow.

**Tech Stack:** React 19 + TS strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Zod v4, zustand, react-i18next (`i18next/no-literal-string` is an error in `shared/ui`, `entities`, `features`, `widgets`, `pages`), Vitest, Playwright 1.59, Supabase edge functions (Deno), Firebase Hosting, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-14-demo-edition-and-online-demo-design.md` — read it first; §3 (entitlement model), §5.4 (lock points) and §8 (rulings) are normative.

## Global Constraints

- Work only in this worktree (`feat/demo-edition`) and, for Tasks 10–11, on branch `feat/demo-plan` inside `D:\Projects\Code\pos-license-server`. Never touch `main`/`master`. Never push. Never run `supabase db push` / `functions deploy` against a remote project — local Docker stacks only.
- FSD import direction `app → pages → widgets → features → entities → shared`; `eslint-plugin-boundaries` fails the build on violations. `shared/ui` may import `shared/lib` only. Features never import other features.
- Every user-visible string in `shared/ui`, `entities`, `features`, `widgets`, `pages` goes through `t()`; add keys to **both** `src/shared/lib/i18n/locales/es-MX/*.json` and `en-US/*.json`. es-MX is the primary copy.
- `Result<T>` from `@shared/lib/result` for every async operation; `logger` from `@shared/lib/logger-instance`; no `console.log`; no `any` without a justification comment.
- Never write `prop?: T` for function/mutation inputs — use `prop: T | undefined`. Zod-inferred types may carry `.optional()`.
- Commit after each task with Conventional Commits `<type>(demo): <description>` and the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. `npm run typecheck` and `npm run lint` must pass before each commit (husky is inert in this repo — run them yourself).
- Scoped test runs while iterating (`npx vitest run <file>`, `npx playwright test <spec>`); the full sweeps are Task 15.
- Node modules are a junction to the main checkout; do not run `npm ci`/`npm install`. `.env.local` (local Supabase 127.0.0.1:54321 + E2E creds) is present but unreadable by tools; Playwright and `tsx` load it fine.
- Local POS Supabase stack is already running on 54321. Local license-server stack (55321) is **not** running; Task 11 starts it.

---

## File map

**Create**
- `src/shared/lib/license/features.ts` (+ `.test.ts`) — `FEATURE_KEYS`, `isFeatureEnabled`, `isFeatureEnabledNow`, `useFeature`
- `src/shared/lib/license/demo-accounts.ts` — `DEMO_STAFF`
- `src/shared/lib/license/upgrade-dialog-store.ts` — zustand store opened by `LockedFeature`
- `src/shared/ui/LockedFeature.tsx` (+ `.test.tsx`), `src/shared/ui/FeatureLockedPage.tsx`
- `src/features/upgrade-license/{index.ts,ui/UpgradeDialog.tsx,ui/UpgradeDialog.test.tsx}`
- `src/app/DemoBar.tsx`, `src/pages/login/DemoLoginHint.tsx`
- `scripts/seed-demo.ts`
- `firebase.json`, `.firebaserc`, `.github/workflows/deploy-demo.yml`, `.github/workflows/reset-demo.yml`, `docs/online-demo.md`
- `playwright.license.config.ts`, `e2e/helpers/license-keys.ts`, `e2e/helpers/license-tokens.ts`, `e2e/license/{demo-start,demo-locks,demo-auto-start,paid-license}.spec.ts`
- license-server: `supabase/migrations/20260914000001_demo_plan.sql`, `20260914000002_demo_tenant_features.sql`, `supabase/functions/start-demo/index.ts`, `scripts/smoke-start-demo.mjs`

**Modify**
- `src/shared/lib/license/{types,token,token.test,config,client,actions,store}.ts`
- `src/app/{App,LicenseGate,audit-route,edit-history-route}.tsx`, `src/widgets/AppShell/ui/{AppShell,Sidebar}.tsx`, `src/widgets/HomeDashboard/ui/HomeDashboard.tsx`, `src/shared/config/navigation.ts`
- `src/features/activate-license/ui/LicenseActivationForm.tsx`, `src/widgets/SettingsTabsPanel/tabs/LicenseSettingsTab.tsx`, `src/pages/login/index.tsx`
- Lock points: `src/features/export-report/ui/ExportButtons.tsx`, `src/widgets/BankTransfersList/index.tsx`, `src/features/agent-chat/ui/AgentButton.tsx`, `src/features/process-payment/ui/EmailReceiptDialog.tsx`, `src/widgets/SettingsTabsPanel/tabs/{EmailReceiptsSettingsTab,BackupSettingsTab}.tsx`, `src/features/create-staff/ui/CreateStaffDialog.tsx`, `src/features/edit-staff-role/ui/EditRoleDialog.tsx`, `src/features/edit-staff-locale/ui/EditLocaleDialog.tsx`, `src/features/admin-reset-pin/ui/AdminResetPinDialog.tsx`, `src/widgets/RBACDashboard/PermissionMatrix.tsx`, `src/pages/promotions/index.tsx`, `src/features/create-purchase-order/ui/PurchaseOrderForm.tsx`, `src/features/receive-shipment/ui/ReceiveShipmentForm.tsx`
- Receipts: `src/shared/lib/receipt-format.ts` (+ test), `src/shared/lib/exporters/receipt-pdf.tsx`, `src/shared/lib/email-receipt.ts`, `src/shared/lib/pos-printer.ts`, `src/features/process-payment/ui/ReceiptPreview.tsx`
- i18n: `common.json`, `featMgmt.json`, `settings.json`, `wPanels.json`, `pages.json`, `receipt.json` in both locales
- `package.json` scripts, `src/shared/ui/index.ts`
- license-server: `supabase/functions/_shared/license.ts`, `supabase/functions/activate/index.ts`, `portal/src/{lib.ts,pages/Tenants.tsx,pages/TenantDetail.tsx}`

---

### Task 1: Token types + evaluation (`demo` plan, `features`, `demo_expired`)

**Files:**
- Modify: `src/shared/lib/license/types.ts`, `src/shared/lib/license/token.ts`
- Test: `src/shared/lib/license/token.test.ts`

**Interfaces:**
- Produces: `LicensePlan` now includes `'demo'`; `LicensePayload.features?: string[] | null`; `LicenseLockReason` includes `'demo_expired'`; `SUBSCRIPTION_WARN_DAYS.demo === 0`.

- [ ] **Step 1: Add failing tests** to `token.test.ts` (inside the existing `describe('evaluateLicense')` block, using the existing `payload()` / `iso()` helpers):

```ts
it('demo plan past period_end locks with demo_expired regardless of grace', () => {
  expect(
    evaluateLicense(payload({ plan: 'demo', period_end: iso(-1), grace_days: 0 }), NOW)
  ).toEqual({ state: 'locked', reason: 'demo_expired' });
  expect(
    evaluateLicense(payload({ plan: 'demo', period_end: iso(-1), grace_days: 7 }), NOW)
  ).toEqual({ state: 'locked', reason: 'demo_expired' });
});

it('demo plan inside its period is active with no subscription warning', () => {
  expect(evaluateLicense(payload({ plan: 'demo', period_end: iso(2), grace_days: 0 }), NOW))
    .toEqual({ state: 'active' });
});

it('decodeToken accepts a payload carrying a features allow-list', () => {
  const p = { ...payload(), features: ['promotions'] };
  const token = `${b64url(Buffer.from(JSON.stringify(p)))}.${b64url(Buffer.from('sig'))}`;
  const res = decodeToken(token);
  expect(res.ok && res.data.features).toEqual(['promotions']);
});
```

- [ ] **Step 2: Run** `npx vitest run src/shared/lib/license/token.test.ts` — expect the three new tests to FAIL (schema rejects `'demo'`; reason mismatch).

- [ ] **Step 3: Implement.** In `types.ts`:

```ts
export const LicensePlanSchema = z.enum(['monthly', 'yearly', 'lifetime', 'demo']);
// inside LicensePayloadSchema, after max_terminals:
  /** Entitlement allow-list. null/absent = every feature enabled (paid plans). */
  features: z.array(z.string()).nullable().optional(),
// LicenseLockReason: add
  | 'demo_expired'; // plan === 'demo' and period_end passed (grace is 0 for demos)
```

In `token.ts`: `SUBSCRIPTION_WARN_DAYS` gets `demo: 0`; in `evaluateLicense`, inside the `period_end !== null` branch, before the grace computation:

```ts
    if (periodDays < 0 && payload.plan === 'demo') {
      return { state: 'locked', reason: 'demo_expired' };
    }
```

- [ ] **Step 4: Run** the test file again — all PASS. Run `npm run typecheck`; fix any exhaustiveness errors (`LicenseSettingsTab` uses `t(\`license.planName.${payload.plan}\`)` — fine; `i18n` keys come in Task 7).

- [ ] **Step 5: Commit** `feat(demo): add demo plan, features allow-list and demo_expired lock reason`.

---

### Task 2: Entitlements module + upgrade-dialog store + demo accounts

**Files:**
- Create: `src/shared/lib/license/features.ts`, `src/shared/lib/license/features.test.ts`, `src/shared/lib/license/upgrade-dialog-store.ts`, `src/shared/lib/license/demo-accounts.ts`
- Modify: `src/shared/lib/license/config.ts`

**Interfaces (Produces):**
```ts
export const FEATURE_KEYS: readonly ['report_export','ai_assistant','email_receipts','settings_backup','audit_log','edit_history','staff_management','rbac_editing','promotions','purchase_orders'];
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export function isFeatureEnabled(key: FeatureKey, payload: LicensePayload | null, enforced: boolean): boolean;
export function isFeatureEnabledNow(key: FeatureKey): boolean;          // reads store + config
export function useFeature(key: FeatureKey): { enabled: boolean; locked: boolean; requestUpgrade: () => void };
export function isDemoPlan(payload: LicensePayload | null): boolean;    // payload?.plan === 'demo'
export function useIsDemo(): boolean;                                   // enforced && plan === 'demo'
// upgrade-dialog-store.ts
export const useUpgradeDialogStore: UseBoundStore<StoreApi<{ open: boolean; feature: FeatureKey | null; openFor: (feature?: FeatureKey) => void; close: () => void }>>;
// demo-accounts.ts
export const DEMO_STAFF: readonly { name: string; role: 'admin' | 'manager' | 'cashier'; pin: string }[];
// config.ts additions
export function isDemoAutoStart(): boolean;              // VITE_DEMO_AUTO_START === 'true' | '1'
export const DEMO_CONTACT: { site: string; email: string }; // VITE_DEMO_CONTACT_URL / VITE_DEMO_CONTACT_EMAIL, defaults https://bola8pos.com / hola@bola8pos.com
```

- [ ] **Step 1: Write `features.test.ts`** (pure function only — the hook is covered by `LockedFeature.test.tsx` in Task 3):

```ts
import { describe, expect, it } from 'vitest';
import { FEATURE_KEYS, isFeatureEnabled } from './features';
import type { LicensePayload } from './types';

const base: LicensePayload = {
  v: 1, tenant_id: 't', tenant_slug: 's', tenant_name: 'n', terminal_id: 'x', plan: 'monthly',
  status: 'active', period_end: null, grace_days: 0, updates_until: null, max_terminals: 1,
  issued_at: '2026-09-14T00:00:00Z', lease_until: '2026-11-14T00:00:00Z',
};

describe('isFeatureEnabled', () => {
  it('is always true when enforcement is off', () => {
    expect(isFeatureEnabled('report_export', null, false)).toBe(true);
    expect(isFeatureEnabled('report_export', { ...base, features: [] }, false)).toBe(true);
  });
  it('is false with no payload when enforced', () => {
    expect(isFeatureEnabled('report_export', null, true)).toBe(false);
  });
  it('treats absent/null features as unlimited', () => {
    for (const key of FEATURE_KEYS) {
      expect(isFeatureEnabled(key, base, true)).toBe(true);
      expect(isFeatureEnabled(key, { ...base, features: null }, true)).toBe(true);
    }
  });
  it('allows only listed keys when features is an array (fail closed)', () => {
    const demo: LicensePayload = { ...base, plan: 'demo', features: ['promotions', 'unknown_key'] };
    expect(isFeatureEnabled('promotions', demo, true)).toBe(true);
    expect(isFeatureEnabled('report_export', demo, true)).toBe(false);
    expect(isFeatureEnabled('purchase_orders', demo, true)).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/shared/lib/license/features.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement `features.ts`:**

```ts
import { useCallback } from 'react';
import { isLicenseEnforced } from './config';
import { useLicenseStore } from './store';
import type { LicensePayload } from './types';
import { useUpgradeDialogStore } from './upgrade-dialog-store';

/** Gate-able capabilities. The license token's `features` array is an allow-list over these. */
export const FEATURE_KEYS = [
  'report_export',
  'ai_assistant',
  'email_receipts',
  'settings_backup',
  'audit_log',
  'edit_history',
  'staff_management',
  'rbac_editing',
  'promotions',
  'purchase_orders',
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** Pure policy — see spec §3.2. Unknown keys in the allow-list are ignored; missing keys are locked. */
export function isFeatureEnabled(
  key: FeatureKey,
  payload: LicensePayload | null,
  enforced: boolean
): boolean {
  if (!enforced) return true;
  if (!payload) return false;
  const features = payload.features;
  if (features === null || features === undefined) return true;
  return features.includes(key);
}

export function isDemoPlan(payload: LicensePayload | null): boolean {
  return payload?.plan === 'demo';
}

/** Non-hook variant for module-level guards. */
export function isFeatureEnabledNow(key: FeatureKey): boolean {
  return isFeatureEnabled(key, useLicenseStore.getState().payload, isLicenseEnforced());
}

export function useIsDemo(): boolean {
  const payload = useLicenseStore(s => s.payload);
  return isLicenseEnforced() && isDemoPlan(payload);
}

export function useFeature(key: FeatureKey): {
  enabled: boolean;
  locked: boolean;
  requestUpgrade: () => void;
} {
  const payload = useLicenseStore(s => s.payload);
  const openFor = useUpgradeDialogStore(s => s.openFor);
  const enabled = isFeatureEnabled(key, payload, isLicenseEnforced());
  const requestUpgrade = useCallback(() => {
    openFor(key);
  }, [openFor, key]);
  return { enabled, locked: !enabled, requestUpgrade };
}
```

`upgrade-dialog-store.ts`:

```ts
import { create } from 'zustand';
import type { FeatureKey } from './features';

interface UpgradeDialogState {
  open: boolean;
  /** Which locked feature the user tapped, for the "«X» is available in the full version" line. */
  feature: FeatureKey | null;
  openFor: (feature?: FeatureKey) => void;
  close: () => void;
}

/** Lives in shared/lib so shared/ui (LockedFeature) can open the dialog mounted from features/. */
export const useUpgradeDialogStore = create<UpgradeDialogState>(set => ({
  open: false,
  feature: null,
  openFor: feature => {
    set({ open: true, feature: feature ?? null });
  },
  close: () => {
    set({ open: false, feature: null });
  },
}));
```

(Import cycle check: `features.ts` imports `upgrade-dialog-store.ts` which imports only the type `FeatureKey` — `import type`, so no runtime cycle.)

`demo-accounts.ts`:

```ts
/**
 * Shared demo staff — the ONLY place their names/PINs are defined. `scripts/seed-demo.ts`
 * creates them and `pages/login/DemoLoginHint` displays them. Plain-Node-importable: no
 * React, no Vite env, no path aliases.
 */
export const DEMO_STAFF = [
  { name: 'Ana Admin', role: 'admin', pin: '0000' },
  { name: 'Luis Gerente', role: 'manager', pin: '1111' },
  { name: 'Sofía Cajera', role: 'cashier', pin: '2222' },
] as const satisfies readonly { name: string; role: 'admin' | 'manager' | 'cashier'; pin: string }[];
```

`config.ts` additions (append):

```ts
/** Online-demo build: the gate self-provisions a demo instead of asking for a key. */
export function isDemoAutoStart(): boolean {
  const flag = import.meta.env.VITE_DEMO_AUTO_START?.trim().toLowerCase();
  return flag === 'true' || flag === '1';
}

/** Where the upgrade dialog sends prospects. */
export const DEMO_CONTACT = {
  site: import.meta.env.VITE_DEMO_CONTACT_URL?.trim() || 'https://bola8pos.com',
  email: import.meta.env.VITE_DEMO_CONTACT_EMAIL?.trim() || 'hola@bola8pos.com',
} as const;
```

Add `VITE_DEMO_AUTO_START`, `VITE_DEMO_CONTACT_URL`, `VITE_DEMO_CONTACT_EMAIL` to the `ImportMetaEnv` declaration (find it with `grep -rn "VITE_LICENSE_ENFORCE" src/*.d.ts src/**/*.d.ts`; if there is none, `import.meta.env.X` is already typed as `string | undefined` and nothing is needed).

- [ ] **Step 4: Run** tests → PASS; `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(demo): entitlement policy, upgrade-dialog store, shared demo accounts`.

---

### Task 3: `LockedFeature` + `FeatureLockedPage` (shared/ui) + i18n feature labels

**Files:**
- Create: `src/shared/ui/LockedFeature.tsx`, `src/shared/ui/LockedFeature.test.tsx`, `src/shared/ui/FeatureLockedPage.tsx`
- Modify: `src/shared/ui/index.ts` (export both), `src/shared/lib/i18n/locales/{es-MX,en-US}/common.json`

**Interfaces (Produces):**
```tsx
<LockedFeature feature={FeatureKey} disabled?: boolean>{oneReactElement}</LockedFeature>
<FeatureLockedPage feature={FeatureKey} />
```
Test ids: wrapper `data-testid="locked-feature"` `data-feature={key}`; page `data-testid="feature-locked-page"`.

- [ ] **Step 1: i18n keys** — add to `common.json` (both locales) under `license`:

```jsonc
"features": {
  "report_export": "Exportar reportes (CSV/PDF)",      // en: "Report export (CSV/PDF)"
  "ai_assistant": "Asistente con IA",                  // en: "AI assistant"
  "email_receipts": "Tickets por correo",              // en: "Email receipts"
  "settings_backup": "Respaldo y restauración",        // en: "Backup & restore"
  "audit_log": "Bitácora de auditoría",                // en: "Audit log"
  "edit_history": "Historial de ediciones",            // en: "Edit history"
  "staff_management": "Gestión de personal",           // en: "Staff management"
  "rbac_editing": "Permisos por rol",                  // en: "Role permissions"
  "promotions": "Promociones",                         // en: "Promotions"
  "purchase_orders": "Órdenes de compra"               // en: "Purchase orders"
},
"locked": {
  "tooltip": "Disponible en la versión completa",      // en: "Available in the full version"
  "pageTitle": "{{feature}} está en la versión completa", // en: "{{feature}} is part of the full version"
  "pageBody": "Estás usando la versión demo. Obtén una licencia para desbloquear esta función y conservar tus datos.", // en: "You are on the demo version. Get a license to unlock this feature and keep your data."
  "cta": "Obtener la versión completa"                 // en: "Get the full version"
}
```

- [ ] **Step 2: Write `LockedFeature.test.tsx`** (pattern: look at `src/shared/ui/ProtectedAction.test.tsx` if it exists, else `src/shared/lib/test-setup.ts` is the RTL setup; mock `@shared/lib/license/features`):

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUpgradeDialogStore } from '@shared/lib/license/upgrade-dialog-store';
import { LockedFeature } from './LockedFeature';

const featureState = { enabled: true };
vi.mock('@shared/lib/license/features', async importOriginal => {
  const actual = await importOriginal<typeof import('@shared/lib/license/features')>();
  return {
    ...actual,
    useFeature: (key: string) => ({
      enabled: featureState.enabled,
      locked: !featureState.enabled,
      requestUpgrade: () => useUpgradeDialogStore.getState().openFor(key as never),
    }),
  };
});

describe('LockedFeature', () => {
  beforeEach(() => {
    featureState.enabled = true;
    useUpgradeDialogStore.getState().close();
  });

  it('renders the child untouched when enabled', () => {
    render(<LockedFeature feature="report_export"><button type="button">Export</button></LockedFeature>);
    expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled();
    expect(screen.queryByTestId('locked-feature')).toBeNull();
  });

  it('disables the child and opens the upgrade dialog on click when locked', () => {
    featureState.enabled = false;
    render(<LockedFeature feature="report_export"><button type="button">Export</button></LockedFeature>);
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
    fireEvent.click(screen.getByTestId('locked-feature'));
    expect(useUpgradeDialogStore.getState()).toMatchObject({ open: true, feature: 'report_export' });
  });

  it('merges an explicit disabled prop when enabled', () => {
    render(<LockedFeature feature="report_export" disabled><button type="button">Export</button></LockedFeature>);
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
  });
});
```

- [ ] **Step 3: Run** → FAIL. **Step 4: Implement `LockedFeature.tsx`** mirroring `ProtectedAction.tsx`:

```tsx
import { Lock } from 'lucide-react';
import { cloneElement, isValidElement, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useFeature, type FeatureKey } from '@shared/lib/license/features';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

export type LockedFeatureProps = {
  feature: FeatureKey;
  /** Extra disable combined with the entitlement via OR (same contract as ProtectedAction). */
  disabled?: boolean;
  children: ReactNode;
};

function isReactElement(node: ReactNode): node is ReactElement<{ disabled?: boolean }> {
  return isValidElement(node);
}

/**
 * Entitlement gate for one control. Enabled → renders the child (merging `disabled`).
 * Locked (demo / plan without this feature) → child disabled + lock badge + tooltip; tapping
 * the wrapper opens the global UpgradeDialog for this feature.
 */
export function LockedFeature({ feature, disabled = false, children }: LockedFeatureProps) {
  const { t } = useTranslation('common');
  const { enabled, requestUpgrade } = useFeature(feature);

  if (!isReactElement(children)) return <>{children}</>;

  const mergedDisabled = Boolean(disabled || children.props.disabled);
  if (enabled) {
    return mergedDisabled === Boolean(children.props.disabled)
      ? children
      : cloneElement(children, { disabled: mergedDisabled });
  }

  const onKey = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      requestUpgrade();
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="button"
            tabIndex={0}
            aria-label={`${t(`license.features.${feature}`)} — ${t('license.locked.tooltip')}`}
            data-testid="locked-feature"
            data-feature={feature}
            className="relative inline-flex max-w-full cursor-pointer"
            onClick={requestUpgrade}
            onKeyDown={onKey}
          >
            {cloneElement(children, { disabled: true })}
            <Lock
              aria-hidden="true"
              className="pointer-events-none absolute -top-1 -right-1 size-3.5 rounded-full bg-warning p-0.5 text-warning-foreground"
            />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{t('license.locked.tooltip')}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
```

`FeatureLockedPage.tsx`:

```tsx
import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type FeatureKey } from '@shared/lib/license/features';
import { useUpgradeDialogStore } from '@shared/lib/license/upgrade-dialog-store';
import { EmptyState } from './EmptyState';
import { POSButton } from './POSButton';

/** Full-page replacement for a route whose feature is not in the license. */
export function FeatureLockedPage({ feature }: { feature: FeatureKey }) {
  const { t } = useTranslation('common');
  const openFor = useUpgradeDialogStore(s => s.openFor);
  const label = t(`license.features.${feature}`);
  return (
    <div className="flex flex-1 items-center justify-center p-8" data-testid="feature-locked-page" data-feature={feature}>
      <EmptyState
        icon={Lock}
        title={t('license.locked.pageTitle', { feature: label })}
        description={t('license.locked.pageBody')}
        action={
          <POSButton type="button" touchSize="large" onClick={() => { openFor(feature); }}>
            {t('license.locked.cta')}
          </POSButton>
        }
      />
    </div>
  );
}
```

Check `EmptyState`'s actual prop names (`src/shared/ui/EmptyState.tsx`) and adapt (`icon`/`title`/`description`/`action` are the expected names; if it differs, follow the component). Export both from `src/shared/ui/index.ts` under `// Display`.

- [ ] **Step 5: Run** test → PASS; `npm run lint` (the aria-label template above is composed of `t()` results only — if the literal-string rule still flags the `—`, build the label with `t('license.locked.ariaLabel', { feature })` and add that key: es `"{{feature}} — disponible en la versión completa"`, en `"{{feature}} — available in the full version"`).
- [ ] **Step 6: Commit** `feat(demo): LockedFeature and FeatureLockedPage entitlement gates`.

---

### Task 4: Client + actions (`start-demo`, terminal reset)

**Files:**
- Modify: `src/shared/lib/license/client.ts`, `src/shared/lib/license/actions.ts`, `src/shared/lib/license/terminal-id.ts`
- Test: `src/shared/lib/license/actions.test.ts` (create)

**Interfaces (Produces):**
```ts
// client.ts
export function startDemo(): Promise<Result<{ token: string; license_key: string }, LicenseServerError>>;
export const DEMO_ERROR_CODES = new Set(['DEMO_ALREADY_USED', 'RATE_LIMITED']);
// actions.ts
export async function startDemoTrial(): Promise<Result<LicensePayload>>;
export async function resetTerminalForNewDemo(): Promise<Result<LicensePayload>>; // clears terminal id + license, then startDemoTrial()
// terminal-id.ts
export function resetTerminalId(): string; // removes the stored id and mints a new one
```

- [ ] **Step 1: Test** `actions.test.ts` — mock `./client` and `./token`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  startDemo: vi.fn(),
  activateLicense: vi.fn(),
  heartbeatLicense: vi.fn(),
  FATAL_LICENSE_CODES: new Set<string>(),
  DEMO_ERROR_CODES: new Set(['DEMO_ALREADY_USED', 'RATE_LIMITED']),
}));
vi.mock('./token', async importOriginal => ({
  ...(await importOriginal<typeof import('./token')>()),
  verifyToken: vi.fn(),
}));

import { startDemo } from './client';
import { verifyToken } from './token';
import { resetTerminalForNewDemo, startDemoTrial } from './actions';
import { useLicenseStore } from './store';
import { getTerminalId } from './terminal-id';

const payloadFor = (terminal_id: string) => ({
  v: 1 as const, tenant_id: 't', tenant_slug: 'demo-1', tenant_name: 'Demo', terminal_id,
  plan: 'demo' as const, status: 'active' as const, period_end: '2026-09-28T00:00:00Z',
  grace_days: 0, updates_until: null, max_terminals: 1, features: ['promotions'],
  issued_at: '2026-09-14T00:00:00Z', lease_until: '2026-09-28T00:00:00Z',
});

describe('startDemoTrial', () => {
  beforeEach(() => {
    localStorage.clear();
    useLicenseStore.getState().clearLicense(null);
  });

  it('stores the token and the demo license key so heartbeats work', async () => {
    vi.mocked(startDemo).mockResolvedValue({ ok: true, data: { token: 'tok', license_key: 'DEMO-KEY' } });
    vi.mocked(verifyToken).mockResolvedValue({ ok: true, data: payloadFor(getTerminalId()) });
    const res = await startDemoTrial();
    expect(res.ok).toBe(true);
    expect(useLicenseStore.getState()).toMatchObject({ token: 'tok', licenseKey: 'DEMO-KEY' });
  });

  it('resetTerminalForNewDemo mints a new terminal id before re-provisioning', async () => {
    const before = getTerminalId();
    vi.mocked(startDemo).mockImplementation(async () => ({ ok: true, data: { token: 'tok2', license_key: 'K2' } }));
    vi.mocked(verifyToken).mockImplementation(async () => ({ ok: true, data: payloadFor(getTerminalId()) }));
    const res = await resetTerminalForNewDemo();
    expect(res.ok).toBe(true);
    expect(getTerminalId()).not.toBe(before);
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** In `client.ts` generalise `post` to `path: 'activate' | 'heartbeat' | 'start-demo'` and to return `{ token: string; license_key?: string }` (parse `json.license_key` when it is a string), then:

```ts
/** Server codes for a refused self-service demo — shown verbatim-mapped in the gate. */
export const DEMO_ERROR_CODES = new Set(['DEMO_ALREADY_USED', 'RATE_LIMITED']);

/** Self-provision a 14-day demo tenant bound to this terminal (spec §4.4). */
export async function startDemo(): Promise<Result<{ token: string; license_key: string }, LicenseServerError>> {
  const res = await post('start-demo', { ...telemetry(), terminal_name: getTerminalName() });
  if (!res.ok) return res;
  if (!res.data.license_key) {
    return err({ code: 'LICENSE_ERROR', message: 'Demo server response is missing license_key', serverCode: null });
  }
  return ok({ token: res.data.token, license_key: res.data.license_key });
}
```

`terminal-id.ts`:

```ts
/** Web demo only: forget this browser's terminal so the server issues a fresh demo. */
export function resetTerminalId(): string {
  try { localStorage.removeItem(TERMINAL_ID_KEY); } catch { /* memory fallback below */ }
  _memoryFallbackId = null;
  return getTerminalId();
}
```

`actions.ts`:

```ts
export async function startDemoTrial(): Promise<Result<LicensePayload>> {
  const res = await startDemo();
  if (!res.ok) return err(res.error);
  const applied = await applyToken(res.data.token, res.data.license_key);
  if (applied.ok) {
    useLicenseStore.getState().markHeartbeat();
    logger.info('license.demo_started', { tenant: applied.data.tenant_slug, until: applied.data.period_end });
  }
  return applied;
}

/** Online demo: an expired/used terminal is throwaway — mint a new id and start over. */
export async function resetTerminalForNewDemo(): Promise<Result<LicensePayload>> {
  useLicenseStore.getState().clearLicense(null);
  useLicenseStore.getState().setLicenseKey(null);
  resetTerminalId();
  return startDemoTrial();
}
```

Add `setLicenseKey: (key: string | null) => void` to the store (`set({ licenseKey: key })`).

- [ ] **Step 4: Run** → PASS; typecheck; lint. **Step 5: Commit** `feat(demo): start-demo client, startDemoTrial and terminal reset actions`.

---

### Task 5: Gate + activation form ("Try it free"), auto-start, demo copy

**Files:**
- Modify: `src/app/LicenseGate.tsx`, `src/features/activate-license/ui/LicenseActivationForm.tsx`, `src/shared/lib/i18n/locales/{es-MX,en-US}/{common,featMgmt}.json`

- [ ] **Step 1: i18n.** `common.json` → `license.gate.reason.demo_expired`: es `"Tu demo de 14 días terminó. Obtén una licencia para conservar tus datos y desbloquear todo."`, en `"Your 14-day demo has ended. Get a license to keep your data and unlock everything."`. `common.json` → `license.gate.preparingDemo`: es `"Preparando tu demo…"`, en `"Preparing your demo…"`. `featMgmt.json` → under `activateLicense`:

```jsonc
"demoHeading": "¿Quieres probarlo primero?",          // en: "Want to try it first?"
"demoBody": "Usa la versión demo 14 días. Algunas funciones avanzadas están bloqueadas.", // en: "Use the demo version for 14 days. Some advanced features are locked."
"startDemo": "Probar gratis 14 días",                  // en: "Try it free for 14 days"
"startingDemo": "Creando tu demo…",                    // en: "Creating your demo…"
"demoStarted": "Demo lista — vence el {{date}}",       // en: "Demo ready — ends on {{date}}"
"demoError": {
  "DEMO_ALREADY_USED": "Este equipo ya usó su demo. Obtén una licencia para continuar.", // en: "This computer already used its demo. Get a license to continue."
  "RATE_LIMITED": "Demasiadas demos desde esta red hoy. Intenta más tarde.",             // en: "Too many demos from this network today. Try again later."
  "NETWORK_OFFLINE": "Sin conexión — se necesita internet para crear la demo."          // en: "Offline — an internet connection is needed to create the demo."
}
```

- [ ] **Step 2: `LicenseActivationForm`** — add prop `showDemo: boolean | undefined` (default `true`; the Settings tab passes `false`). Below the offline toggle, when `showDemo`:

```tsx
{showDemo && (
  <section className="space-y-2 rounded-xl border border-dashed border-border p-4" data-testid="start-demo-section">
    <p className="text-sm font-medium">{t('activateLicense.demoHeading')}</p>
    <p className="text-xs text-muted-foreground">{t('activateLicense.demoBody')}</p>
    <POSButton type="button" variant="secondary" touchSize="large" disabled={busy} data-testid="start-demo-button"
      onClick={() => void startDemoClick()}>
      {busy ? t('activateLicense.startingDemo') : t('activateLicense.startDemo')}
    </POSButton>
  </section>
)}
```

with

```tsx
const startDemoClick = async () => {
  setBusy(true); setError(null);
  const res = await startDemoTrial();
  setBusy(false);
  if (!res.ok) {
    const code = 'serverCode' in res.error && typeof res.error.serverCode === 'string' ? res.error.serverCode : res.error.code;
    setError(t(`activateLicense.demoError.${code}`, { defaultValue: res.error.message }));
    return;
  }
  toast.success(t('activateLicense.demoStarted', { date: new Date(res.data.period_end ?? '').toLocaleDateString() }));
  onDone?.();
};
```

(`serverCode` is on `LicenseServerError`; `startDemoTrial` returns `Result<LicensePayload>` whose error is `AppError` — carry the code through by having `startDemoTrial` return `err({ ...res.error })` so `serverCode` survives as an extra property; the `'serverCode' in` check keeps TS happy.)

- [ ] **Step 3: `LicenseGate`** — auto-start branch. At the top of the component, after `evaluation`:

```tsx
const autoStart = isDemoAutoStart();
const [autoState, setAutoState] = useState<'idle' | 'running' | 'failed'>('idle');
useEffect(() => {
  if (!autoStart || evaluation.state !== 'locked' || autoState !== 'idle') return;
  if (evaluation.reason !== 'unlicensed' && evaluation.reason !== 'demo_expired' && evaluation.reason !== 'invalid') return;
  setAutoState('running');
  const run = evaluation.reason === 'unlicensed' ? startDemoTrial : resetTerminalForNewDemo;
  void run().then(res => {
    if (res.ok) return;
    const code = 'serverCode' in res.error ? String(res.error.serverCode) : '';
    if (code === 'DEMO_ALREADY_USED' && evaluation.reason === 'unlicensed') {
      void resetTerminalForNewDemo().then(r => { setAutoState(r.ok ? 'idle' : 'failed'); });
      return;
    }
    setAutoState('failed');
  });
}, [autoStart, evaluation, autoState]);
```

While `autoState === 'running'` render a centered `LoadingSpinner` + `t('license.gate.preparingDemo')` (`data-testid="license-gate-preparing"`). When `failed`, fall through to the normal gate (the form shows `lastError`). Gate copy for `demo_expired` uses the new key; hide the "Try it free" section when `evaluation.reason === 'demo_expired'` or `'suspended'` (`showDemo={evaluation.reason === 'unlicensed' || evaluation.reason === 'invalid'}`).

- [ ] **Step 4:** `npm run typecheck && npm run lint`; run `npx vitest run src/app` (LicenseGate has no test today — add `src/app/LicenseGate.test.tsx` with one case: enforcement on (mock `isLicenseEnforced` → true), no payload → renders `start-demo-button`; and one case with `isDemoAutoStart` → true → renders `license-gate-preparing` and calls `startDemoTrial` once (mock `@shared/lib/license/actions`)).
- [ ] **Step 5: Commit** `feat(demo): try-it-free demo activation and online-demo auto-start gate`.

---

### Task 6: Demo chrome — `DemoBar`, `UpgradeDialog`, login hint, Settings › License

**Files:**
- Create: `src/app/DemoBar.tsx`, `src/features/upgrade-license/index.ts`, `src/features/upgrade-license/ui/UpgradeDialog.tsx`, `src/features/upgrade-license/ui/UpgradeDialog.test.tsx`, `src/pages/login/DemoLoginHint.tsx`
- Modify: `src/app/App.tsx`, `src/widgets/AppShell/ui/AppShell.tsx`, `src/pages/login/index.tsx`, `src/widgets/SettingsTabsPanel/tabs/LicenseSettingsTab.tsx`, i18n `common.json`, `featMgmt.json`, `settings.json`, `pages.json`

- [ ] **Step 1: i18n.**
  - `common.json` → `license.plan.demo`: es `"Demo"`, en `"Demo"`; `license.demo.bar`: es `"DEMO · {{count}} día restante"` / plural `"DEMO · {{count}} días restantes"` (use i18next plural keys `bar_one`/`bar_other`), en `"DEMO · {{count}} day left"`/`"DEMO · {{count}} days left"`; `license.demo.cta`: es `"Obtener la versión completa"`, en `"Get the full version"`.
  - `featMgmt.json` → `upgradeLicense`: `title` es `"Desbloquea la versión completa"` / en `"Unlock the full version"`; `featureLine` es `"«{{feature}}» está disponible en la versión completa."` / en `"“{{feature}}” is available in the full version."`; `intro` es `"Todo lo que ya usas en la demo, sin límites, con tus datos y actualizaciones incluidas."` / en `"Everything you use in the demo, without limits, with your data and updates included."`; `plans.monthly` es `"Mensual — $500 MXN"`, `plans.yearly` es `"Anual — $5,000 MXN"`, `plans.lifetime` es `"De por vida — $15,000 MXN (4 años de actualizaciones)"` (en: "Monthly — $500 MXN", "Yearly — $5,000 MXN", "Lifetime — $15,000 MXN (4 years of updates)"); `includes` es `"Incluye"` / en `"Includes"`; `contact` es `"Contactar ventas"` / en `"Contact sales"`; `haveKey` es `"Ya tengo una clave"` / en `"I already have a key"`; `close` es `"Seguir con la demo"` / en `"Continue the demo"`.
  - `pages.json` → `login.demoHint.title` es `"Cuentas de prueba"` / en `"Demo accounts"`; `login.demoHint.pin` es `"PIN {{pin}}"` / en `"PIN {{pin}}"`; `login.demoHint.role.admin|manager|cashier` es `"Administrador"|"Gerente"|"Cajero"` / en `"Admin"|"Manager"|"Cashier"`.
  - `settings.json` → `license.planName.demo` es `"Demo (14 días)"` / en `"Demo (14 days)"`; `license.getFull` es `"Obtener la versión completa"` / en `"Get the full version"`; `license.demoEnds` es `"La demo termina"` / en `"Demo ends"`.

- [ ] **Step 2: `UpgradeDialog.tsx`** (Radix `Dialog` from `@shared/ui/dialog` — check the file exists; `PromotionDialog.tsx` shows the pattern in use):

```tsx
import { ExternalLink, KeyRound, Mail } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DEMO_CONTACT } from '@shared/lib/license/config';
import { FEATURE_KEYS } from '@shared/lib/license/features';
import { useUpgradeDialogStore } from '@shared/lib/license/upgrade-dialog-store';
import { openExternal } from '@shared/lib/open-external';
import { POSButton } from '@shared/ui';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@shared/ui/dialog';
import { LicenseActivationForm } from '@features/activate-license'; // ❌ features may not import features — see note
```

**Note on the key form:** `features/upgrade-license` cannot import `features/activate-license`. Instead, mount the dialog from `App.tsx` and pass the form in as a prop: `<UpgradeDialog activationForm={<LicenseActivationForm showDemo={false} onDone={close} />} />` where `App.tsx` (app layer) imports both features. `UpgradeDialog` props: `{ activationForm: ReactNode }`.

Body: `DialogTitle` = `upgradeLicense.title`; if `feature` set → `<p data-testid="upgrade-feature-line">`; intro; three plan rows; "Includes" list mapping `FEATURE_KEYS` → `t(\`license.features.${k}\`, { ns: 'common' })`; buttons: *Contact sales* → `openExternal(\`mailto:${DEMO_CONTACT.email}?subject=...\`)` and a second link button with the site URL; *I already have a key* toggles `showKeyForm` and renders `activationForm`; *Continue the demo* closes. `data-testid="upgrade-dialog"`.

`src/shared/lib/open-external.ts` (create if it does not exist — grep for `plugin-opener` first and reuse whatever helper already wraps it):

```ts
/** Open a URL in the OS browser (Tauri) or a new tab (web). */
export async function openExternal(url: string): Promise<void> {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
```

Test (`UpgradeDialog.test.tsx`): open store with `feature: 'report_export'` → dialog visible, feature line contains the label; click "I already have a key" → the passed `activationForm` node (render a `<div data-testid="fake-form" />`) appears; click "Continue the demo" → store closed.

- [ ] **Step 3: `DemoBar.tsx`** (app layer):

```tsx
export function DemoBar() {
  const { t } = useTranslation('common');
  const isDemo = useIsDemo();
  const payload = useLicenseStore(s => s.payload);
  const openFor = useUpgradeDialogStore(s => s.openFor);
  if (!isDemo || !payload?.period_end) return null;
  const days = Math.max(0, Math.ceil((new Date(payload.period_end).getTime() - getEffectiveNow()) / 86_400_000));
  return (
    <div role="status" data-testid="demo-bar" data-days-left={days}
      className="flex h-8 shrink-0 items-center justify-center gap-3 bg-warning text-xs font-semibold text-warning-foreground">
      <span>{t('license.demo.bar', { count: days })}</span>
      <button type="button" className="underline underline-offset-2" onClick={() => { openFor(); }}>{t('license.demo.cta')}</button>
    </div>
  );
}
```

Render it as the first child of `<main>` in `AppShell.tsx` (in-flow, above `<Outlet />`). Mount `<UpgradeDialog activationForm={…} />` in `App.tsx` next to `<LicenseBanner />` (inside `Providers`, outside `LicenseGate` so it also works from Settings while active).

- [ ] **Step 4: `DemoLoginHint.tsx`** (pages/login): renders only when `useIsDemo()`; a small card `data-testid="demo-login-hint"` listing `DEMO_STAFF` as `name — role — PIN`. Place it in `src/pages/login/index.tsx` under the login form column (find the `<PINLoginForm />`/`<EmployeeSelector />` container and add it below).

- [ ] **Step 5: `LicenseSettingsTab`** — when `payload.plan === 'demo'`: the `periodEnd` row label becomes `t('license.demoEnds')`; add a `POSButton` "Get the full version" (`data-testid="license-get-full"`) that calls `openFor()`; pass `showDemo={false}` to the embedded `LicenseActivationForm`.

- [ ] **Step 6:** typecheck, lint, `npx vitest run src/features/upgrade-license src/app src/widgets/SettingsTabsPanel/tabs` (fix any existing LicenseSettingsTab test if one exists). **Step 7: Commit** `feat(demo): demo bar, upgrade dialog, demo login hint, settings license tab`.

---

### Task 7: Lock points (part 1) — exports, AI, email, backup

**Files:** `src/features/export-report/ui/ExportButtons.tsx`, `src/widgets/BankTransfersList/index.tsx`, `src/features/agent-chat/ui/AgentButton.tsx`, `src/features/process-payment/ui/EmailReceiptDialog.tsx`, `src/widgets/SettingsTabsPanel/tabs/EmailReceiptsSettingsTab.tsx`, `src/widgets/SettingsTabsPanel/tabs/BackupSettingsTab.tsx`

- [ ] **Step 1:** `ExportButtons.tsx` — wrap the `DropdownMenuTrigger`'s child button: `<LockedFeature feature="report_export"><POSButton …/></LockedFeature>` inside `<DropdownMenuTrigger asChild>` will break `asChild` when locked (the span gets the trigger props). Do it the other way: when `useFeature('report_export').locked`, render `<LockedFeature feature="report_export"><POSButton …>{label}</POSButton></LockedFeature>` **instead of** the whole `DropdownMenu`; otherwise render the existing dropdown unchanged. Same for the bank-transfers export button in `BankTransfersList/index.tsx` (find the button that calls the `export-bank-transfers` hook).
- [ ] **Step 2:** `AgentButton.tsx` — keep the `VITE_AGENT_ENABLED === 'false'` early return; wrap the `<Button>` in `<LockedFeature feature="ai_assistant">`.
- [ ] **Step 3:** `EmailReceiptDialog.tsx` — wrap the send `POSButton` (the one that calls `sendReceiptByEmail`, around line 93-103). `EmailReceiptsSettingsTab.tsx` — wrap the test-send `POSButton` (line ~117).
- [ ] **Step 4:** `BackupSettingsTab.tsx` — wrap the create-backup and restore `POSButton`s (they are already inside `ProtectedAction`; nest `LockedFeature` **inside** `ProtectedAction` so both gates compose: `<ProtectedAction …><LockedFeature feature="settings_backup"><POSButton/></LockedFeature></ProtectedAction>` — `ProtectedAction` only clones `disabled` onto its direct child, which is now the `LockedFeature` element; `LockedFeature` accepts `disabled` and merges it, so the chain works).
- [ ] **Step 5:** Run the co-located tests: `npx vitest run src/features/export-report src/features/agent-chat src/features/process-payment src/widgets/SettingsTabsPanel src/widgets/BankTransfersList` — all must still pass (enforcement is off in tests → `LockedFeature` is a passthrough). typecheck + lint.
- [ ] **Step 6: Commit** `feat(demo): lock report export, AI assistant, email receipts and backups by entitlement`.

---

### Task 8: Lock points (part 2) — routes, nav, staff, RBAC, promotions, purchase orders

**Files:** `src/app/audit-route.tsx`, `src/app/edit-history-route.tsx`, `src/shared/config/navigation.ts`, `src/widgets/AppShell/ui/Sidebar.tsx`, `src/widgets/HomeDashboard/ui/HomeDashboard.tsx`, `src/features/create-staff/ui/CreateStaffDialog.tsx`, `src/features/edit-staff-role/ui/EditRoleDialog.tsx`, `src/features/edit-staff-locale/ui/EditLocaleDialog.tsx`, `src/features/admin-reset-pin/ui/AdminResetPinDialog.tsx`, `src/widgets/RBACDashboard/PermissionMatrix.tsx`, `src/pages/promotions/index.tsx`, `src/features/create-purchase-order/ui/PurchaseOrderForm.tsx`, `src/features/receive-shipment/ui/ReceiveShipmentForm.tsx`

- [ ] **Step 1: Routes.** In `audit-route.tsx` after the RBAC check: `const { enabled } = useFeature('audit_log'); if (!enabled) return <FeatureLockedPage feature="audit_log" />;` (hooks before any early return). Same in `edit-history-route.tsx` with `edit_history`.
- [ ] **Step 2: Nav manifest.** `NavItem` gains `feature?: FeatureKey` (import type from `@shared/lib/license/features`); set `feature: 'audit_log'` on `/audit` and `feature: 'edit_history'` on `/edit-history`. In `Sidebar.tsx` `NavEntry`: read `const feature = item.feature ? useFeature(item.feature) : null` — hooks can't be conditional; instead add a tiny `useNavFeatureLocked(item)` helper in `src/shared/lib/license/features.ts`:

```ts
/** For nav manifests: locked only when the item declares a feature that the license lacks. */
export function useNavFeatureLocked(feature: FeatureKey | undefined): { locked: boolean; requestUpgrade: () => void } {
  const payload = useLicenseStore(s => s.payload);
  const openFor = useUpgradeDialogStore(s => s.openFor);
  const locked = feature !== undefined && !isFeatureEnabled(feature, payload, isLicenseEnforced());
  const requestUpgrade = useCallback(() => { if (feature) openFor(feature); }, [feature, openFor]);
  return { locked, requestUpgrade };
}
```

In `NavEntry`, when `locked`: `event.preventDefault(); requestUpgrade();` in the `onClick`, and render the existing `<Lock …>` icon with `data-testid="nav-feature-lock-icon"` (keep `nav-lock-icon` for the RBAC case). In `HomeDashboard.renderTile`, same: locked feature tile shows the lock chip and `handleItemClick` calls `requestUpgrade` (compute `useNavFeatureLocked` per tile via a small `Tile` sub-component so the hook count is stable).
- [ ] **Step 3: Staff.** Wrap the primary submit `POSButton` in `CreateStaffDialog`, `EditRoleDialog`, `EditLocaleDialog`, `AdminResetPinDialog` with `<LockedFeature feature="staff_management">`.
- [ ] **Step 4: RBAC.** In `PermissionMatrix.tsx`, wrap each permission toggle control with `<LockedFeature feature="rbac_editing">` (if the control is a `Switch`/`Checkbox` that accepts `disabled`, the wrapper works; if it is a plain `<input type="checkbox">`, wrap that input).
- [ ] **Step 5: Promotions + POs.** `src/pages/promotions/index.tsx`: wrap the "New promotion" button and each row's edit button with `<LockedFeature feature="promotions">`. `PurchaseOrderForm.tsx` + `ReceiveShipmentForm.tsx`: wrap the submit `POSButton` with `<LockedFeature feature="purchase_orders">`.
- [ ] **Step 6:** `npx vitest run src/app src/widgets/AppShell src/widgets/HomeDashboard src/widgets/RBACDashboard src/features/create-staff src/features/edit-staff-role src/features/edit-staff-locale src/features/admin-reset-pin src/pages/promotions src/features/create-purchase-order src/features/receive-shipment` — pass; typecheck; lint.
- [ ] **Step 7: Commit** `feat(demo): lock audit/edit-history routes, nav, staff, RBAC, promotions and PO actions by entitlement`.

---

### Task 9: Receipt watermark + web build script + seed script

**Files:** `src/shared/lib/receipt-format.ts` (+ `receipt-format.test.ts`), `src/shared/lib/exporters/receipt-pdf.tsx`, `src/shared/lib/email-receipt.ts`, `src/shared/lib/pos-printer.ts`, `src/features/process-payment/ui/ReceiptPreview.tsx`, `src/shared/lib/i18n/locales/{es-MX,en-US}/receipt.json`, `package.json`, `scripts/seed-demo.ts`

- [ ] **Step 1: i18n** `receipt.json` → `demoWatermark`: es `"*** DEMO — NO VÁLIDO COMO COMPROBANTE ***"`, en `"*** DEMO — NOT A VALID RECEIPT ***"`.
- [ ] **Step 2: Test** in `receipt-format.test.ts` (copy an existing `buildThermalReceiptText` fixture from that file):

```ts
it('appends the demo watermark as the last line when demoWatermark is set', () => {
  const text = buildThermalReceiptText(sampleReceipt, 'en-US', { ...sampleSettings, demoWatermark: true });
  expect(text.trim().split('\n').at(-1)).toContain('DEMO');
  expect(buildThermalReceiptText(sampleReceipt, 'en-US', sampleSettings)).not.toContain('DEMO');
});
```

- [ ] **Step 3: Implement.** Add `demoWatermark?: boolean` to the `ReceiptSettings` type used by `receipt-format.ts` **only if** that type is a plain TS type in that file; if `ReceiptSettings` is the Zod domain type, add a fourth optional parameter instead: `buildThermalReceiptText(receipt, locale, settings, opts: { demoWatermark: boolean } = { demoWatermark: false })`. Append `centerLine(tr('demoWatermark'), width)` after the footer when set. Apply the same flag to the PDF (`receipt-pdf.tsx`: a final `<Text>` row) and email HTML (`email-receipt.ts`: a final `<p>`). At the three call sites (`pos-printer.ts` print path, `ReceiptPreview.tsx`, `email-receipt.ts`'s caller) compute `const demoWatermark = isLicenseEnforced() && isDemoPlan(useLicenseStore.getState().payload)` and pass it. `shared/lib` importing `shared/lib/license` is fine.
- [ ] **Step 4: `package.json`** scripts: `"build:web": "tsc && vite build"`, `"seed:demo": "npx tsx scripts/seed-demo.ts"`, `"test:e2e:license": "playwright test --config=playwright.license.config.ts"`.
- [ ] **Step 5: `scripts/seed-demo.ts`** — same env loading as `setup-dev-users.ts`; import `DEMO_STAFF` via a relative path (`../src/shared/lib/license/demo-accounts`); for each: reuse `setup-dev-users.ts`'s `ensureStaffAccount` logic — **extract** that function into `scripts/lib/ensure-staff-account.ts` (exporting `ensureStaffAccount(db, role, name, pin)`) and make `setup-dev-users.ts` import it (behaviour unchanged); then `execSync('npx tsx scripts/seed-dev-data.ts', { stdio: 'inherit' })`; then upsert the `settings` row with key `general` merging `{ storeName: 'Tienda Demo' }` (look at `src/entities/settings/model/queries.ts` for the exact table/key/shape). Log a summary and exit 0.
- [ ] **Step 6:** Run `npm run seed:demo` against the local stack (uses `.env.local`) — must complete; then `npx vitest run src/shared/lib/receipt-format.test.ts`, typecheck, lint.
- [ ] **Step 7: Commit** `feat(demo): receipt demo watermark, build:web and seed:demo scripts`.

---

### Task 10: License server — migrations, `_shared`, `start-demo`, `activate` re-bind, portal

**Repo:** `D:\Projects\Code\pos-license-server` — `git checkout -b feat/demo-plan` (leave the three pre-existing uncommitted files as they are; never `git add -A`).

**Files:** `supabase/migrations/20260914000001_demo_plan.sql`, `supabase/migrations/20260914000002_demo_tenant_features.sql`, `supabase/functions/_shared/license.ts`, `supabase/functions/start-demo/index.ts`, `supabase/functions/activate/index.ts`, `portal/src/lib.ts` (wherever `Plan`/`PLAN_PRICE_MXN` live — grep), `portal/src/pages/Tenants.tsx`, `portal/src/pages/TenantDetail.tsx`, `scripts/smoke-start-demo.mjs`

- [ ] **Step 1: Migrations.**

`20260914000001_demo_plan.sql`:
```sql
-- Self-service 14-day demo tenants (POS "Demo edition"). Enum values cannot be added inside
-- the transaction that first uses them, so this file only adds the value.
alter type public.plan_kind add value if not exists 'demo';
```

`20260914000002_demo_tenant_features.sql`:
```sql
-- Per-tenant entitlement allow-list. null = every feature (paid plans). Demo tenants get the
-- server default DEMO_FEATURES from _shared/license.ts unless this column overrides it.
alter table public.tenants add column if not exists features text[];

create index if not exists tenants_demo_expiry_idx
  on public.tenants (current_period_end) where plan = 'demo';

-- record_payment: never silently treat an unknown plan as lifetime.
create or replace function public.record_payment(
  p_tenant_id uuid, p_amount_mxn numeric, p_method text default 'transfer',
  p_note text default null, p_periods int default 1
) returns public.tenants language plpgsql security invoker as $$
declare
  t public.tenants; v_base timestamptz; v_new_end timestamptz; v_new_updates timestamptz;
begin
  if p_periods < 1 then raise exception 'p_periods must be >= 1'; end if;
  select * into t from public.tenants where id = p_tenant_id for update;
  if not found then raise exception 'tenant % not found', p_tenant_id; end if;
  v_base := greatest(now(), coalesce(t.current_period_end, now()));
  if t.plan = 'monthly' then
    v_new_end := v_base + make_interval(months => p_periods); v_new_updates := t.updates_until;
  elsif t.plan = 'yearly' then
    v_new_end := v_base + make_interval(years => p_periods); v_new_updates := t.updates_until;
  elsif t.plan = 'lifetime' then
    v_new_end := null; v_new_updates := now() + interval '4 years';
  else
    raise exception 'change the plan before recording a payment for a % tenant', t.plan;
  end if;
  insert into public.payments (tenant_id, amount_mxn, method, note, period_start, period_end, recorded_by)
  values (p_tenant_id, p_amount_mxn, coalesce(p_method, 'transfer'), p_note, v_base, v_new_end, auth.uid());
  update public.tenants set current_period_end = v_new_end, updates_until = v_new_updates,
    status = 'active', updated_at = now() where id = p_tenant_id returning * into t;
  return t;
end; $$;
```

- [ ] **Step 2: `_shared/license.ts`.** `PlanKind = 'monthly' | 'yearly' | 'lifetime' | 'demo'`; `TenantRow.features: string[] | null`; `LicensePayload.features: string[] | null`; `export const DEMO_FEATURES = ['promotions', 'purchase_orders'];` `export const DEMO_DAYS = 14;`; in `buildPayload` add `features: tenant.features ?? (tenant.plan === 'demo' ? DEMO_FEATURES : null),`.

- [ ] **Step 3: `start-demo/index.ts`** (mirror `activate`'s structure and helpers):

```ts
// POST /start-demo { terminal_id, terminal_name?, app_version?, os? }
// Self-provisions a 14-day demo tenant bound to this terminal. One demo per terminal id.
import { buildPayload, clientIp, DEMO_DAYS, error, isUuid, json, preflight, serviceClient, signToken, type TenantRow, type TerminalRow } from '../_shared/license.ts';

const MAX_DEMOS_PER_IP_PER_DAY = 20;

Deno.serve(async req => {
  const pre = preflight(req);
  if (pre) return pre;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return error('BAD_JSON', 'Body must be JSON', 400); }
  const terminalId = body.terminal_id;
  if (!isUuid(terminalId)) return error('INVALID_TERMINAL', 'terminal_id must be a UUID', 400);

  const db = serviceClient();
  const ip = clientIp(req);
  const nowIso = new Date().toISOString();

  // Opportunistic cleanup of long-expired demos (cascades terminals/payments). No cron needed.
  await db.from('tenants').delete().eq('plan', 'demo')
    .lt('current_period_end', new Date(Date.now() - 30 * 86_400_000).toISOString());

  const { data: existing } = await db.from('terminals').select('id, tenant_id, status, tenants!inner(plan)')
    .eq('id', terminalId).maybeSingle<TerminalRow & { tenants: { plan: string } }>();
  if (existing) {
    return existing.tenants.plan === 'demo'
      ? error('DEMO_ALREADY_USED', 'This terminal already used its demo', 403)
      : error('TERMINAL_BOUND_ELSEWHERE', 'This terminal is registered to a licensed tenant', 403);
  }

  if (ip) {
    const { count } = await db.from('terminals').select('id, tenants!inner(plan)', { count: 'exact', head: true })
      .eq('last_ip', ip).eq('tenants.plan', 'demo').gt('first_seen_at', new Date(Date.now() - 86_400_000).toISOString());
    if ((count ?? 0) >= MAX_DEMOS_PER_IP_PER_DAY) return error('RATE_LIMITED', 'Too many demos from this network today', 429);
  }

  const slug = `demo-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
  const { data: tenant, error: tErr } = await db.from('tenants').insert({
    slug, name: 'Demo', plan: 'demo', status: 'active',
    current_period_end: new Date(Date.now() + DEMO_DAYS * 86_400_000).toISOString(),
    grace_days: 0, lease_days: DEMO_DAYS, max_terminals: 1, notes: `self-service demo · ip ${ip ?? '?'}`,
  }).select('*').single<TenantRow>();
  if (tErr || !tenant) return error('DB_ERROR', tErr?.message ?? 'insert failed', 500);

  const name = typeof body.terminal_name === 'string' && body.terminal_name.trim() ? body.terminal_name.trim() : 'Demo';
  const { error: insErr } = await db.from('terminals').insert({
    id: terminalId, tenant_id: tenant.id, name,
    app_version: typeof body.app_version === 'string' ? body.app_version : null,
    os: typeof body.os === 'string' ? body.os : null, last_ip: ip, last_seen_at: nowIso,
  });
  if (insErr) return error('DB_ERROR', insErr.message, 500);

  const token = await signToken(buildPayload(tenant, terminalId));
  return json({ token, license_key: tenant.license_key, tenant: { name: tenant.name, plan: tenant.plan }, terminal: { id: terminalId, name } });
});
```

(If the PostgREST embedded filter `tenants!inner(plan)` + `.eq('tenants.plan', …)` proves awkward, do two queries: fetch the terminal, then the tenant by id.)

- [ ] **Step 4: `activate` re-bind (spec R6).** In the `if (existing)` branch, before the `TERMINAL_BOUND_ELSEWHERE` check, load the existing terminal's tenant plan; if it is `'demo'` and differs from the target tenant: enforce the target's `max_terminals` (same count query as the new-terminal path), then `update terminals set tenant_id = tenant.id, ...meta, activation_count + 1 where id = terminalId`, then `delete from tenants where id = existing.tenant_id` (the orphaned demo), and continue to token issuance.
- [ ] **Step 5: Portal.** `Plan` type + `PLAN_PRICE_MXN.demo = 0`; `Tenants.tsx`: a checkbox "Show demos" (default off) filtering `t.plan === 'demo'`, and a `demo` chip in the plan cell; `TenantDetail.tsx`: plan `<Select>` options exclude `demo` (filter the option list), a read-only line `Features: <features.join(', ') || 'all'>` (for demos, show `DEMO_FEATURES` fallback text "default demo set"). Keep edits minimal.
- [ ] **Step 6: `scripts/smoke-start-demo.mjs`** — Node script: POST to `${LICENSE_SERVER_URL}/functions/v1/start-demo` with a random UUID, then verify the returned token's signature against `LICENSE_PUBLIC_KEY_SPKI.txt` using `crypto.verify('sha256', payloadBytes, { key, dsaEncoding: 'ieee-p1363' }, sig)` and assert `plan === 'demo'` and `features` equals `['promotions','purchase_orders']`; second call with the same UUID must return `DEMO_ALREADY_USED`. Exit non-zero on failure.
- [ ] **Step 7: Commit** on `feat/demo-plan`: `feat(demo): demo plan, tenant features, start-demo function, demo→paid re-bind, portal chips` — `git add` only the files above.

---

### Task 11: License server — run locally and smoke-test

**Repo:** `pos-license-server` on `feat/demo-plan`.

- [ ] **Step 1:** `supabase/config.toml` references `env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)`/`SECRET`; export placeholders for the local run (`$env:SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID='local-placeholder'; $env:SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET='local-placeholder'`), then `npx supabase start` (pulls images on first run — allow up to 10 min; use `run_in_background` and poll `npx supabase status`). Migrations + seed apply automatically.
- [ ] **Step 2:** Confirm `supabase/functions/.env` exists with `LICENSE_SIGNING_KEY_PKCS8` (it is gitignored; if missing, generate a pair with the README one-liner, write the private half there and the public half to `LICENSE_PUBLIC_KEY_SPKI.txt` — note in the task summary that the POS `public-key.ts` must then be updated too). Start `npx supabase functions serve --env-file supabase/functions/.env --no-verify-jwt` in the background.
- [ ] **Step 3:** `LICENSE_SERVER_URL=http://127.0.0.1:55321 node scripts/smoke-start-demo.mjs` → exit 0. Also `psql`/Studio check: `select slug, plan, current_period_end, lease_days, grace_days from tenants where plan='demo'` shows the new row. Paste the script output into the task summary.
- [ ] **Step 4:** Leave both processes running for Task 14's live check; record the local `ANON_KEY` from `npx supabase status -o env` in the summary (local dev key only).

---

### Task 12: Hermetic license E2E harness + specs

**Files:** `playwright.license.config.ts`, `e2e/helpers/license-keys.ts`, `e2e/helpers/license-tokens.ts`, `e2e/license/demo-start.spec.ts`, `e2e/license/demo-locks.spec.ts`, `e2e/license/demo-auto-start.spec.ts`, `e2e/license/paid-license.spec.ts`

- [ ] **Step 1: Test keypair.** Generate once with Node and commit as constants:

```js
node -e "const {generateKeyPairSync}=require('crypto');const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});console.log(privateKey.export({type:'pkcs8',format:'pem'}));console.log(publicKey.export({type:'spki',format:'der'}).toString('base64'))"
```

`e2e/helpers/license-keys.ts`:
```ts
/** TEST-ONLY ECDSA P-256 keypair for hermetic license e2e. Never used by any server. */
export const TEST_LICENSE_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----`;
export const TEST_LICENSE_PUBLIC_KEY_SPKI = '...base64...';
```

`e2e/helpers/license-tokens.ts`:
```ts
import { createPrivateKey, sign } from 'node:crypto';
import { TEST_LICENSE_PRIVATE_KEY_PEM } from './license-keys';

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export type TokenOverrides = Partial<{
  plan: 'monthly' | 'yearly' | 'lifetime' | 'demo'; features: string[] | null; period_end: string | null;
  grace_days: number; lease_until: string; status: 'active' | 'suspended';
}>;

/** Sign a license payload exactly like the server does (raw r||s signature = WebCrypto format). */
export function signTestToken(terminalId: string, overrides: TokenOverrides = {}): string {
  const now = Date.now();
  const payload = {
    v: 1, tenant_id: 'e2e-tenant', tenant_slug: 'e2e', tenant_name: 'E2E Store', terminal_id: terminalId,
    plan: 'monthly', status: 'active', period_end: new Date(now + 30 * 86_400_000).toISOString(),
    grace_days: 7, updates_until: null, max_terminals: 1, features: null,
    issued_at: new Date(now).toISOString(), lease_until: new Date(now + 60 * 86_400_000).toISOString(),
    ...overrides,
  };
  const body = Buffer.from(JSON.stringify(payload));
  const sig = sign('sha256', body, { key: createPrivateKey(TEST_LICENSE_PRIVATE_KEY_PEM), dsaEncoding: 'ieee-p1363' });
  return `${b64url(body)}.${b64url(sig)}`;
}

export const demoToken = (terminalId: string, daysLeft = 14) =>
  signTestToken(terminalId, { plan: 'demo', features: ['promotions', 'purchase_orders'], grace_days: 0,
    period_end: new Date(Date.now() + daysLeft * 86_400_000).toISOString(),
    lease_until: new Date(Date.now() + 14 * 86_400_000).toISOString() });
```

- [ ] **Step 2: `playwright.license.config.ts`** — copy `playwright.config.ts`, then: `testDir: './e2e/license'`, `testIgnore: [/\.test\.ts$/]`, `outputDir: './e2e-results-license'`, `reporter` html folder `playwright-report-license`, keep `globalSetup`/`globalTeardown` **off** (this suite never touches the POS DB beyond login), and:

```ts
const LICENSE_ENV = {
  VITE_LICENSE_ENFORCE: 'true',
  VITE_LICENSE_PUBLIC_KEY: TEST_LICENSE_PUBLIC_KEY_SPKI,
  VITE_LICENSE_SERVER_URL: 'http://127.0.0.1:1522/__license',
  VITE_LICENSE_SERVER_ANON_KEY: 'e2e-anon',
};
projects: [
  { name: 'gate', use: { baseURL: 'http://localhost:1522' }, testMatch: /(demo-start|demo-locks|paid-license)\.spec\.ts/ },
  { name: 'auto-start', use: { baseURL: 'http://localhost:1523' }, testMatch: /demo-auto-start\.spec\.ts/ },
],
webServer: [
  { command: 'npx vite --port 1522 --strictPort', url: 'http://localhost:1522', reuseExistingServer: false, timeout: 120_000, env: { ...process.env, ...LICENSE_ENV } },
  { command: 'npx vite --port 1523 --strictPort', url: 'http://localhost:1523', reuseExistingServer: false, timeout: 120_000, env: { ...process.env, ...LICENSE_ENV, VITE_LICENSE_SERVER_URL: 'http://127.0.0.1:1523/__license', VITE_DEMO_AUTO_START: 'true' } },
],
```

`vite.config.ts` has `strictPort: true, port: 1520` in `server` — the CLI `--port` flag overrides it. Verify by starting one manually once.

- [ ] **Step 3: Shared spec helpers** (top of each spec or `e2e/helpers/license-e2e.ts`):

```ts
const TERMINAL_KEY = 'pos.license.terminal_id';
const STORE_KEY = 'pos.license';
export async function seedTerminal(page: Page, terminalId: string) {
  await page.addInitScript(([k, id]) => { localStorage.setItem(k, id); }, [TERMINAL_KEY, terminalId] as const);
}
export async function seedLicense(page: Page, terminalId: string, token: string, licenseKey = 'E2E0-0000-0000-0001') {
  await seedTerminal(page, terminalId);
  await page.addInitScript(([k, t, key]) => {
    localStorage.setItem(k, JSON.stringify({ state: { token: t, payload: null, licenseKey: key, lastHeartbeatAt: null, lastError: null, maxSeenNow: 0 }, version: 0 }));
  }, [STORE_KEY, token, licenseKey] as const);
}
```

`payload: null` in storage is fine: `revalidateStoredToken` only checks `token`; then `runHeartbeat` posts to `/__license/functions/v1/heartbeat` — route it: `await page.route('**/__license/functions/v1/heartbeat', r => r.fulfill({ json: { token } }))`. **Important:** the zustand `persist` store needs `payload` to evaluate. Since `setLicense` is only called from `applyToken`, seed `payload` too: decode it in Node (`JSON.parse(Buffer.from(token.split('.')[0], 'base64url'))`) and store it alongside the token.

- [ ] **Step 4: Specs.** Use `test`/`expect` from `../fixtures` and `loginAs` from `../helpers/auth`.

`demo-start.spec.ts`:
```ts
test('gate offers a free demo and the app opens with the demo bar', async ({ page }) => {
  const terminalId = randomUUID();
  await seedTerminal(page, terminalId);
  await page.route('**/__license/functions/v1/start-demo', r => r.fulfill({ json: { token: demoToken(terminalId), license_key: 'DEMO-0000-0000-0001' } }));
  await page.route('**/__license/functions/v1/heartbeat', r => r.fulfill({ json: { token: demoToken(terminalId) } }));
  await page.goto('/login');
  await expect(page.getByTestId('license-gate')).toHaveAttribute('data-reason', 'unlicensed');
  await page.getByTestId('start-demo-button').click();
  await expect(page.getByTestId('license-gate')).toBeHidden();
  await expect(page.getByTestId('demo-login-hint')).toBeVisible();
  await loginAs(page, 'admin');
  await expect(page.getByTestId('demo-bar')).toHaveAttribute('data-days-left', '14');
});
test('a used terminal shows the mapped DEMO_ALREADY_USED copy', async ({ page }) => {
  await seedTerminal(page, randomUUID());
  await page.route('**/__license/functions/v1/start-demo', r => r.fulfill({ status: 403, json: { error: 'DEMO_ALREADY_USED', message: 'used' } }));
  await page.goto('/login');
  await page.getByTestId('start-demo-button').click();
  await expect(page.getByTestId('license-activation-error')).toContainText(/ya usó su demo|already used its demo/i);
});
```

`demo-locks.spec.ts` (seed a demo license, route heartbeat, `loginAs(page,'admin')`):
- `/reports` → the export control is `getByTestId('locked-feature')` with `data-feature="report_export"`; clicking opens `getByTestId('upgrade-dialog')` whose `upgrade-feature-line` is visible; "Continue the demo" closes it.
- `/audit` → `feature-locked-page` with `data-feature="audit_log"`; sidebar `nav-feature-lock-icon` visible.
- `/promotions` → `locked-feature[data-feature="promotions"]` count is 0.
- `/settings` → License tab (`getByRole('tab', { name: /licen/i })`) → `license-status` visible and `license-get-full` visible.

`paid-license.spec.ts` (seed `signTestToken(terminalId)` — paid): after login, `demo-bar` hidden; `/reports` has zero `locked-feature`; `/audit` renders without `feature-locked-page`.

`demo-auto-start.spec.ts` (project `auto-start`, port 1523):
- fresh context, route `start-demo` → `demoToken(<terminal id read from request body>)` (parse `JSON.parse(route.request().postData())`.terminal_id), route heartbeat; `goto('/login')` → `license-gate-preparing` appears then disappears; `demo-login-hint` visible; no `start-demo-button` ever rendered.
- expired: seed `demoToken(id, -1)` → gate would say `demo_expired` → the app auto-resets: assert `start-demo` was called with a **different** terminal id than the seeded one (capture request bodies) and the login page renders.

- [ ] **Step 5: Run** `npm run test:e2e:license` — all green, headless. Fix root causes, not tests (if the gate never shows because enforcement didn't take, verify the `env` reaches Vite: `import.meta.env.VITE_LICENSE_ENFORCE` — Vite only exposes `VITE_*` present at process start, which the `env` block guarantees).
- [ ] **Step 6: Commit** `test(demo): hermetic license/demo e2e suite with test keypair`.

---

### Task 13: Hosting + workflows + runbook

**Files:** `firebase.json`, `.firebaserc`, `.github/workflows/deploy-demo.yml`, `.github/workflows/reset-demo.yml`, `docs/online-demo.md`

- [ ] **Step 1: `firebase.json`:**
```json
{
  "hosting": {
    "target": "demo",
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }],
    "headers": [
      { "source": "/assets/**", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
      { "source": "/index.html", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] }
    ]
  }
}
```
`.firebaserc`: `{ "projects": { "default": "bola8pos" }, "targets": { "bola8pos": { "hosting": { "demo": ["demo-bola8pos"] } } } }`.

- [ ] **Step 2: `deploy-demo.yml`** — `on: workflow_dispatch` + `push: tags: ['v*']`; single job `if: github.repository == 'zedfauji/supermarket-pos'`, `runs-on: ubuntu-latest`; steps: checkout, setup-node 22 (`cache: npm`), `npm ci --legacy-peer-deps`, build with `env:` `VITE_SUPABASE_URL: ${{ secrets.DEMO_SUPABASE_URL }}`, `VITE_SUPABASE_ANON_KEY: ${{ secrets.DEMO_SUPABASE_ANON_KEY }}`, `VITE_LICENSE_SERVER_URL: ${{ secrets.VITE_LICENSE_SERVER_URL }}`, `VITE_LICENSE_SERVER_ANON_KEY: ${{ secrets.VITE_LICENSE_SERVER_ANON_KEY }}`, `VITE_LICENSE_PUBLIC_KEY: ${{ secrets.VITE_LICENSE_PUBLIC_KEY }}`, `VITE_LICENSE_ENFORCE: 'true'`, `VITE_DEMO_AUTO_START: 'true'`, `VITE_AGENT_ENABLED: 'false'`, `VITE_APP_VERSION: $(node -p "require('./package.json').version")` (compute in a prior step into `$GITHUB_ENV`); `run: npm run build:web`; deploy `uses: FirebaseExtended/action-hosting-deploy@v0` with `repoToken: ${{ secrets.GITHUB_TOKEN }}`, `firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_BOLA8POS }}`, `projectId: bola8pos`, `target: demo`, `channelId: live`.
- [ ] **Step 3: `reset-demo.yml`** — `on: schedule: [{ cron: '0 9 * * *' }]` + `workflow_dispatch`; same repo guard; steps: checkout, setup-node, `npm ci --legacy-peer-deps`, `uses: supabase/setup-cli@v1` (`version: latest`), `supabase link --project-ref ${{ secrets.DEMO_SUPABASE_PROJECT_REF }}` with `env: SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD: ${{ secrets.DEMO_SUPABASE_DB_PASSWORD }}`; `supabase db reset --linked --yes`; `npm run seed:demo` with `env: VITE_SUPABASE_URL: ${{ secrets.DEMO_SUPABASE_URL }}`, `SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.DEMO_SUPABASE_SERVICE_ROLE_KEY }}`. Add a leading step that fails loudly if `DEMO_SUPABASE_PROJECT_REF` equals any ref in `customers/customers.json` (a `node -e` one-liner) — the reset must never hit a customer project.
- [ ] **Step 4: `docs/online-demo.md`** — sections: (1) What it is; (2) One-time setup: create Supabase project `supermarket-pos-demo`, `supabase link` + `db push` + `functions deploy` for the POS functions (list them from `supabase/functions/`), set the POS function secrets, run `npm run seed:demo`; (3) License server: apply the two `feat/demo-plan` migrations and deploy `start-demo` + redeploy `activate`/`heartbeat`/`issue-offline-token` to `zhvcivnojpvgwiknlpuj`; (4) Firebase: `firebase hosting:sites:create demo-bola8pos`, `firebase target:apply hosting demo demo-bola8pos`, custom domain `demo.bola8pos.com` (DNS records shown in console), service account secret; (5) GitHub secrets table (every secret named in the two workflows); (6) Desktop demo installer: add `{ "name": "demo", "repo": "zedfauji/supermarket-pos-demo", "status": "active", "supabase_project_ref": "<ref>", "deployment_mode": "cloud", "github_environment": "demo" }` to `customers/customers.json` plus the environment secrets `release.yml` needs; the installer's "Try it free" button provisions the demo; (7) Marketing site CTA: in `Websites/POS-Website` add `{ href: 'https://demo.bola8pos.com', label: t('hero.tryDemo') }` next to the primary hero CTA and the desktop-installer link to the latest release asset of the demo repo; (8) Operations: nightly reset time, how to unlock a feature for a hot prospect (`update tenants set features = array['promotions','purchase_orders','report_export'] where slug = 'demo-xxxx'`), how a demo converts (activate with paid key → R6 re-bind).
- [ ] **Step 5:** `npx prettier --check firebase.json .firebaserc` (or format), YAML lint by eye, commit `chore(demo): firebase hosting config, deploy/reset workflows, online-demo runbook`.

---

### Task 14: Live check against the local license server (integration)

- [ ] **Step 1:** With Task 11's stack running, start a dev server with real enforcement pointed at it: `$env:VITE_LICENSE_ENFORCE='true'; $env:VITE_LICENSE_SERVER_URL='http://127.0.0.1:55321'; $env:VITE_LICENSE_SERVER_ANON_KEY='<local anon>'; npx vite --port 1524 --strictPort` (background). `public-key.ts`'s embedded key must match the local signing key (Task 11 Step 2).
- [ ] **Step 2:** Drive it with Playwright MCP tools (`browser_navigate` → `http://localhost:1524/login`, click "Probar gratis 14 días", `browser_network_requests` shows `start-demo` 200, snapshot shows the demo hint; log in as `Ana Admin` / `0000` (seeded by Task 9's `seed:demo`), `demo-bar` shows 14 days; open `/reports` and confirm the export control is locked; open Settings › Licencia and confirm plan "Demo (14 días)"). Then in the license-server Studio (`http://127.0.0.1:55323`) confirm the `tenants` row and `terminals` row. Record the evidence (request/response, screenshots to `e2e-results-license/live/`) in the task summary.
- [ ] **Step 3:** Conversion path: in Studio, note the seeded paid tenant key `DE00-0000-0000-0001`; in the app open Settings › Licencia → "Cambiar clave" → enter it → the app now shows plan Mensual, `demo-bar` gone, export enabled, and the demo tenant row is deleted (R6). Record evidence.
- [ ] **Step 4:** Stop the 1524 server. No commit (nothing changes) unless a bug was found — fix it at the root, with a regression test, and commit.

---

### Task 15: Full gates

- [ ] `npm run typecheck` · `npm run lint` · `npm run test` (full Vitest) · `npm run test:e2e:license`.
- [ ] Scoped default-suite regression (enforcement off, port 1520 server, local POS stack): `npx playwright test e2e/reports/report-tabs.spec.ts e2e/settings e2e/rbac e2e/home e2e/checkout/direct-sale-happy-path.spec.ts` (adjust to the real file names under those folders) — all green. Known environmental red: the payment-methods test in `report-tabs.spec.ts` may time out on a bloated local DB; if it does, run `global-setup`'s prune (it runs automatically via the default config) and retry once, then report it explicitly if still red.
- [ ] `npm run build:web` succeeds and `dist/index.html` exists (proves the web bundle builds without cargo).
- [ ] Update `CLAUDE.md`: under "Licensing…" add a paragraph on the Demo edition (feature keys, `start-demo`, `VITE_DEMO_AUTO_START`, `docs/online-demo.md`), and add `e2e/license/` to the E2E folder table. Commit `docs(demo): document demo edition and online demo`.
