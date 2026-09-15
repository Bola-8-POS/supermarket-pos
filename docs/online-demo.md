# Online Demo (demo.bola8pos.com)

## 1. What it is

A hosted, browser-only build of this POS (`npm run build:web` — no Tauri shell,
no native IPC) deployed to Firebase Hosting at `demo.bola8pos.com`, backed by
its own dedicated Supabase project. A visitor gets the gate's "Try it free"
flow automatically (`VITE_DEMO_AUTO_START=true`) instead of clicking a button:
`start-demo` mints a fresh demo tenant + terminal on every new browser, the app
loads straight to the login screen with the demo PINs shown, and the demo
behaves exactly like the desktop "Try it free" trial (§6 of the design spec) —
14-day token, `promotions`/`purchase_orders` unlocked, everything else in
`FEATURE_KEYS` locked behind `UpgradeDialog`, receipts watermarked. Every
browser session gets its **own** demo tenant/terminal; all of them share one
Supabase project, which is wiped and reseeded nightly (§8 R4) so no one
prospect's changes leak into another's session and the data never accumulates
cruft.

This is a separate deployment target from the desktop installer — same
codebase, same license-server contract, different `VITE_*` build-time env and
a different hosting surface (Firebase static hosting vs. Tauri's NSIS
installer via `release.yml`).

## 2. One-time setup: demo Supabase project

Create a dedicated project (do **not** reuse a customer's project or the
license server's project):

```bash
supabase projects create supermarket-pos-demo --org-id <your-org-id>
```

Note its project ref — it is `DEMO_SUPABASE_PROJECT_REF` below.

Push the POS schema and deploy the POS edge functions to it:

```bash
supabase link --project-ref <ref>
supabase db push --yes
supabase functions deploy admin-reset-pin
supabase functions deploy agent-proxy
supabase functions deploy create-staff
supabase functions deploy get-server-time
supabase functions deploy process-direct-sale
supabase functions deploy process-payment
supabase functions deploy process-split-payment
supabase functions deploy receive-shipment
supabase functions deploy send-receipt-email
supabase functions deploy settings-backup
supabase functions deploy settings-email-status
supabase functions deploy settings-restore
supabase functions deploy settings-test-email
```

(`_shared` under `supabase/functions/` is a shared module, not a deployable
function — skip it.)

Set whatever function secrets these already require in production (email
provider keys, etc. — same secret names as any other deployment; see
`SUPABASE-CONTRACTS.md`).

**Do not deploy `send-receipt-email` to this project** (or, if you do, leave
its email-provider secret unset) — do not add it to the `functions deploy`
list above — and build the demo with `VITE_AGENT_ENABLED=false`. Entitlement
locks (`email_receipts`, `ai_assistant`, …) are enforced client-side only, and
the anon key and every demo staff PIN are public on the online demo, so there
is no server-side backstop keeping a visitor from calling these functions
directly if they're deployed and live.

Finally, seed the demo staff + catalog once locally against this project
(`VITE_SUPABASE_URL` pointed at it, `SUPABASE_SERVICE_ROLE_KEY` from its
dashboard):

```bash
VITE_SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<key> npm run seed:demo
```

`reset-demo.yml` repeats this same seed every night after `db reset --linked`
— this manual run is only to prove it works before wiring the workflow.

## 3. License server: demo plan

The `feat/demo-plan` branch in `pos-license-server`
(`D:\Projects\Code\pos-license-server`) adds the demo entitlement model
(`plan: demo`, server-side feature allow-list, R1/R2 of the design spec).
Apply it to the **production** license server project (`zhvcivnojpvgwiknlpuj`
— the same one every real customer's desktop install already points at,
because the desktop "Try it free" flow and the online demo both go through
this one shared license server):

```bash
cd D:\Projects\Code\pos-license-server
supabase link --project-ref zhvcivnojpvgwiknlpuj
supabase db push --yes   # applies 20260914000001_demo_plan.sql, 20260914000002_demo_tenant_features.sql
supabase functions deploy start-demo
supabase functions deploy activate     # R6: re-bind-on-convert fix
supabase functions deploy heartbeat
supabase functions deploy issue-offline-token
```

Redeploying `activate`/`heartbeat`/`issue-offline-token` (not just the new
`start-demo`) matters because `feat/demo-plan` changes `activate`'s re-bind
behavior (§6, §8 R6) and both existing functions' shared token-signing code
picks up the new `plan`/`features` fields.

`supabase db push` applies migrations as separate transactions in filename
order, so `20260914000001_demo_plan.sql` (`ALTER TYPE … ADD VALUE`, adding
`'demo'` to the plan enum) must be committed before
`20260914000002_demo_tenant_features.sql` runs — that second migration's
partial index predicate references the `'demo'` enum value, which Postgres
will only accept once the first migration's `ADD VALUE` has committed in its
own transaction. Never squash these two into one migration file/transaction.

## 4. Firebase Hosting

Same Firebase project as the marketing site and the license portal
(`bola8pos`) — the demo gets its own **hosting site** within it, not a new
project:

```bash
firebase hosting:sites:create bola8pos-demo
firebase target:apply hosting demo bola8pos-demo --project bola8pos
```

(`.firebaserc`/`firebase.json` in this repo root already encode that target —
see Step 1/1 above. `target:apply` is a one-time local-config step; nothing to
commit beyond what's already here.)

Custom domain: in the Firebase console → Hosting → `bola8pos-demo` site → Add
custom domain → `demo.bola8pos.com`. Firebase shows the exact DNS records
(a TXT record for verification, then an A/AAAA or CNAME record) to add at
whatever registrar/DNS host `bola8pos.com` is on — add them there; Firebase
provisions the SSL certificate automatically once DNS resolves.

Service account: `FIREBASE_SERVICE_ACCOUNT_BOLA8POS` (used by
`deploy-demo.yml`) is the same kind of service-account JSON Firebase's GitHub
Action setup normally generates (Firebase console → Project settings → Service
accounts → Generate new private key, or `firebase init hosting:github`) —
scoped to the `bola8pos` project, paste the whole JSON as the secret value.

## 5. GitHub secrets

All of these are **repository** secrets on `Bola-8-POS/supermarket-pos` (not a
per-customer Environment secret — the demo is not a customer).

| Secret | Used by | Value |
|---|---|---|
| `DEMO_SUPABASE_URL` | deploy-demo, reset-demo | `https://<demo project ref>.supabase.co` |
| `DEMO_SUPABASE_ANON_KEY` | deploy-demo | Demo project's anon key |
| `DEMO_SUPABASE_PROJECT_REF` | reset-demo | Demo project's ref (bare, no URL) |
| `DEMO_SUPABASE_DB_PASSWORD` | reset-demo | Demo project's Postgres password (`supabase link`) |
| `DEMO_SUPABASE_SERVICE_ROLE_KEY` | reset-demo | Demo project's service-role key (`seed:demo`) |
| `SUPABASE_ACCESS_TOKEN` | reset-demo | A `supabase login` personal access token with access to the demo project |
| `VITE_LICENSE_SERVER_URL` | deploy-demo | Existing prod license-server URL (already set for `release.yml`) |
| `VITE_LICENSE_SERVER_ANON_KEY` | deploy-demo | Existing prod license-server anon key (already set for `release.yml`) |
| `VITE_LICENSE_PUBLIC_KEY` | deploy-demo | Existing prod license-server SPKI public key (already set for `release.yml`) |
| `FIREBASE_SERVICE_ACCOUNT_BOLA8POS` | deploy-demo | Firebase service-account JSON for the `bola8pos` project (§4) |
| `GITHUB_TOKEN` | deploy-demo | Built-in, no setup needed |

## 6. Desktop demo installer

The desktop "Try it free" flow (already built — `LicenseGate` → `start-demo`,
§6 of the design spec) ships as its own installer/repo, following the exact
same mirror-push pattern `release.yml` already uses for every real customer,
just with `deployment_mode: cloud` pointed at the shared demo Supabase
project instead of a dedicated one. Add this entry to `customers/customers.json`:

```json
{
  "name": "demo",
  "repo": "zedfauji/supermarket-pos-demo",
  "status": "active",
  "supabase_project_ref": "<demo project ref>",
  "deployment_mode": "cloud",
  "github_environment": "demo"
}
```

Then set up the `demo` GitHub Environment the same way
`docs/onboarding-new-customer.md` sets up any other customer's Environment
(`CUSTOMER_MIRROR_PAT` secret scoped to `zedfauji/supermarket-pos-demo`,
`supermarket-pos-demo` repo created) — `release.yml`'s existing
`sync-customers` matrix job picks this entry up on the next tagged release
exactly like any other `active` customer, materializing
`VITE_SUPABASE_URL=https://<demo ref>.supabase.co` from the entry's
`supabase_project_ref` plus the repo-level license-server secrets it already
uses for everyone. `customers/demo/tauri.override.json` still needs to be
scaffolded (`scripts/onboard-customer.ps1 -CustomerName demo -SupabaseProjectRef <ref> ...`)
with a "Try Bola8 POS" branded identity — this is the installer the
marketing site's desktop-download link points at (§7), and its "Try it free"
button on first launch is what provisions each trial via `start-demo`.

## 7. Marketing site CTA (documentation only — not edited here)

`bola8pos.com` is a separate Next.js repo
(`D:\Projects\Code\Websites\POS-Website\POS-Website`, Firebase project
`bola8pos`, hosting target `main`) with its own uncommitted work in progress —
this task does not touch it. When that repo is next worked on, add a demo CTA
next to the existing primary hero CTA:

```tsx
{ href: 'https://demo.bola8pos.com', label: t('hero.tryDemo') }
```

and point the existing desktop-installer download link at the latest release
asset of the `zedfauji/supermarket-pos-demo` repo (§6) — e.g.
`https://github.com/zedfauji/supermarket-pos-demo/releases/latest` — so a
visitor who wants the installed app instead of the browser demo lands on the
same "Try it free" flow via a real Windows install.

## 8. Operations

**Nightly reset**: `reset-demo.yml` runs at `0 9 * * *` UTC (03:00
America/Mexico_City) — `supabase db reset --linked --yes` against the demo
project followed by `npm run seed:demo`, wiping every prospect's session data
and restoring `DEMO_STAFF` (`Ana Admin` / `Luis Gerente` / `Sofía Cajera`) plus
the seeded catalog. It guards itself first (see the workflow's own leading
step) against ever running with `DEMO_SUPABASE_PROJECT_REF` set to a real
customer's `supabase_project_ref` from `customers/customers.json`.

**Unlocking a feature for a hot prospect**: the demo allow-list
(`promotions`, `purchase_orders`, §8 R2 of the design spec) is server-side per
tenant, so a sales rep can widen it for one prospect's specific demo tenant
without touching code or redeploying anything — run against the license
server's database:

```sql
update tenants
set features = array['promotions', 'purchase_orders', 'report_export']
where slug = 'demo-xxxx';
```

(`slug` identifies the one browser/terminal's demo tenant that was minted for
that prospect — find it via the license server's `terminals`/`tenants` tables
or ask the prospect for the tenant shown in Settings → License.)

**Correction:** this change is *not* wiped by the nightly reset — the nightly
`reset-demo.yml` (`supabase db reset --linked` + `seed:demo`) only resets the
POS **demo Supabase project** (catalog/sales/staff data). Demo *tenants*
(the `plan: 'demo'` rows this SQL edits) live in the **production license
server** project (`zhvcivnojpvgwiknlpuj`, §3 above), which the nightly reset
never touches — a manually widened `features` array persists indefinitely
until that specific tenant row is deleted. A tenant row is only ever deleted
by `start-demo`'s opportunistic cleanup (demos with `current_period_end` more
than 30 days in the past) or by `activate`'s demo-to-paid re-bind (§6) — so a
demo tenant can persist for the 14-day trial plus up to ~30 more days of
cleanup lag. Also note a fresh `start-demo` call only mints a brand-new
tenant when the browser's *terminal id* changes (a new browser/profile, or
cleared `localStorage`) — reloading the same browser reuses the existing
terminal/tenant, so the widened allow-list stays in effect for that prospect
across visits. Because nothing auto-deletes a demo tenant before its cleanup
window, demo tenant rows accumulate in the production license DB over time;
there is currently no admin-portal action to bulk-purge them.

**Conversion path**: a prospect who wants to buy simply activates a real paid
license key on the same demo install/browser they were trialing. `activate`
detects that the terminal is currently bound to a **demo** tenant, re-binds
that terminal row to the new paid tenant, and deletes the now-orphaned demo
tenant (§6, §8 R6) — no portal action, no manual data migration, and the
prospect keeps using the same terminal id they were already on.

## 9. Local integration check

`e2e/license-live/demo-lifecycle.spec.ts` is an opt-in Playwright suite that drives the
full demo lifecycle (start-demo → entitlements → convert to paid) against a REAL local
license-server stack — no `page.route()` mocking, unlike `e2e/license/`. It never runs in
CI and is not part of `npm run test:e2e`. Run it from this repo (`supermarket-pos/`):

```bash
# 1. Start the local license-server stack (separate repo, sibling of this one)
cd D:\Projects\Code\pos-license-server
npx supabase start

# 2. Start its edge functions
supabase functions serve --env-file supabase/functions/.env --no-verify-jwt

# 3. Export the two local keys the live config/spec read (read-only — never `db push`
#    or `functions deploy` against this stack from here)
npx supabase status -o env
#   PowerShell:
#   $env:LICENSE_LOCAL_ANON_KEY='<ANON_KEY>'; $env:LICENSE_LOCAL_SERVICE_ROLE_KEY='<SERVICE_ROLE_KEY>'
#   bash:
#   export LICENSE_LOCAL_ANON_KEY='<ANON_KEY>' LICENSE_LOCAL_SERVICE_ROLE_KEY='<SERVICE_ROLE_KEY>'

# 4. Run the suite (back in this repo)
cd D:\Projects\Code\supermarket-pos\.claude\worktrees\demo-edition
npm run test:e2e:license:live
```

See `playwright.license-live.config.ts`'s header comment for what each env var is used
for and why `VITE_LICENSE_PUBLIC_KEY` is deliberately not overridden.
