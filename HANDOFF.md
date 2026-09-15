# HANDOFF — Demo Edition + Online Demo (feat/demo-edition)

Written 2026-09-15 at the end of the session that built this feature. Paste this file (or point the
next session at it) before doing anything else.

## 1. Where things are

| What | Where | State |
|---|---|---|
| POS branch | `feat/demo-edition` | Merged fast-forward into `main` and pushed on 2026-09-15 (rollout session); the worktree was removed. |
| License-server branch | `D:\Projects\Code\pos-license-server`, branch `feat/demo-plan` | 2 commits (`5ac904a`, `0c46134`) on top of its `main`. **Not pushed/merged there, but its migrations + functions ARE deployed to the prod project `zhvcivnojpvgwiknlpuj`.** That repo also carries pre-existing UNCOMMITTED files from before this work (`.gitignore`, `README.md`, `portal/src/pages/Login.tsx`, `scripts/add-admin.mjs` rename, `supabase/config.toml`, `issue-offline-token/index.ts`, untracked `.firebaserc`, `firebase.json`, `.vscode/`, `supabase/migrations/20260911000001_google_admin_auth.sql`) — leave them alone; never `git add -A` there. |
| Design spec (binding) | `docs/superpowers/specs/2026-09-14-demo-edition-and-online-demo-design.md` | rulings R1–R10 in §8 |
| Implementation plan | `docs/superpowers/plans/2026-09-14-demo-edition-and-online-demo.md` | all 15 tasks done |
| Rollout runbook | `docs/online-demo.md` | §1–§9; **§2–§7 are the owner's to-do list** |
| Project guidance | `CLAUDE.md` → "Demo edition" paragraph + E2E table rows + new commands | done |
| Execution ledger + every task/review report | `.superpowers/sdd/2026-09-14-demo-edition-and-online-demo/` (git-ignored scratch, kept on purpose) | `progress.md` = every ruling, deferred minor, parked finding |
| Memory note | `~/.claude/projects/D--Projects-Code-supermarket-pos/memory/project_demo_edition_branch.md` | gotchas below |

## 2. What was built (one screen)

- **Entitlements are token-driven.** The signed license token now carries `plan: 'demo'` and an optional
  `features` allow-list (`null`/absent = unlimited, so every existing paid install is unchanged).
  `src/shared/lib/license/features.ts`: `FEATURE_KEYS` (10), `isFeatureEnabled`, `useFeature`,
  `useNavFeatureLocked`, `useIsDemo`. Demo allow-list (server-side `DEMO_FEATURES`) = `promotions` +
  `purchase_orders`; everything else locked.
- **Lock UI.** `src/shared/ui/LockedFeature.tsx` (clone-and-disable + capture overlay + tooltip → opens
  `UpgradeDialog`), `FeatureLockedPage.tsx` (route replacement). ~16 lock points: report/bank-transfer
  export, AI assistant, email receipts (dialog + preview trigger + settings test-send), backup/restore,
  `/audit` + `/edit-history` routes and nav entries, staff create/role/locale/reset-PIN, RBAC toggles,
  promotions new/edit, PO create + receive. RBAC lock always wins over feature lock.
- **Demo flow.** Gate shows "Probar gratis 14 días" → `start-demo` → token (14 d, grace 0, lease 14,
  1 terminal). `VITE_DEMO_AUTO_START=true` (web build) auto-provisions on first load and mints a new
  terminal id when a demo expires. `DemoBar` (widgets/AppShell), `UpgradeDialog`
  (`features/upgrade-license`, pricing 500/5 000/15 000 MXN + contact + paid-key entry),
  `DemoLoginHint` (pages/login), receipt watermark (thermal/PDF/email, wraps to paper width),
  Settings › Licencia demo view. Web demo mints a per-browser caja terminal id `DEMO-xxxxxx`.
- **Conversion.** Entering a paid key on a demo terminal → `activate` re-binds the terminal to the paid
  tenant and deletes the orphan demo tenant. No portal step.
- **License server.** Migrations `20260914000001_demo_plan.sql` (enum value, own file) and
  `20260914000002_demo_tenant_features.sql` (`tenants.features text[]`, partial index, `record_payment`
  refuses demo); edge function `start-demo` (one demo per terminal id → `DEMO_ALREADY_USED`, 20/IP/24 h →
  `RATE_LIMITED`, opportunistic cleanup of demos expired > 30 d); `activate` re-bind; portal demo chip +
  filter + read-only features line.
- **Online demo infra.** `npm run build:web` (`tsc && vite build`, no cargo), `npm run seed:demo`
  (`scripts/seed-demo.ts`, demo staff from `src/shared/lib/license/demo-accounts.ts`: Ana Admin `000000`,
  Luis Gerente `111111`, Sofía Cajera `222222`, locale es-MX), `firebase.json` + `.firebaserc` (site
  `bola8pos-demo` in project `bola8pos`), `.github/workflows/deploy-demo.yml` (dispatch + `v*` tags),
  `.github/workflows/reset-demo.yml` (nightly 09:00 UTC `supabase db reset --linked --yes` + seed; refuses
  to run if the target ref matches any `customers/customers.json` entry). Both workflows are job-guarded by
  `github.repository == 'Bola-8-POS/supermarket-pos'` because `release.yml` mirrors this repo to customers.
- **Tests.** Unit 1735 pass. `npm run test:e2e:license` — 11 hermetic specs (`e2e/license/`, test-only
  P-256 keypair `e2e/helpers/license-keys.ts`, two extra Vite servers 1522/1523, no license-server
  Docker). `npm run test:e2e:license:live` — 1 opt-in spec (`e2e/license-live/`) against the real local
  license server incl. server-side proof of conversion. Both folders are in the default config's
  `testIgnore`. Scoped default suite, typecheck, lint, `build:web` all green at HEAD.

## 3. Verification status at handoff

All green at `03a4026` / `0c46134`: typecheck, lint (0 warnings), unit, hermetic license e2e (11),
live license e2e (1, after the final fix wave), scoped default e2e (reports/settings/rbac/home/checkout),
`build:web`. Whole-branch review (Opus) → 0 Critical; its 4 Important findings were fixed in the final
fix wave and re-reviewed clean.

Known-open (all deliberately deferred, none blocking — see ledger for detail):
- `BackupSettingsTab`: pre-existing on `main`, its `ProtectedAction` wraps a `<div>` so RBAC disable never
  reached the buttons (entitlement lock works; `/settings` is admin-gated). Separate ticket.
- `LicenseGate` auto-start effect re-runs on every render (guards make it correct; could depend on
  `evaluation.state/reason` instead). `UpgradeDialog` has no `DialogDescription` (Radix warning).
- Lock-point e2e covers 5 of 10 keys directly; the rest rely on `LockedFeature`'s unit tests.
- `start-demo` cleanup cascades terminals → a terminal can get a second demo ~44 days later.
- Online demo hides the AI button (`VITE_AGENT_ENABLED=false`) instead of showing it locked (R8 vs §5.5).
- License-server minors: `DEMO_FEATURES` literal duplicated in `_shared` + smoke script; `start-demo`
  `existing` cast claims a `name` field not selected.

## 4. Rollout status (2026-09-15, second session)

Done, verified live:
1. **License server (prod `zhvcivnojpvgwiknlpuj`)**: both demo migrations applied, `start-demo` + the three
   redeployed functions live (owner did this before the session; verified via `supabase functions list`).
2. **Demo Supabase project `zylymybxvwnymcapwpch`** (`demo-pos`, siloed): all POS migrations pushed, 12 edge
   functions deployed (everything except `send-receipt-email`), `npm run seed:demo` run once (Ana/Luis/Sofía +
   catalog + "Tienda Demo"). DB password was reset via the Management API and stored only in the GitHub secret.
3. **Firebase**: site `bola8pos-demo` (Firebase rejected the id `demo-bola8pos`), target `demo`; custom domain
   `demo.bola8pos.com` attached via the Hosting REST API, CNAME `demo.bola8pos.com → bola8pos-demo.web.app`
   added in Cloud DNS zone `bola8pos` (project `bola8pos`); cert issued, HTTPS 200.
4. **GitHub secrets** on `Bola-8-POS/supermarket-pos`: all `DEMO_SUPABASE_*`, `SUPABASE_ACCESS_TOKEN`,
   `FIREBASE_SERVICE_ACCOUNT_BOLA8POS` (service account `github-deploy-demo@bola8pos.iam.gserviceaccount.com`,
   roles firebasehosting.admin / apiKeysViewer / firebaseauth.admin / run.viewer). Job guards were fixed to the
   repo's real name — `zedfauji/supermarket-pos` is only a redirect and never equals `github.repository`.
5. **deploy-demo.yml** ran green from GitHub Actions (run 35013252053) and published the live build.
6. **Marketing site**: hero "Ver Demo / View Demo" now links to `https://demo.bola8pos.com`
   (`src/components/hero.tsx` in `Websites/POS-Website/POS-Website`, uncommitted like the rest of that repo's WIP);
   redeployed to Cloud Run `magidesk-pos` (revision 00016) with `gcloud run deploy --source`.
7. **Live check** (Playwright, headless, against both `bola8pos-demo.web.app` and `demo.bola8pos.com`):
   auto-provision via prod `start-demo` (200), Ana Admin `000000` login, `/audit` → `feature-locked-page`,
   staff create → locked, `/promotions` + `/pos` unlocked, demo bar visible. One real bug found and fixed on the
   way: `get-server-time` never answered CORS preflight (`fix(edge)` commit; deployed to the demo project only —
   customer projects pick it up on their next `functions deploy`).

Still owed (deliberately not done):
- **§6 desktop demo installer** (`customers.json` `demo` entry, `supermarket-pos-demo` repo + Environment +
  `CUSTOMER_MIRROR_PAT`, `customers/demo/tauri.override.json`) — needs a mirror PAT and the customer-repo
  create; `scripts/onboard-customer.ps1` still hardcodes the `zedfauji/` owner.
- `feat/demo-plan` in `pos-license-server` is deployed but still unmerged/unpushed there.
- Nightly `reset-demo.yml` has not yet had a scheduled run (dispatch it once from `main` to prove it).

## 5. How to resume locally (next session checklist)

```powershell
# 1. Docker Desktop must be running (it was found stopped once; containers auto-restart with it)
docker ps --format "{{.Names}}" | findstr supermarket-pos-selfhosted
# POS stack (54321): from the worktree
npx supabase start
docker start supabase_edge_runtime_supermarket-pos-selfhosted   # exits on its own after restarts

# 2. License-server stack (55321) + functions — only needed for test:e2e:license:live
cd D:\Projects\Code\pos-license-server
$env:SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID='local-placeholder'; $env:SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET='local-placeholder'
npx supabase start
npx supabase functions serve --env-file supabase/functions/.env --no-verify-jwt   # keep running
npx supabase status -o env   # → LICENSE_LOCAL_ANON_KEY / LICENSE_LOCAL_SERVICE_ROLE_KEY for the live suite

# 3. Gates (from the worktree)
npm run typecheck; npm run lint; npm run test
npm run test:e2e:license                 # hermetic, ~2 min
npm run test:e2e:license:live            # needs step 2 + the two env vars
```

## 6. Gotchas learned the hard way

- **Never junction `node_modules` into a worktree.** Vite serves the Geist font via `@fs` from the other
  checkout and returns 403; every e2e that asserts "no console errors" (all of `rbac.spec.ts`) fails.
  The worktree now has a real `npm ci --legacy-peer-deps` install.
- **Never run `npm run seed:demo` against the shared local e2e DB (127.0.0.1:54321).** The demo admin PIN
  `000000` is the literal "wrong PIN" in `e2e/home/home-navigation.spec.ts`. The three demo accounts were
  deleted from that DB at the end of the session.
- The license-server `supabase start` needs the two Google OAuth env placeholders or `config.toml`
  substitution fails; its `auth` container restart-loops without them.
- `e2e/license-live/` must never be loaded by the default Playwright config (it needs env); both license
  folders are in `testIgnore` — keep them there.
- Task-ID-style files under `.superpowers/` are scratch; `docs/superpowers/**` is git-ignored except what
  was force-added (spec + plan).

## 7. Owner's standing rules that shaped this work

Never touch `main`; never push; never deploy migrations/functions to a remote Supabase; everything
verified by automated Playwright, headless (no manual click-throughs); decisions taken autonomously and
recorded as rulings (spec §8 + ledger). All still apply to whoever picks this up.
