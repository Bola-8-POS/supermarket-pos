# Settings guard + checkout keypad + idle-lock restart fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three client-only changes: (1) Settings prompts Save/Discard/Cancel when leaving a dirty tab, route, or the app; (2) a tap-only numeric keypad on `/pos` for "N × item" adds and PLU/barcode entry; (3) the idle-lock overlay survives an app restart.

**Architecture:** Additive React/Zustand work inside existing FSD slices. Settings guard = a widget-local dirty registry (context) + a `shared/lib` navigation-guard store consulted by the Sidebar + Tauri `onCloseRequested`. Keypad = new `features/checkout-keypad` slice composed into `CheckoutPanel`, reusing existing `cartStore.addItem` (looped) and the loaded products list. Lock fix = `persist` middleware on `useLockStateStore` + one clearing effect in `IdleLockProvider`.

**Tech Stack:** React 19, TypeScript 5.8 strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Zustand 5 (`persist`), react-router-dom 7 (`<BrowserRouter>`, no data router), Radix Tabs/AlertDialog via shadcn in `src/shared/ui`, `@tauri-apps/api` v2, react-i18next (`i18next/no-literal-string` is an ESLint error), Vitest 4 + RTL, fast-check 4, Playwright 1.59.

**Spec:** `docs/superpowers/specs/2026-09-13-settings-guard-keypad-lockfix-design.md` (read it first; every ruling below argues from it).

## Global Constraints

- Repo root IS the app (`package.json`, `src/`, `e2e/` at the worktree root). Run all commands from the worktree root `D:\Projects\Code\supermarket-pos\.claude\worktrees\settings-guard-keypad-lockfix`.
- Never touch `main`. Never run `supabase db push`, `supabase functions deploy`, or any Supabase MCP write. No files under `supabase/`.
- No edits under `src/entities/*/model/*` or `src/shared/lib/domain.ts`. Exception explicitly allowed by spec: none. (`src/shared/lib/lock-state-store.ts` is `shared/lib`, allowed.)
- FSD import direction `app → pages → widgets → features → entities → shared` is lint-enforced. `shared` may not import from any layer above it.
- Every new UI string goes through `t()` with keys added to BOTH `src/shared/lib/i18n/locales/en-US/<ns>.json` and `.../es-MX/<ns>.json` (real Spanish for es-MX).
- `prop?: T` is forbidden on mutation inputs; use `prop: T | undefined`. No `any`.
- Tests: co-locate `*.test.ts(x)` beside source. Scoped runs while iterating (`npx vitest run <file>`, `npx playwright test <spec>`); the full suites run only in Task 8.
- Playwright: `workers: 1`, `webServer` starts `npm run dev` on port 1520 with `reuseExistingServer: true` — make sure no other checkout's dev server is bound to 1520 before running (`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:1520/` must print `000` or the server must be this worktree's). Local Supabase at `127.0.0.1:54321` is shared with other worktrees. Only ONE Playwright run at a time across tasks.
- E2E must be headless (already the config default). If an e2e spec fails twice for an environmental reason (port busy, edge runtime 503, unrelated seed collision), STOP, record the exact error in the task report, and do not loop.
- Commit per task with Conventional Commits, ending the message with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. `docs/*` is gitignored — use `git add -f` for plan/spec edits only.
- Before each commit: `npm run typecheck` and `npx eslint <changed files>` must be clean.

---

### Task 1: Persist idle-lock state across restart (security fix)

**Files:**
- Modify: `src/shared/lib/lock-state-store.ts`
- Modify: `src/features/idle-screen-lock/ui/IdleLockProvider.tsx`
- Create: `src/shared/lib/lock-state-store.test.ts`
- Create or extend: `src/features/idle-screen-lock/ui/IdleLockProvider.test.tsx` (check whether one exists; extend if so)
- Create: `e2e/security/idle-lock-restart.spec.ts`

**Interfaces:**
- Produces: `useLockStateStore` unchanged API (`{ locked, setLocked }`) but now persisted under localStorage key `lock-state` as `{"state":{"locked":true},"version":0}` (zustand persist default envelope).

- [ ] **Step 1: Failing unit test for persistence**

```ts
// src/shared/lib/lock-state-store.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useLockStateStore } from './lock-state-store';

describe('useLockStateStore persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    useLockStateStore.setState({ locked: false });
  });

  it('writes locked=true to localStorage["lock-state"]', () => {
    useLockStateStore.getState().setLocked(true);
    const raw = localStorage.getItem('lock-state');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string).state.locked).toBe(true);
  });

  it('rehydrates locked=true from localStorage on a fresh store', async () => {
    localStorage.setItem('lock-state', JSON.stringify({ state: { locked: true }, version: 0 }));
    await useLockStateStore.persist.rehydrate();
    expect(useLockStateStore.getState().locked).toBe(true);
  });
});
```

- [ ] **Step 2: Run it** — `npx vitest run src/shared/lib/lock-state-store.test.ts` → FAIL (`persist` undefined / key missing).

- [ ] **Step 3: Implement**

```ts
// src/shared/lib/lock-state-store.ts
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface LockState {
  locked: boolean;
  setLocked: (locked: boolean) => void;
}

/**
 * ...keep the existing multi-window/FSD paragraph, REPLACE the "Deliberately no
 * persist" sentence with:
 * Persisted (localStorage key `lock-state`) so that quitting the app while the
 * overlay is up and relaunching re-shows the overlay instead of the restored
 * session's route (Supabase session + staff-store are both persisted, so an
 * in-memory flag alone was a PIN bypass: close window → relaunch → unlocked).
 * IdleLockProvider clears a stale `locked` whenever there is no authenticated
 * staff, so a fresh login can never start locked.
 * The Product Peek window hydrates the same key but never writes it and is
 * deliberately not gated on it (see 21-RESEARCH.md Open Question 1).
 */
export const useLockStateStore = create<LockState>()(
  persist(
    set => ({
      locked: false,
      setLocked: locked => {
        set({ locked });
      },
    }),
    {
      name: 'lock-state',
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({ locked: state.locked }),
    }
  )
);
```

- [ ] **Step 4: Failing provider test** — in `IdleLockProvider.test.tsx` (mock `@entities/settings` `useTerminalLockSettings` → `{ data: { lockTimeoutSeconds: 60 } }`, mock `../model/useIdleLockAudit` → `{ recordLock: vi.fn(), recordUnlock: vi.fn() }`, mock `./IdleLockOverlay` to render `<div data-testid="overlay" data-open={String(open)} />`):

```tsx
it('shows the overlay on mount when locked was persisted and staff is authenticated', () => {
  useLockStateStore.setState({ locked: true });
  useStaffStore.setState({ hasHydrated: true, isAuthenticated: true, currentStaff: fakeStaff, currentShift: null });
  render(<IdleLockProvider><div>app</div></IdleLockProvider>);
  expect(screen.getByTestId('overlay')).toHaveAttribute('data-open', 'true');
  expect(recordLock).not.toHaveBeenCalled();
});

it('clears a stale persisted lock when hydrated and unauthenticated', () => {
  useLockStateStore.setState({ locked: true });
  useStaffStore.setState({ hasHydrated: true, isAuthenticated: false, currentStaff: null, currentShift: null });
  render(<IdleLockProvider><div>app</div></IdleLockProvider>);
  expect(useLockStateStore.getState().locked).toBe(false);
});

it('does NOT clear the lock before the staff store has hydrated', () => {
  useLockStateStore.setState({ locked: true });
  useStaffStore.setState({ hasHydrated: false, isAuthenticated: false });
  render(<IdleLockProvider><div>app</div></IdleLockProvider>);
  expect(useLockStateStore.getState().locked).toBe(true);
});
```

Check how existing tests build a `Staff` fixture (grep `currentStaff:` in `src/**/*.test.tsx`) and reuse that shape. Wrap in `QueryClientProvider` only if the mocked hooks still need it.

- [ ] **Step 5: Implement the clearing effect** in `IdleLockProvider.tsx`:

```tsx
const hasHydrated = useStaffStore(s => s.hasHydrated);
// A stale persisted lock must never trap a fresh login: no authenticated
// staff ⇒ nothing is locked. Gated on hasHydrated because isAuthenticated is
// false for one microtask before the staff store rehydrates.
useEffect(() => {
  if (hasHydrated && !isAuthenticated) {
    useLockStateStore.getState().setLocked(false);
  }
}, [hasHydrated, isAuthenticated]);
```

- [ ] **Step 6: Run** both unit files → PASS. Also run `npx vitest run src/features/idle-screen-lock` and `src/shared/ui/ConfirmDialog` tests to make sure nothing that reads `locked` broke.

- [ ] **Step 7: E2E spec** `e2e/security/idle-lock-restart.spec.ts` (copy `seedLockTimeout`/`clearLockTimeout` from `e2e/security/idle-lock.spec.ts`; follow its describe/beforeEach shape and `requireIntegrationEnv`):

```ts
test('relaunching the app while locked still shows the PIN overlay', async ({ context, page }) => {
  await loginAs(page, 'admin');
  await page.goto('/home');
  const overlay = page.getByRole('alertdialog'); // match idle-lock.spec.ts's locator exactly
  await expect(overlay).toBeVisible({ timeout: 25_000 });

  // "Restart": same browser context (same localStorage), brand-new JS realm.
  await page.close();
  const relaunched = await context.newPage();
  await relaunched.goto('/home');

  const overlay2 = relaunched.getByRole('alertdialog');
  await expect(overlay2).toBeVisible();
  // Route content must not be reachable behind it.
  await relaunched.goto('/pos');
  await expect(relaunched.getByRole('alertdialog')).toBeVisible();
  await expect(relaunched.getByPlaceholder(/search products|buscar productos/i)).not.toBeVisible();

  await enterPin(relaunched, process.env.E2E_ADMIN_PIN ?? '0000'); // reuse how idle-lock.spec.ts unlocks
  await expect(relaunched.getByRole('alertdialog')).toBeHidden();
});

test('relaunching while unlocked does not lock', async ({ context, page }) => {
  await loginAs(page, 'admin');
  await page.close();
  const relaunched = await context.newPage();
  await relaunched.goto('/home');
  await expect(relaunched.getByRole('heading').first()).toBeVisible();
  await expect(relaunched.getByRole('alertdialog')).toHaveCount(0);
});
```

Read `idle-lock.spec.ts` first and reuse its exact overlay locator and unlock helper (it may use a `data-testid`; match it). If `enterPin` types into the login form rather than the overlay keypad, mirror whatever `idle-lock.spec.ts` does for unlock.

- [ ] **Step 8: Run** `npx playwright test e2e/security/idle-lock-restart.spec.ts` → PASS. Then `npx playwright test e2e/security/idle-lock.spec.ts e2e/security/idle-lock-bypass.spec.ts` → still PASS.

- [ ] **Step 9: Commit** — `fix(security): persist idle-lock state so an app restart cannot bypass the PIN overlay`.

---

### Task 2: Navigation guard store + Sidebar integration

**Files:**
- Create: `src/shared/lib/navigation-guard.ts`
- Create: `src/shared/lib/navigation-guard.test.ts`
- Modify: `src/widgets/AppShell/ui/Sidebar.tsx` (NavEntry `NavLink` onClick, Home `NavLink`, `handleSignOut`, `ManagerPinDialog.onSuccess`)
- Extend: existing Sidebar test if one exists (`src/widgets/AppShell/**/*.test.tsx`), else create `src/widgets/AppShell/ui/Sidebar.guard.test.tsx`

**Interfaces:**
- Produces:
```ts
export type NavigationGuard = () => Promise<boolean>; // true = proceed
export const useNavigationGuardStore: UseBoundStore<StoreApi<{
  guard: NavigationGuard | null;
  setGuard: (guard: NavigationGuard | null) => void;
}>>;
/** Runs the installed guard (if any). Resolves true when navigation may proceed. */
export async function confirmNavigation(): Promise<boolean>;
```

- [ ] **Step 1: Failing test**

```ts
import { confirmNavigation, useNavigationGuardStore } from './navigation-guard';

beforeEach(() => useNavigationGuardStore.setState({ guard: null }));

it('resolves true when no guard is installed', async () => {
  await expect(confirmNavigation()).resolves.toBe(true);
});
it('delegates to the installed guard', async () => {
  const guard = vi.fn().mockResolvedValue(false);
  useNavigationGuardStore.getState().setGuard(guard);
  await expect(confirmNavigation()).resolves.toBe(false);
  expect(guard).toHaveBeenCalledOnce();
});
it('resolves true (fail-open) if the guard throws', async () => {
  useNavigationGuardStore.getState().setGuard(() => Promise.reject(new Error('x')));
  await expect(confirmNavigation()).resolves.toBe(true);
});
```

- [ ] **Step 2: Implement** (plain `create`, no persist; `confirmNavigation` wraps in try/catch → `true`).

- [ ] **Step 3: Sidebar integration.** Add a helper inside `Sidebar.tsx`:

```ts
// Navigation from the sidebar must honour the page-installed guard (Settings
// installs one while a tab has unsaved changes). NavLink handles the default
// case; when a guard is installed we take over and navigate imperatively.
function useGuardedNavigate() {
  const navigate = useNavigate();
  return useCallback(
    async (to: string) => {
      if (await confirmNavigation()) void navigate(to);
    },
    [navigate]
  );
}
```
Then:
  - `NavEntry` `NavLink.onClick`: `const hasGuard = useNavigationGuardStore(s => s.guard !== null);` — if `hasGuard` and not gated: `event.preventDefault(); void guardedNavigate(item.path);`. Gated path: keep `preventDefault(); onGated(...)` (the PIN dialog's `onSuccess` is guarded below).
  - Home `NavLink`: same `hasGuard` treatment.
  - `handleSignOut`: `void (async () => { if (!(await confirmNavigation())) return; logout(); void navigate('/login'); })();`
  - `ManagerPinDialog.onSuccess`: replace `void navigate(path)` with `void guardedNavigate(path)`.

- [ ] **Step 4: Sidebar test** — render Sidebar inside `MemoryRouter` + whatever providers its existing test uses (look for `Sidebar.test.tsx` / `AppShell.test.tsx`; if none, mock `@entities/staff/model/store`, `@entities/inventory` near-expiry hook, etc., minimally). Cases: with `guard` resolving `false`, clicking Home does not change `useLocation().pathname` (render a `<LocationDisplay/>` probe); with `guard` resolving `true`, it does.

- [ ] **Step 5: Run** the two test files + `npx eslint src/widgets/AppShell src/shared/lib/navigation-guard.ts` → clean. **Commit** — `feat(app-shell): navigation guard store honoured by sidebar links`.

---

### Task 3: Unsaved-changes registry, dialog, controlled Settings tabs

**Files:**
- Create: `src/widgets/SettingsTabsPanel/model/unsaved-changes.tsx`
- Create: `src/widgets/SettingsTabsPanel/model/unsaved-changes.test.tsx`
- Create: `src/widgets/SettingsTabsPanel/ui/UnsavedChangesDialog.tsx`
- Create: `src/widgets/SettingsTabsPanel/ui/UnsavedChangesDialog.test.tsx`
- Modify: `src/widgets/SettingsTabsPanel/index.tsx`
- Modify: `src/widgets/SettingsTabsPanel/SettingsTabsPanel.test.tsx`
- Modify: `src/shared/lib/i18n/locales/en-US/settings.json`, `src/shared/lib/i18n/locales/es-MX/settings.json`

**Interfaces:**
- Produces:
```ts
// model/unsaved-changes.tsx
export type SaveHandler = () => Promise<boolean>;
export interface UnsavedChangesRegistry {
  report: (dirty: boolean, save: SaveHandler) => void; // called from an effect by the mounted tab
  clear: () => void;                                    // tab unmount
}
export const UnsavedChangesContext: React.Context<UnsavedChangesRegistry | null>;
/** Tabs call this. No-op when rendered outside SettingsTabsPanel (unit tests of a tab alone). */
export function useRegisterUnsavedChanges(dirty: boolean, save: SaveHandler): void;
/** Panel-side hook: owns refs + prompt state. */
export function useUnsavedChangesController(): {
  registry: UnsavedChangesRegistry;
  isDirty: () => boolean;
  /** Resolve true when the caller may proceed (not dirty, or user chose Save-success/Discard). */
  requestLeave: () => Promise<boolean>;
  dialogProps: { open: boolean; saving: boolean; onSave: () => void; onDiscard: () => void; onCancel: () => void };
};
```
  `useRegisterUnsavedChanges` must store the latest `save` in a ref (tabs recreate closures every render) and call `report(dirty, () => saveRef.current())` in a `useEffect([dirty])`, `clear()` on unmount.
  `requestLeave` returns a Promise resolved by the dialog buttons: Save → `await save()`; `true` ⇒ resolve(true) and close; `false` ⇒ stay open (`saving` back to false). Discard ⇒ resolve(true). Cancel/Escape ⇒ resolve(false). Only one pending request at a time (a second call while open resolves false immediately).

- `UnsavedChangesDialog` props = `dialogProps` above. Built from `AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter` in `@shared/ui` + three `Button`s (`onSave` = default variant, autoFocus via ref+effect — `jsx-a11y/no-autofocus` is an error; `onDiscard` = `variant="outline"` with destructive text classes; `onCancel` = `variant="ghost"`). `onOpenChange(false)` ⇒ `onCancel`. Disable all three while `saving`. Namespace `settings`, keys:
```json
"unsavedChanges": {
  "title": "Save changes?",
  "description": "You have unsaved changes on this tab. Save them before leaving?",
  "save": "Save",
  "discard": "Discard",
  "cancel": "Cancel"
}
```
es-MX: `"¿Guardar cambios?"`, `"Tienes cambios sin guardar en esta pestaña. ¿Guardarlos antes de salir?"`, `"Guardar"`, `"Descartar"`, `"Cancelar"`.

- [ ] **Step 1: Failing tests for the controller** (`unsaved-changes.test.tsx`, use `renderHook`):
  - not dirty ⇒ `requestLeave()` resolves `true` without opening the dialog.
  - dirty ⇒ `requestLeave()` leaves `dialogProps.open === true`; `onCancel()` ⇒ resolves `false`; dialog closed.
  - dirty, `onDiscard()` ⇒ resolves `true`.
  - dirty, save resolves `true` ⇒ `onSave()` resolves the promise `true` and closes.
  - dirty, save resolves `false` ⇒ still open, promise pending, `saving` false again.
  - `useRegisterUnsavedChanges` inside a `UnsavedChangesContext.Provider` reports on dirty change and clears on unmount; outside a provider it is a no-op (no throw).
- [ ] **Step 2: Implement** `model/unsaved-changes.tsx` to green.
- [ ] **Step 3: Failing dialog test** — three buttons with the i18n labels (tests render with the real i18n instance the other settings tests use — check `SettingsTabsPanel.test.tsx` for the pattern), clicking each calls the matching prop, Escape calls `onCancel`, `saving` disables all.
- [ ] **Step 4: Implement** `ui/UnsavedChangesDialog.tsx` + JSON keys.
- [ ] **Step 5: Controlled Tabs** in `index.tsx`:
```tsx
const controller = useUnsavedChangesController();
const [activeTab, setActiveTab] = useState(firstTab.key); // firstTab is non-null past the early return — move the hook above the return or derive safely with `allTabs[0]?.key ?? ''`
const handleTabChange = (next: string) => {
  if (next === activeTab) return;
  void controller.requestLeave().then(ok => { if (ok) setActiveTab(next); });
};
...
<UnsavedChangesContext.Provider value={controller.registry}>
  <Tabs value={activeTab} onValueChange={handleTabChange} ...>
  ...
  </Tabs>
  <UnsavedChangesDialog {...controller.dialogProps} />
</UnsavedChangesContext.Provider>
```
  Hooks must not sit after the `if (!firstTab) return` — restructure so all hooks run unconditionally (compute `initialKey = allTabs[0]?.key ?? ''`).
  Also install the route guard here: `useEffect(() => { useNavigationGuardStore.getState().setGuard(() => controller.requestLeave()); return () => useNavigationGuardStore.getState().setGuard(null); }, [controller.requestLeave])` — make `requestLeave` referentially stable (`useCallback` with refs) so this effect runs once.
- [ ] **Step 6: Panel test** — add to `SettingsTabsPanel.test.tsx` a fake tab: mock one tab module (e.g. `./tabs/LockSettingsTab`) with a component that calls `useRegisterUnsavedChanges(true, save)` and renders `<p>lock-tab</p>`; render panel as admin; click the Language tab trigger ⇒ dialog visible, `lock-tab` still rendered; click Cancel ⇒ still `lock-tab`; click again then Discard ⇒ Language tab content rendered; repeat with Save (`save` mock resolves true) ⇒ `save` called once and tab switched. Also assert `useNavigationGuardStore.getState().guard` is non-null while mounted and null after unmount.
- [ ] **Step 7: Run** the three test files + eslint → clean. **Commit** — `feat(settings): unsaved-changes registry, Save/Discard/Cancel prompt, controlled tabs`.

---

### Task 4: Wire the seven dirty-capable tabs + app-close guard

**Files:**
- Modify: `src/widgets/SettingsTabsPanel/tabs/{LanguageSettingsTab,GeneralSettingsTab,EmailReceiptsSettingsTab,LockSettingsTab,NearExpirySettingsTab,BillingSettingsTab,HardwareSettingsTab}.tsx`
- Modify: `src/widgets/SettingsTabsPanel/index.tsx` (close guard effect)
- Create: `src/widgets/SettingsTabsPanel/model/useCloseGuard.ts` + `useCloseGuard.test.ts`
- Extend: `LanguageSettingsTab.test.tsx`, `BillingSettingsTab.test.tsx`, `HardwareSettingsTab.test.tsx`, `NearExpirySettingsTab.test.tsx` (one assertion each: the tab reports dirty to a test provider after an edit and `save` persists)

**Interfaces:**
- Consumes: `useRegisterUnsavedChanges(dirty, save)` from Task 3.
- Produces: `useCloseGuard(isDirty: () => boolean, requestLeave: () => Promise<boolean>): void`.

- [ ] **Step 1: Per-tab wiring pattern** (repeat in each tab; example for Lock):
```tsx
const save = useCallback(async (): Promise<boolean> => {
  const value = Number(seconds);
  if (!Number.isInteger(value) || value < 15 || value > 600) return false;
  const result = await updateSetting.mutateAsync(value);
  if (!result.ok) { toast.error(result.error.message); return false; }
  setDirty(false);
  toast.success(t('lockSettingsTab.saved'));
  return true;
}, [seconds, updateSetting, t]);
useRegisterUnsavedChanges(dirty, save);
```
  The existing Save button calls the same `save`. Rules per tab (spec table): Billing registers `dirty || labelsDirty` and a `save` that runs the billing save if `dirty` then the labels save if `labelsDirty`, returning `false` on the first failure — reuse the exact code the two existing buttons run (the tax-inclusive `ConfirmDialog` path stays for the button; the registered `save` calls the underlying save directly, which is what the confirm's confirm button calls). Hardware registers `terminalIdInput !== savedTerminalId` and a save that runs the existing terminal-ID save and returns `true`. General: `dirty` + form save (logo untouched). EmailReceipts: `dirty` + save. NearExpiry: `dirty` + save. Language: `dirty` + save. Wrap any `mutate(...)` call-style handler into `mutateAsync` + try/catch returning boolean; do not change what is persisted.
- [ ] **Step 2: Tab tests** — for each listed test file add: render tab inside `<UnsavedChangesContext.Provider value={{ report, clear }}>`, edit the field, `expect(report).toHaveBeenLastCalledWith(true, expect.any(Function))`, then `await act(() => report.mock.lastCall[1]())` resolves `true` and the mocked mutation was called. Run each file scoped.
- [ ] **Step 3: Close guard**
```ts
// model/useCloseGuard.ts
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
export function useCloseGuard(isDirty: () => boolean, requestLeave: () => Promise<boolean>): void {
  useEffect(() => {
    if (isTauri()) {
      const win = getCurrentWindow();
      const unlisten = win.onCloseRequested(async event => {
        if (!isDirty()) return;
        event.preventDefault();
        if (await requestLeave()) void win.destroy();
      });
      return () => { void unlisten.then(fn => fn()); };
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty()) return;
      e.preventDefault();
      e.returnValue = ''; // required by Chromium to show the native prompt
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty, requestLeave]);
}
```
  Test with `vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))` and a mocked `getCurrentWindow` returning `{ onCloseRequested: vi.fn(async cb => { captured = cb; return () => {} }), destroy: vi.fn() }`: dirty + requestLeave→true ⇒ `preventDefault` called and `destroy` called; dirty + false ⇒ no destroy; not dirty ⇒ no preventDefault. Browser branch: dispatch a `beforeunload` Event and assert `defaultPrevented` when dirty. Call `useCloseGuard(controller.isDirty, controller.requestLeave)` from `index.tsx`.
- [ ] **Step 4: Run** all SettingsTabsPanel tests (`npx vitest run src/widgets/SettingsTabsPanel`) + eslint → clean. **Commit** — `feat(settings): register unsaved changes from every form tab; guard app close`.

---

### Task 5: Settings guard E2E

**Files:**
- Create: `e2e/settings/unsaved-changes-guard.spec.ts`

- [ ] **Step 1: Write spec** (admin; read `e2e/settings/lock-timeout.spec.ts` for the tab/field/save locators and the `terminal_lock_settings` cleanup pattern):
  1. `goto('/settings')`, click Lock tab (`getByRole('tab', { name: /auto-lock timeout|bloqueo automático/i })`), fill `#lock-timeout-threshold` with `120`, click Language tab ⇒ `getByRole('alertdialog')` with the Save/Discard/Cancel buttons visible. Click Cancel ⇒ `#lock-timeout-threshold` still visible with `120`.
  2. Click Language tab again ⇒ Discard ⇒ Language tab panel visible (`#settings-language`); go back to Lock tab ⇒ value is the seeded original (not 120).
  3. Fill `150`, click Language tab ⇒ Save ⇒ `waitForResponse(r => r.url().includes('/rest/v1/terminal_lock_settings') && r.request().method() !== 'GET')`; reload ⇒ Lock tab shows `150`.
  4. Fill `200`, click sidebar Home (`getByRole('link', { name: /^home$|^inicio$/i })`) ⇒ prompt ⇒ Discard ⇒ `expect(page).toHaveURL(/\/home$/)`.
  5. Fill `210`, then `page.close({ runBeforeUnload: true })` after registering `page.once('dialog', d => { sawDialog = d.type() === 'beforeunload'; void d.dismiss(); })` ⇒ `sawDialog === true`. (Use a fresh page from `context.newPage()` for this last case so it doesn't kill the others.)
  Seed/restore the lock timeout row in `beforeEach`/`afterEach` like `lock-timeout.spec.ts` does.
- [ ] **Step 2: Run** `npx playwright test e2e/settings/unsaved-changes-guard.spec.ts` → PASS; then `npx playwright test e2e/settings/lock-timeout.spec.ts e2e/settings/i18n-locale-switch.spec.ts e2e/receipts/settings.spec.ts` → still PASS (they never leave a tab dirty, so no prompt should appear; if one does, fix the tab's dirty tracking, not the spec).
- [ ] **Step 3: Commit** — `test(e2e): settings unsaved-changes guard`.

---

### Task 6: Checkout keypad feature slice

**Files:**
- Create: `src/features/checkout-keypad/model/useKeypadBuffer.ts` + `.test.ts`
- Create: `src/features/checkout-keypad/model/useKeypadVisible.ts` + `.test.ts`
- Create: `src/features/checkout-keypad/ui/CheckoutKeypad.tsx` + `.test.tsx`
- Create: `src/features/checkout-keypad/index.ts`
- Modify: `src/shared/lib/i18n/locales/en-US/wPanels.json`, `.../es-MX/wPanels.json` (keys under `checkoutPanel.keypad`)

**Interfaces:**
- Produces:
```ts
export const KEYPAD_MAX_LEN = 13;
export const QTY_MIN = 1; export const QTY_MAX = 99;
export interface KeypadState { buffer: string; multiplier: number | null }
export type KeypadAction =
  | { type: 'digit'; digit: string }   // '0'-'9' only; others ignored
  | { type: 'backspace' } | { type: 'clear' }
  | { type: 'armQty' }                 // buffer→multiplier if int in [1,99]; else {rejected:true}
  | { type: 'consumeMultiplier' }      // multiplier→null (after an add)
  | { type: 'consumeBuffer' };         // buffer→'' (after Add/PLU)
export function keypadReducer(state: KeypadState, action: KeypadAction): KeypadState;
/** Pure helper used by the UI to decide whether armQty will be rejected. */
export function parseQty(buffer: string): number | null;
export function useKeypadBuffer(): {
  state: KeypadState;
  pressDigit: (d: string) => void; backspace: () => void; clear: () => void;
  armQty: () => boolean;            // false when rejected (caller toasts)
  takeMultiplier: () => number;     // returns multiplier ?? 1 and clears it
  takeBuffer: () => string;         // returns buffer and clears it
};
export function useKeypadVisible(): [visible: boolean, setVisible: (v: boolean) => void]; // localStorage 'pos.keypad_visible', default true, try/catch around storage
export interface CheckoutKeypadProps {
  state: KeypadState; disabled: boolean;
  onDigit: (d: string) => void; onBackspace: () => void; onClear: () => void;
  onArmQty: () => void; onAdd: () => void;
}
export function CheckoutKeypad(props: CheckoutKeypadProps): JSX.Element;
```
  Reducer rules: digits append unless length ≥ 13; `'0' + '5'` ⇒ `'5'` (a buffer that is exactly `'0'` is replaced, not appended); `parseQty` = `/^\d+$/` and 1–99 else `null`.

- [ ] **Step 1: Failing reducer tests** incl. a fast-check property: for any sequence of `digit`/`backspace` actions, `buffer.length <= 13` and (`buffer === '' || buffer === '0' || !buffer.startsWith('0')`). Plus `armQty` for `'0'`, `'100'`, `''` leaves state unchanged and `parseQty` returns null; for `'5'` ⇒ `{ buffer: '', multiplier: 5 }`.
- [ ] **Step 2: Implement** reducer + hook (`useReducer`).
- [ ] **Step 3: `useKeypadVisible` test** — default true when storage empty; `setVisible(false)` writes `'false'`; reading `'false'` yields false; storage throwing doesn't crash. Implement.
- [ ] **Step 4: Failing UI test** — renders 10 digit buttons (`getByRole('button', { name: '7' })`), clear/backspace/qty/add buttons by accessible name from i18n, display shows `0` for empty buffer and `×3` badge when `multiplier: 3`; `disabled` disables every button; clicking `7` calls `onDigit('7')`.
- [ ] **Step 5: Implement `CheckoutKeypad`** — `<section aria-label={t('checkoutPanel.keypad.title')} data-testid="checkout-keypad" className="flex w-52 flex-col gap-2 border-l border-border bg-card p-3">`; display `<output data-testid="keypad-display" aria-live="polite" className="rounded-lg bg-muted px-3 py-2 text-right font-mono text-2xl tabular-nums">`; `<span data-testid="keypad-multiplier">×N</span>` only when armed; grid `grid-cols-3 gap-2` with `POSButton touchSize="large" variant="outline"` for digits/`C`/backspace (`⌫` needs `aria-label={t('checkoutPanel.keypad.backspace')}`, `C` needs `aria-label={t('checkoutPanel.keypad.clear')}`), then two full-width `POSButton touchSize="large"`: `× Qty` (`variant="secondary"`) and `Add` (default). All buttons `type="button"`. No key listeners.
  JSON (en-US, under `checkoutPanel`):
```json
"keypad": {
  "title": "Keypad", "toggle": "Toggle keypad", "qty": "× Qty", "add": "Add (PLU)",
  "clear": "Clear", "backspace": "Backspace", "armed": "×{{count}} armed for next item",
  "qtyRange": "Quantity must be between 1 and 99", "notFound": "No product with code {{code}} — showing search results"
}
```
  es-MX: `"Teclado"`, `"Mostrar u ocultar teclado"`, `"× Cant."`, `"Agregar (PLU)"`, `"Borrar"`, `"Retroceso"`, `"×{{count}} para el siguiente artículo"`, `"La cantidad debe estar entre 1 y 99"`, `"No hay producto con código {{code}}; mostrando resultados de búsqueda"`.
- [ ] **Step 6: Run** `npx vitest run src/features/checkout-keypad` + eslint → clean. **Commit** — `feat(checkout): tap-only numeric keypad feature slice`.

---

### Task 7: Compose keypad into CheckoutPanel + E2E

**Files:**
- Modify: `src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx`
- Extend: `src/widgets/CheckoutPanel/**/*.test.tsx` if a CheckoutPanel unit test exists (grep); otherwise no new unit test — the e2e covers integration
- Create: `e2e/checkout/keypad.spec.ts`

**Interfaces:**
- Consumes everything from Task 6 via `@features/checkout-keypad`.

- [ ] **Step 1: Integrate**
  - `const keypad = useKeypadBuffer(); const [keypadVisible, setKeypadVisible] = useKeypadVisible();`
  - `const keypadDisabled = !scannerEnabled;` (same gating expression already computed for the scanner; reuse the variable).
  - Extract the tile-tap add into `const addProductTimes = (product: Product, times: number) => { const match = resolvePromotionMatch(product); for (let i = 0; i < times; i += 1) addItem(product, [], match?.discountedUnitPrice, match?.promotionId ?? null); };`
  - `ProductGrid.onSelect`: weighted products keep today's behaviour and call `keypad.takeMultiplier()` only to disarm; otherwise `addProductTimes(product, keypad.takeMultiplier())`. Check how `ProductGrid`/`weightEntry` currently intercepts weighted products (the `onSelect` may only fire for non-weighted ones — read `ProductGrid` first and put the disarm where weighted selection is handled).
  - `onArmQty`: `if (!keypad.armQty()) toast.error(t('checkoutPanel.keypad.qtyRange'));`
  - `onAdd`: `const code = keypad.takeBuffer().trim(); if (!code) return; const products = useProductStore.getState().products` (or the `useProducts()` query data — use whichever CheckoutPanel/ProductGrid already reads; do not add a new query) `; const hit = products.find(p => p.barcode?.trim() === code && p.active !== false);` if `hit` ⇒ same path as a tile tap (weighted ⇒ open the weight flow the way ProductGrid does; else `addProductTimes(hit, keypad.takeMultiplier())`); else `setSearch(code); toast.info(t('checkoutPanel.keypad.notFound', { code }));`
  - Toolbar: add `<Button type="button" variant={keypadVisible ? 'secondary' : 'ghost'} size="icon" aria-pressed={keypadVisible} aria-label={t('checkoutPanel.keypad.toggle')} data-testid="keypad-toggle" onClick={() => setKeypadVisible(!keypadVisible)}><Calculator className="size-5" /></Button>` next to the search input.
  - Grid: `lg:grid-cols-[minmax(0,1fr)_auto_minmax(24rem,28rem)]` when visible, existing two-column classes when hidden; render `<CheckoutKeypad ... />` wrapped in `<div className="hidden lg:flex min-h-0">` between the catalogue `<section>` and the cart `<aside>`. The cart must remain the only `<aside>`.
- [ ] **Step 2: Typecheck + eslint** on `CheckoutPanel.tsx` → clean. Run any existing CheckoutPanel/PaymentForm unit tests scoped.
- [ ] **Step 3: E2E** `e2e/checkout/keypad.spec.ts` — follow `e2e/checkout/happy-path.spec.ts` setup (`resetTestState`, `openCaja`, `loginAs(page,'admin')`, `goto('/pos')`). Fixture product `"Haldiram's Aloo Bhujia 200g"` has barcode `8901030800007` and price `55` (from `supabase/seed.sql`; confirm at runtime by reading the unit price text from the cart line rather than hardcoding 55 if the local DB differs).
  1. Multiplier: click `3` (`getByRole('button', { name: '3', exact: true })` scoped to `getByTestId('checkout-keypad')`), click `× Qty` ⇒ `getByTestId('keypad-multiplier')` has text `×3`; search + click `Select Haldiram's Aloo Bhujia 200g` ⇒ the `cart-line` containing the name has text matching `/× 3\b/`; `cart-total` equals 3 × unit price (parse both numbers); multiplier badge gone.
  2. PLU: click Clear cart if needed (or `resetTestState` again + reload); type `8901030800007` via digit buttons, click `Add (PLU)` ⇒ cart line for Aloo Bhujia visible with `× 1`.
  3. Unknown code: type `9876543210`, `Add` ⇒ `[data-sonner-toast]` visible; search input has value `9876543210`.
  4. Toggle: click `keypad-toggle` ⇒ `checkout-keypad` hidden; `reload()` ⇒ still hidden; click toggle ⇒ visible. `await expect(page.locator('aside')).toHaveCount(1)`.
- [ ] **Step 4: Run** `npx playwright test e2e/checkout/keypad.spec.ts` → PASS; then `npx playwright test e2e/checkout/happy-path.spec.ts e2e/checkout/barcode-scan-search.spec.ts` → still PASS.
- [ ] **Step 5: Commit** — `feat(checkout): on-screen keypad for N× adds and PLU entry`.

---

### Task 8: Integration gate

- [ ] `npm run typecheck` → clean.
- [ ] `npm run lint` → clean (max-warnings 0). Fix in place.
- [ ] `npm run test` (full Vitest) → all green.
- [ ] Playwright, one run: `npx playwright test e2e/security e2e/settings e2e/checkout/keypad.spec.ts e2e/checkout/happy-path.spec.ts e2e/checkout/barcode-scan-search.spec.ts e2e/home e2e/a11y` → green. Known environmental red from memory: `e2e/reports/report-tabs.spec.ts` (not in this list). If a failure is environmental (edge runtime 503, port), record and stop; do not loop more than one retry.
- [ ] Update `CLAUDE.md` "Implemented Features": one bullet for the Settings unsaved-changes guard, one for the checkout keypad, and add the persisted lock note next to the idle-lock mention if any. Commit `docs: note settings guard, checkout keypad, persisted idle lock`.
- [ ] Final report: list of commits, test evidence, and every `Ruling:` made during execution.
