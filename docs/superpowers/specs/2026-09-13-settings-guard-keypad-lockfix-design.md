# Settings unsaved-changes guard, checkout keypad, idle-lock restart bypass — design

Date: 2026-09-13. Branch: `worktree-settings-guard-keypad-lockfix` (from `main` @ 378b7cd).
Hard rules: never touch `main`; no business logic / domain / backend changes; no Supabase
migrations or edge functions. Everything below is client-only.

Three independent deliverables. Each ships with unit tests (Vitest) and one Playwright spec.

---

## 1. Settings: unsaved-changes guard

### Problem
`SettingsTabsPanel` renders Radix `Tabs` uncontrolled (`defaultValue` only). Radix unmounts the
inactive `TabsContent`, so switching tab silently throws away a tab's local `dirty` form state.
Route navigation (sidebar) and closing the app do the same. There is no `useBlocker` (router is
`<BrowserRouter>`, not a data router) and no Tauri close interception anywhere.

### Decision
Three interception points, one shared prompt, one shared dirty registry:

1. **Dirty registry** — `src/widgets/SettingsTabsPanel/model/unsaved-changes.tsx`:
   `UnsavedChangesContext` + hook `useRegisterUnsavedChanges(dirty: boolean, save: () => Promise<boolean>)`.
   Each dirty-capable tab calls the hook; the panel holds the latest `{dirty, save}` in refs
   (only one tab is mounted at a time). `save` resolves `true` on success, `false` on failure
   (the tab already toasts its own errors — the prompt just stays open on `false`).
2. **Tab switch** — `SettingsTabsPanel` becomes controlled (`value`/`onValueChange`). If the
   registry is dirty, the switch is deferred and the prompt opens.
3. **Route navigation** — tiny zustand store `src/shared/lib/navigation-guard.ts`:
   `{ guard: (() => Promise<boolean>) | null, setGuard }`. `SettingsTabsPanel` installs a guard
   while dirty (`() => promptAndResolve()`), clears it on unmount. `Sidebar` (both the plain
   `NavLink` path and the manager-PIN-gated `navigate()` path, and sign-out) checks the guard:
   `if (guard) { e.preventDefault(); if (await guard()) navigate(to) }`. No router migration.
4. **App close** — while dirty, `SettingsTabsPanel` registers
   `getCurrentWindow().onCloseRequested(e => { e.preventDefault(); prompt(...) })` from
   `@tauri-apps/api/window` (guarded by `isTauri()`; browser fallback registers `beforeunload`
   with `returnValue` so dev/e2e gets the native prompt). On Save-success or Discard the pending
   action is "close" → call `getCurrentWindow().destroy()`.

**Prompt** — `src/widgets/SettingsTabsPanel/ui/UnsavedChangesDialog.tsx`, built on the existing
`AlertDialog` primitives (widget-local, so no Storybook obligation). Three buttons:
**Save** (default, primary) / **Discard** (destructive outline) / **Cancel**. Save awaits the
registered `save`; on `true` it runs the pending action, on `false` it stays open. Discard runs the
pending action immediately (tab unmount resets state; for route/close nothing more is needed).
Cancel closes the prompt and drops the pending action. Escape = Cancel.

**Copy** — namespace `settings`, keys `unsavedChanges.{title,description,save,discard,cancel}` in
both `en-US` and `es-MX` (es-MX gets real Spanish: "¿Guardar cambios?", "Tienes cambios sin
guardar en esta pestaña.", "Guardar", "Descartar", "Cancelar").

### Per-tab wiring
| Tab | Registers |
|---|---|
| Language | `dirty`, save = existing save handler |
| General | `dirty`, save = existing form save (logo upload already auto-saves; untouched) |
| EmailReceipts | `dirty` (fromEmail), save = existing save. `testRecipient` is not a setting; ignored |
| Lock | `dirty`, save = existing save |
| NearExpiry | `dirty`, save = existing save |
| Billing | `dirty || labelsDirty`, save = run whichever of the two saves is dirty (sequentially); the tax-inclusive confirm path is unchanged — if `dirty` includes a taxInclusive flip, save runs the same code the confirm's confirm-button runs |
| Hardware | `terminalIdInput !== savedTerminalId`, save = the existing terminal-ID save. Receipt fields auto-save on change/blur (blur fires before any tab/nav click lands), so they need no tracking |
| Backup, License | nothing (no forms) |

Tabs keep their own Save buttons and dirty flags; the hook is additive (one line per tab plus a
`useCallback` for save). Each save handler must return `Promise<boolean>` — where the current
handler is `void`, wrap the mutation's `mutateAsync` in try/catch.

### Testing
- Vitest: `unsaved-changes.test.tsx` (registry semantics), `UnsavedChangesDialog.test.tsx`
  (three buttons, save-false keeps it open), `SettingsTabsPanel.test.tsx` addition (dirty tab +
  click other tab → prompt; Cancel keeps tab; Discard switches; Save calls save then switches),
  `navigation-guard.test.ts`.
- Playwright `e2e/settings/unsaved-changes-guard.spec.ts` (admin): edit Lock timeout → click
  Language tab → prompt visible → Cancel keeps value → Discard switches and reload shows old
  value; edit again → click another tab → Save → PATCH `/rest/v1/terminal_lock_settings` observed,
  reload shows new value; edit → click sidebar Home → prompt → Discard → URL is `/home`.
  Browser-close path: assert `beforeunload` fires via `page.on('dialog')` after an edit
  (Playwright `page.close({ runBeforeUnload: true })`) — Tauri `onCloseRequested` is covered
  by unit test with a mocked `@tauri-apps/api/window` only (native shell is the documented
  manual carve-out).

---

## 2. Checkout keypad

### Problem
`/pos` on a touch terminal has no way to type a quantity or a barcode/PLU without a physical
keyboard: quantity is ±1 stepper only (1–99), and the search box needs a keyboard.

### Decision
A tap-only numeric keypad panel in `CheckoutPanel`, new feature slice
`src/features/checkout-keypad/` (`model/useKeypadBuffer.ts`, `ui/CheckoutKeypad.tsx`,
`index.ts`). Tap-only: no synthetic key events, no physical-keyboard listener — this keeps it
invisible to the global `useBarcodeScanner` keydown buffer and the search input's focus.

**Layout** — third grid column between the product grid and the cart `<aside>` at `lg:`
(`lg:grid-cols-[minmax(0,1fr)_auto_minmax(24rem,28rem)]`), width ~13rem, hidden below `lg:`.
Header toolbar gets a toggle button (icon `Calculator` from lucide, `aria-pressed`,
`aria-label` = t('checkoutPanel.keypad.toggle')). Visibility persists per terminal in
`localStorage` key `pos.keypad_visible` (default visible), via a small `useKeypadVisible()`
hook in the feature (same pattern as `shared/lib/terminal.ts`, but feature-local). The cart must
remain the page's only `<aside>` (e2e relies on it) — the keypad is a `<section aria-label>`.

**Keys** — 7-8-9 / 4-5-6 / 1-2-3 / C-0-⌫ digit grid, plus two action keys under it:
`× Qty` and `Add (PLU)`. Buttons are `POSButton touchSize="large"` (56px). A display strip above
the grid shows the buffer (or `0`) and, when a multiplier is armed, a `×N` badge.

**Buffer semantics** (`useKeypadBuffer`, pure, unit-tested):
- digits append (max 13 chars, leading zeros collapse: `"0"` + `"5"` → `"5"`); `C` clears both
  the buffer and the armed multiplier; `⌫` removes the last char.
- `× Qty`: if buffer is a valid integer 1–99 → arm multiplier `N`, clear buffer.
  If buffer is empty and the cart has lines → apply nothing (no-op; the badge tells the user
  what's armed). Integers > 99 or 0 are rejected (buffer shakes/clears, toast
  `checkoutPanel.keypad.qtyRange`).
- **Qty-first add**: while a multiplier `N` is armed, the next product tile tap adds `N` units
  (`CheckoutPanel` loops the existing `addItem(...)` `N` times exactly like the
  `ADD_TO_CART_EVENT` handler already does, then disarms). Weighted products ignore the
  multiplier (the weight dialog opens as today) and disarm it.
- One rule only: `× Qty` **arms** a multiplier for the next add. There is no selected-line
  concept; to change an existing line the cashier uses that line's stepper as today. The
  "5 × item" register habit is what the keypad adds. (ponytail: selected-line qty edit is the
  upgrade path if asked.)
- `Add (PLU)`: buffer non-empty → exact match against the already-loaded products list
  (`useProducts()` data) on `barcode` (string equality after trim); if found → add with the armed
  multiplier (default 1) via the same tile-tap path; if not found → `setSearch(buffer)` so the
  grid filters, plus toast `checkoutPanel.keypad.notFound`. Buffer clears either way.
- Keypad is disabled (all buttons `disabled`) while `locked`, `paymentOpen`, or the weight dialog
  is open (same gating as `scannerEnabled`).

No changes to `cartStore` or any `entities/*/model`. No pricing logic: the tile-tap path already
resolves promotions per unit.

**Copy** — namespace `wPanels`, `checkoutPanel.keypad.{toggle,title,qty,add,clear,backspace,armed,qtyRange,notFound}` in en-US and es-MX.

### Testing
- Vitest: `useKeypadBuffer.test.ts` (append/clear/backspace/arm/reject/collapse; fast-check
  property: buffer never exceeds 13 chars and never has leading zero unless it is `"0"`),
  `CheckoutKeypad.test.tsx` (renders keys, disabled state, toggle persists to localStorage).
- Playwright `e2e/checkout/keypad.spec.ts` (admin, caja open, uses seeded fixture products
  from existing checkout specs): (a) tap `3`, `× Qty`, tap a product tile → the cart line shows
  `× 3` and `cart-total` = 3 × unit price; (b) type the fixture product's barcode, `Add` →
  line added; (c) type `9876543210` (unknown), `Add` → toast + search box contains it;
  (d) toggle hides the keypad, `reload` keeps it hidden, toggle shows again. Assert the page
  still has exactly one `aside`.

---

## 3. Idle-lock bypass on app restart (security bug)

### Root cause
`useLockStateStore` (`src/shared/lib/lock-state-store.ts`) is in-memory only ("deliberately no
persist"), while the two things that gate boot are persisted: the Supabase session
(`persistSession: true`) and `staff-store.isAuthenticated` (zustand `persist`). Alt+F4 on the
lock overlay → relaunch → `locked` boots `false` → `ProtectedRoute` renders `/home`. The idle
timer only re-arms from zero. An attacker at a locked terminal needs only the window's close
button.

### Decision
Persist the lock flag. `useLockStateStore` gains `persist` (`name: 'lock-state'`,
`partialize: { locked }`, `createJSONStorage(() => localStorage)`, sync hydration). Because the
staff store hydrates synchronously from localStorage too, the very first render of
`IdleLockProvider` sees `isAuthenticated: true` + `locked: true` and paints the overlay before
any route content is interactive.

One guard so a stale flag can never trap a fresh login: in `IdleLockProvider`,
`useEffect(() => { if (hasHydrated && !isAuthenticated) setLocked(false) }, [hasHydrated, isAuthenticated])`
— no authenticated user means nothing is locked (covers "session expired while locked → login →
would otherwise re-lock immediately"). Update the store's doc comment (the "deliberately no
persist" rationale is now wrong; the Product Peek window note stays true — it hydrates the same
key but never writes it and is not gated on it).

Restart while *unlocked* keeps today's behaviour (session restore, idle timer from zero). That is
not a bypass — the screen was already open. A "require PIN on every launch" or
"lock if closed longer than the idle timeout" option is a separate feature; noted, not built.

### Testing
- Vitest: `lock-state-store.test.ts` (persists `locked` to `localStorage['lock-state']`,
  rehydrates `true` on a fresh store instance), `IdleLockProvider.test.tsx` addition (persisted
  `locked: true` + authenticated → overlay open on mount, no `screen.lock` audit written;
  persisted `locked: true` + hydrated unauthenticated → `locked` becomes `false`).
- Playwright `e2e/security/idle-lock-restart.spec.ts`: seed `lock_timeout_seconds = 15` (reuse
  `seedLockTimeout` from `idle-lock.spec.ts` — extract to a helper if needed), `loginAs(admin)`,
  wait for the overlay, then simulate a restart: `page.close()` → `context.newPage()` →
  `goto('/home')` (same context ⇒ same localStorage, fresh JS realm). Assert the overlay is
  visible **before** any `/home` tile is clickable, `/pos` is not reachable, and entering PIN
  `0000` unlocks. Second test: `context.newPage()` restart while unlocked → no overlay (regression
  guard for the fresh-login path).

---

## Out of scope (explicit)
- Router migration to `createBrowserRouter` / `useBlocker`.
- Guarding dialogs other than Settings (ProductDetailDialog already has its own discard guard).
- Selected-cart-line quantity editing, open-price entry, tender-amount keypad in `PaymentForm`.
- "Lock on every launch" setting.
