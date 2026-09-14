# Demo Edition + Online Demo — design (2026-09-14)

Branch `feat/demo-edition` (worktree `.claude/worktrees/demo-edition`). Companion branch
`feat/demo-plan` in the sibling repo `D:\Projects\Code\pos-license-server`. Nothing is pushed to
any remote and no remote Supabase project is touched; every backend change is applied to the
**local** Docker stacks only (POS 543xx, license server 553xx).

## 1. Problem

Two sales channels are missing:

1. **Demo edition** — a prospect installs the real POS (or opens it in a browser) and uses it
   for 14 days with a fixed set of premium features locked behind an "Get the full version"
   prompt. Same binary as paying customers; the *license* decides what is locked.
2. **Online demo on bola8pos.com** — the same app, built for the browser, hosted at
   `demo.bola8pos.com`, auto-provisioned as a demo, pre-seeded with a realistic Indian-grocery
   catalog and shared demo staff accounts, reset every night.

## 2. Research: don't reinvent

| Need | Existing wheel | Decision |
|---|---|---|
| "Which features may this install use?" | Licensing decision record already names the upgrade path: *"Per-feature entitlements → add a `features` array to the token payload"* (Keygen entitlement model). | Add `features` to the signed token. Client only reads it. |
| Trial expiry / lock screen / warning banners | `evaluateLicense` + `LicenseGate` + `LicenseBanner` already implement period_end / grace / lease. | Demo = plan `demo` with `period_end = +14d`, `grace_days = 0`, `lease_days = 14`, `max_terminals = 1`. One new lock reason `demo_expired` for copy. |
| Disabling a control with a tooltip | `shared/ui/ProtectedAction` (RBAC). | Sibling `shared/ui/LockedFeature` with the same clone-and-disable shape, plus click → upgrade dialog. |
| Running the POS in a plain browser | Every Playwright spec already drives `npm run dev` in Chrome; `isTauri()` guards printing/peek/updater. | Web build = `tsc && vite build` (skip the cargo broker step). No runtime code needed for "web mode". |
| Static hosting for `bola8pos.com` | Marketing site (`Websites/POS-Website`) and the license portal already deploy to **Firebase Hosting** project `bola8pos`. | Second Hosting site `demo-bola8pos` → `demo.bola8pos.com`, deployed by `FirebaseExtended/action-hosting-deploy`. |
| Nightly data reset | `supabase db reset --linked --yes` (destroys + re-migrates + seeds the linked project) and `scripts/seed-dev-data.ts` / `setup-dev-users.ts`. | `reset-demo.yml` = `db reset --linked` + `npm run seed:demo`. |
| Per-customer desktop installer | `release.yml` builds one NSIS installer per `customers/customers.json` entry with that customer's Supabase baked in. | Desktop demo installer = a `demo` customer entry pointing at the demo Supabase project (rollout step, needs secrets — documented, not committed). |

Rejected: a separate `VITE_DEMO_MODE` build (second binary, feature list frozen at build time,
no expiry, no server visibility of who is trialling); Stripe/PSP self-serve upgrade (payment
collection is still manual — see licensing record).

## 3. Entitlement model

### 3.1 Feature keys (client, `src/shared/lib/license/features.ts`)

```ts
export const FEATURE_KEYS = [
  'report_export',      // CSV / PDF export buttons on every report + bank-transfer export
  'ai_assistant',       // agent-chat (Anthropic vision import) — external API cost
  'email_receipts',     // send receipt by email + Settings › Email test send
  'settings_backup',    // Settings › Backup create / restore
  'audit_log',          // /audit route + nav entry
  'edit_history',       // /edit-history route + nav entry
  'staff_management',   // create staff, change role/locale, reset PIN (shared demo accounts!)
  'rbac_editing',       // /rbac permission toggles (would break the shared demo for others)
  'promotions',         // create/edit promotions (unlocked in demo, gate-able by vendor)
  'purchase_orders',    // create PO / receive (unlocked in demo, gate-able by vendor)
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
```

Demo allow-list (server-side `DEMO_FEATURES`): `promotions`, `purchase_orders`. Everything
else in `FEATURE_KEYS` is locked for a demo. Checkout, inventory, suppliers, receiving, caja,
reports (viewing), payments/refunds, settings (general/hardware/billing/lock/language) stay
fully usable — the demo has to *sell* the core.

### 3.2 Token payload (additive, still `v: 1`)

```ts
plan: z.enum(['monthly', 'yearly', 'lifetime', 'demo'])
features: z.array(z.string()).nullable().optional()   // null/absent = everything enabled
```

`isFeatureEnabled(key, payload, enforced)`:

| enforcement | payload | result |
|---|---|---|
| off (dev / e2e default) | any | `true` |
| on | `null` (locked gate) | `false` (moot — gate is showing) |
| on | `features` null/undefined | `true` |
| on | `features` array | `features.includes(key)` |

Unknown keys in the array are ignored; keys missing from the array are locked (fail closed
for demos, so a feature added to the client later is locked until the vendor allows it).

Hooks: `useFeature(key): { enabled: boolean; locked: boolean; requestUpgrade(): void }` and
non-hook `isFeatureEnabledNow(key)` for module-level guards. `locked === !enabled` — kept as a
named boolean for JSX readability.

### 3.3 Evaluation changes (`token.ts`)

- `SUBSCRIPTION_WARN_DAYS.demo = 0` — no amber banner; the demo bar already shows days left.
- When `plan === 'demo'` and `period_end` has passed → `{ state: 'locked', reason: 'demo_expired' }`
  (grace is 0 for demos anyway; the reason exists purely for copy: "Your demo has ended").
- `updatesExpired` unchanged (demo tenants keep receiving updates while active).

## 4. License server (`pos-license-server`, branch `feat/demo-plan`, LOCAL ONLY)

### 4.1 Migration `supabase/migrations/20260914000001_demo_plan.sql`

```sql
alter type public.plan_kind add value if not exists 'demo';
```

### 4.2 Migration `supabase/migrations/20260914000002_demo_tenant_features.sql`

- `alter table public.tenants add column features text[];` — null = unlimited. Vendor can
  hand-edit for a hot prospect (e.g. unlock `report_export` for one demo tenant).
- `record_payment`: the final `else` branch currently treats any non-monthly/yearly plan as
  lifetime. Change to `elsif t.plan = 'lifetime' then … else raise exception 'change the plan
  before recording a payment for a % tenant', t.plan; end if;`.
- Index `tenants_demo_expiry_idx on tenants (current_period_end) where plan = 'demo'` for the
  cleanup query.

### 4.3 `_shared/license.ts`

- `PlanKind` gains `'demo'`; `TenantRow.features: string[] | null`; `LicensePayload.features`.
- `DEMO_FEATURES = ['promotions', 'purchase_orders']`.
- `buildPayload`: `features: tenant.features ?? (tenant.plan === 'demo' ? DEMO_FEATURES : null)`.

### 4.4 Edge function `start-demo`

`POST /functions/v1/start-demo { terminal_id, terminal_name?, app_version?, os? }`

1. Validate `terminal_id` is a UUID.
2. Opportunistic cleanup: `delete from tenants where plan='demo' and current_period_end < now() - interval '30 days'` (cascades terminals/payments). No cron dependency.
3. Rate limit: count `terminals` with `last_ip = clientIp` and `first_seen_at > now()-24h` joined to demo tenants; `>= 20` → `429 RATE_LIMITED`.
4. If the terminal already exists: bound to a non-demo tenant → `403 TERMINAL_BOUND_ELSEWHERE`; bound to a demo tenant → `403 DEMO_ALREADY_USED` (one demo per install; the web build works around this by minting a new terminal id, see §6).
5. Insert tenant `{ slug: 'demo-' + 8 hex, name: 'Demo', plan: 'demo', current_period_end: now()+14d, grace_days: 0, lease_days: 14, max_terminals: 1, notes: 'self-service demo' }` and terminal row (same telemetry shape as `activate`).
6. Respond `{ token, license_key, tenant: {name, plan}, terminal: {id, name} }`. The client stores `license_key` so the normal heartbeat keeps the lease fresh.

`activate` / `heartbeat` / `issue-offline-token` are untouched except that they now emit
`features` via `buildPayload`.

### 4.5 Portal

`Plan` type gains `'demo'`, `PLAN_PRICE_MXN.demo = 0`. Tenants list shows a "demo" chip and a
"Demos" filter toggle. TenantDetail: the plan `<Select>` never offers `demo` as a *target*
(converting a demo is: pick monthly/yearly/lifetime → record payment; `record_payment` already
reactivates and extends from `now()` because a demo's `current_period_end` is in the past or
near). A read-only `features` line shows the effective allow-list.

## 5. POS client

### 5.1 `src/shared/lib/license/`

- `types.ts` — plan + `features` + `LicenseLockReason` `'demo_expired'`.
- `features.ts` — `FEATURE_KEYS`, `isFeatureEnabled`, `isFeatureEnabledNow`, `useFeature`.
- `client.ts` — `startDemo()` posting to `start-demo` (same `post` helper, extended to accept the path and to return `license_key`).
- `actions.ts` — `startDemoTrial(): Promise<Result<LicensePayload>>` = `startDemo()` → `applyToken(token, license_key)` → `markHeartbeat`. For the web build's expired case: `resetTerminalForNewDemo()` clears `pos.license.terminal_id` + license store, then calls `startDemoTrial()` again (only reachable when `VITE_DEMO_AUTO_START` is on).
- `demo-accounts.ts` — `DEMO_STAFF = [{ name: 'Ana Admin', role: 'admin', pin: '0000' }, { name: 'Luis Gerente', role: 'manager', pin: '1111' }, { name: 'Sofía Cajera', role: 'cashier', pin: '2222' }]` — single source for the seed script and the login hint.
- `upgrade-dialog-store.ts` — tiny zustand `{ open, feature: FeatureKey | null, openFor(key?), close() }` so `shared/ui` can open the dialog that lives in `features/`.
- `config.ts` — `isDemoAutoStart()` reads `VITE_DEMO_AUTO_START`; `DEMO_CONTACT = { site: 'https://bola8pos.com', email: 'hola@bola8pos.com' }` overridable by `VITE_DEMO_CONTACT_URL` / `VITE_DEMO_CONTACT_EMAIL`.

### 5.2 Gate + activation (`LicenseGate`, `LicenseActivationForm`)

- Activation form gets a second card/section: **"Try it free for 14 days"** → `startDemoTrial()`. Error codes map to copy: `DEMO_ALREADY_USED`, `RATE_LIMITED`, offline.
- Gate reason copy for `demo_expired`: "Your 14-day demo has ended. Get a license to keep your data and unlock everything." plus the activation form (key entry) — no "start demo" button in that state on desktop.
- Web auto-start (`VITE_DEMO_AUTO_START=true`): when the gate would show `unlicensed`, it instead renders a "Preparing your demo…" panel and calls `startDemoTrial()`; on `demo_expired`/`DEMO_ALREADY_USED` it calls `resetTerminalForNewDemo()`. Any other failure falls back to the normal gate with the error shown.

### 5.3 Demo chrome

- `DemoBar` (`src/app/DemoBar.tsx`, rendered at the top of `AppShell`'s `<main>`, in-flow, 32px): "DEMO · 12 days left · [Get the full version]". Only when `payload.plan === 'demo'` and enforcement is on. `data-testid="demo-bar"`.
- `UpgradeDialog` (`src/features/upgrade-license/ui/UpgradeDialog.tsx`, mounted once in `App.tsx`): title "Unlock the full version"; optional line "«Export reports» is available in the full version" when opened for a feature; pricing table (500 MXN/mo, 5,000 MXN/yr, 15,000 MXN lifetime — same numbers as the licensing record); "What you get" bullet list from `FEATURE_KEYS` labels; CTAs: *Contact sales* (`mailto:` + site link via `@tauri-apps/plugin-opener` when in Tauri, `<a target=_blank>` in the browser) and *I already have a key* → inline `LicenseActivationForm` (activating a paid key replaces the demo token in place; no restart).
- Login page: `DemoLoginHint` card (in `pages/login`) listing `DEMO_STAFF` names + PINs when `plan === 'demo'`. Same source of truth as the seed.
- Receipts: `buildThermalReceiptText` / PDF / email HTML get a `demoWatermark` flag (call sites read `useLicenseStore.getState().payload?.plan === 'demo'`) that appends `*** DEMO — NO VÁLIDO COMO COMPROBANTE ***` (es) / `*** DEMO — NOT A VALID RECEIPT ***` (en) after the footer.
- Settings › License: plan name "Demo (14 days)", status row shows days left, button "Get the full version" → upgrade dialog.

### 5.4 Lock points

| Feature key | Where | How |
|---|---|---|
| `report_export` | `features/export-report/ui/ExportButtons.tsx` (all 14 report panels use it), `features/export-bank-transfers` | `<LockedFeature feature="report_export">` around the dropdown trigger / button |
| `ai_assistant` | `features/agent-chat/ui/AgentButton.tsx` | wrap; locked → button stays visible with lock badge, click → upgrade dialog |
| `email_receipts` | `features/process-payment/ui/EmailReceiptDialog.tsx` send button (+ `ReceiptPreview` trigger), `EmailReceiptsSettingsTab` test-send button | wrap |
| `settings_backup` | `BackupSettingsTab` create + restore buttons | wrap |
| `audit_log` / `edit_history` | `app/audit-route.tsx`, `app/edit-history-route.tsx`; `shared/config/navigation.ts` gets `feature?: FeatureKey` | route renders `<FeatureLockedPage feature=…>`; nav tile/rail entry shows lock chip and opens the upgrade dialog instead of navigating |
| `staff_management` | `features/create-staff`, `edit-staff-role`, `edit-staff-locale`, `admin-reset-pin` primary buttons | wrap |
| `rbac_editing` | `features/toggle-permission` switch | wrap (page stays viewable) |
| `promotions` | `features/manage-promotions` "New promotion" + row edit | wrap (unlocked in demo by default) |
| `purchase_orders` | `features/create-purchase-order` + `receive-shipment` submit | wrap (unlocked in demo by default) |

`LockedFeature` (`shared/ui/LockedFeature.tsx`): props `{ feature, children, disabled? }`.
Enabled → returns child (merging `disabled` like `ProtectedAction`). Locked → child cloned with
`disabled`, wrapped in a `<span role="button" tabIndex=0 data-locked-feature={key}>` with a
small `Lock` icon, tooltip "Available in the full version", click/Enter → `openFor(key)`.
`FeatureLockedPage` (`shared/ui/FeatureLockedPage.tsx`): EmptyState-style panel with the
feature label, one paragraph, and an "Get the full version" button.

i18n: feature labels + all new copy in `common` (`license.features.*`, `license.demo.*`,
`license.upgrade.*`) for es-MX and en-US. es-MX is the primary copy (customers are Mexican);
en-US is a genuine translation.

### 5.5 Web build + hosting (this repo)

- `package.json`: `"build:web": "tsc && vite build"` (no cargo). `"seed:demo": "npx tsx scripts/seed-demo.ts"`.
- `scripts/seed-demo.ts`: runs `setup-dev-users`-style account creation for `DEMO_STAFF` (imports the const from `src/shared/lib/license/demo-accounts.ts`), then `execSync('npx tsx scripts/seed-dev-data.ts')` for the catalog, then upserts `settings.general.storeName = 'Tienda Demo'`. Idempotent. Runs against whatever `VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are in the env (local stack for testing).
- `firebase.json` + `.firebaserc` at repo root: project `bola8pos`, hosting target `demo` → site `demo-bola8pos`, `public: dist`, SPA rewrite to `/index.html`, `Cache-Control: max-age=31536000, immutable` for `/assets/**`, `no-cache` for `index.html`.
- `.github/workflows/deploy-demo.yml`: `workflow_dispatch` + `push` of tags `v*` (so every release also refreshes the demo), guarded by `if: github.repository == 'zedfauji/supermarket-pos'` (the repo is mirrored to customers); `ubuntu-latest`; `npm ci --legacy-peer-deps`; `npm run build:web` with `VITE_SUPABASE_URL/ANON_KEY = secrets.DEMO_*`, `VITE_LICENSE_SERVER_URL/ANON_KEY/PUBLIC_KEY` (prod license server), `VITE_LICENSE_ENFORCE=true`, `VITE_DEMO_AUTO_START=true`, `VITE_AGENT_ENABLED=false`, `VITE_APP_VERSION` from package.json; deploy with `FirebaseExtended/action-hosting-deploy@v0` (`firebaseServiceAccount: secrets.FIREBASE_SERVICE_ACCOUNT_BOLA8POS`, `channelId: live`, `target: demo`).
- `.github/workflows/reset-demo.yml`: `schedule: '0 9 * * *'` (03:00 Mexico City) + dispatch, same repo guard; `supabase/setup-cli@v1`; `supabase link --project-ref ${{ secrets.DEMO_SUPABASE_PROJECT_REF }}`; `supabase db reset --linked --yes`; `npm run seed:demo` with `VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from `DEMO_*` secrets.
- `docs/online-demo.md`: runbook — create the demo Supabase project, push migrations + deploy the POS edge functions there, deploy `start-demo` to the prod license server (after applying the two migrations), create Firebase site + custom domain, GitHub secrets list, `customers.json` `demo` entry for the desktop demo installer, the one-line CTA for the marketing site (`Websites/POS-Website` — separate repo, not edited here).

## 6. Flows

**Desktop, first run**: gate (`unlicensed`) → "Try it free" → `start-demo` → token with
`plan: demo`, `features: [promotions, purchase_orders]` → app loads with DemoBar → locked
controls show lock + open UpgradeDialog → day 15: gate `demo_expired` → enter paid key → same
terminal is re-bound by `activate` (the terminal row already exists; `activate` accepts it
because the tenant matches… it does **not** — the terminal is bound to the demo tenant, so
`activate` returns `TERMINAL_BOUND_ELSEWHERE`). Fix in `activate`: when the existing terminal's
tenant is a **demo** tenant, re-bind it to the paid tenant (update `tenant_id`, then delete the
orphaned demo tenant). This is the "convert" path and needs no portal action.

**Online demo**: `demo.bola8pos.com` → gate auto-starts → login page shows demo PINs → prospect
sells, receives stock, views reports → DemoBar → UpgradeDialog → *Contact sales*. Every browser
gets its own demo tenant/terminal; all share the demo Supabase project, reset nightly.

## 7. Testing (all automated, headless)

- **Unit (Vitest)**: `features.test.ts` (matrix in §3.2), `token.test.ts` (`demo_expired`, warn days), `LockedFeature.test.tsx` (enabled passthrough, locked disables + opens store), `UpgradeDialog.test.tsx` (renders feature line, key form toggle), `actions.test.ts` (`startDemoTrial` stores key + token; reset path mints a new terminal id), `receipt-format.test.ts` (watermark line).
- **E2E (Playwright, hermetic — no license-server Docker needed)**: new `playwright.license.config.ts` with two `webServer`s started with `env`: port 1522 (`VITE_LICENSE_ENFORCE=true`, `VITE_LICENSE_PUBLIC_KEY=<test SPKI>`, `VITE_LICENSE_SERVER_URL=http://127.0.0.1:1522/__license`) and port 1523 (same + `VITE_DEMO_AUTO_START=true`). A committed **test-only** P-256 keypair (`e2e/helpers/license-keys.ts`, clearly labelled, never used by any server) signs tokens in Node (`crypto.sign('sha256', …, { dsaEncoding: 'ieee-p1363' })` — WebCrypto's raw r‖s format). Specs `page.route()` `**/functions/v1/start-demo|activate|heartbeat` and return signed tokens.
  - `e2e/license/demo-start.spec.ts` — gate → "Try it free" → DemoBar shows 14 days; `DEMO_ALREADY_USED` shows the mapped copy.
  - `e2e/license/demo-locks.spec.ts` — logged in as admin: Reports export trigger is locked and opens UpgradeDialog; `/audit` shows FeatureLockedPage; sidebar audit entry has the lock chip; promotions "New" is **not** locked; Settings › License shows "Demo".
  - `e2e/license/demo-auto-start.spec.ts` (port 1523) — fresh context lands on login with the demo-PIN hint without touching the form; expired token in `localStorage` → new terminal id minted → new demo.
  - `e2e/license/paid-license.spec.ts` — paid token (`features: null`): no DemoBar, export enabled — the regression guard that paying customers see nothing new.
  - Script `test:e2e:license` in `package.json`; folder `license` classifies as its own report section via `global-teardown.ts`'s folder rule.
- **License server**: Deno test for `start-demo` logic is out of scope (no test harness exists there); instead a manual-but-scripted check `scripts/smoke-start-demo.mjs` in that repo hits the local function and verifies the token with the local public key. Run once during this work against the local 553xx stack.
- Gates before finishing: `npm run typecheck`, `npm run lint` (i18n literal-string rule, FSD boundaries), `npm run test`, `npm run test:e2e:license`, plus a scoped run of the touched existing e2e specs (reports export, settings, rbac, staff) against the default 1520 server to prove enforcement-off behaviour is unchanged.

## 8. Rulings (undo any by telling me)

- R1 Entitlements are token-driven (server allow-list), not a client plan table. One source of truth; vendor can unlock per tenant.
- R2 Demo allow-list = `promotions`, `purchase_orders`; everything else in `FEATURE_KEYS` locked. Core selling flows are never locked.
- R3 Demo length 14 days, grace 0, lease 14, 1 terminal. One demo per terminal id on desktop; the web build mints a fresh terminal id when its demo expires.
- R4 Online demo and desktop demo share one demo Supabase project + the same seeded staff (`DEMO_STAFF`). Nightly `db reset --linked` + `seed:demo`. Staff/RBAC editing is locked precisely because those accounts are shared.
- R5 Hosting = Firebase Hosting site `demo-bola8pos` in the existing `bola8pos` project (same platform as the marketing site and the license portal). Marketing-site CTA is documented, not edited (separate repo with uncommitted work).
- R6 `activate` re-binds a terminal that is currently on a demo tenant to the paid tenant and deletes the demo tenant — the upgrade path needs no portal click.
- R7 License-server changes are committed on branch `feat/demo-plan` in `pos-license-server` and applied to the local 553xx stack only. The three pre-existing uncommitted files there are left untouched and uncommitted.
- R8 `AgentButton` currently hides itself when `VITE_AGENT_ENABLED=false`; that stays. In a demo it is *visible but locked* (a lock is a sales hook; hidden is not).
- R9 Receipt watermark is text-only (thermal, PDF, email). No printer/PDF layout changes.
- R10 No sales-count cap in demo. Expiry + locked features + watermark are enough; a cap would need server-side enforcement to mean anything.
