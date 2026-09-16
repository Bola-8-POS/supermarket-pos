---
phase: 34-tutorial-video-generation
reviewed: 2026-09-16T00:00:00Z
depth: standard
files_reviewed: 28
files_reviewed_list:
  - .gitignore
  - e2e/helpers/auth.ts
  - e2e/tutorials/audit/audit.spec.ts
  - e2e/tutorials/caja/caja.spec.ts
  - e2e/tutorials/checkout/checkout.spec.ts
  - e2e/tutorials/fixtures.ts
  - e2e/tutorials/full-walkthrough/full-walkthrough.spec.ts
  - e2e/tutorials/i18n-selectors.test.ts
  - e2e/tutorials/i18n-selectors.ts
  - e2e/tutorials/inventory/inventory.spec.ts
  - e2e/tutorials/locale.test.ts
  - e2e/tutorials/locale.ts
  - e2e/tutorials/pacing.test.ts
  - e2e/tutorials/pacing.ts
  - e2e/tutorials/payments/payments.spec.ts
  - e2e/tutorials/promotions/promotions.spec.ts
  - e2e/tutorials/purchase-orders/purchase-orders.spec.ts
  - e2e/tutorials/receipts/receipts.spec.ts
  - e2e/tutorials/reports/reports.spec.ts
  - e2e/tutorials/settings/settings.spec.ts
  - e2e/tutorials/staff-rbac/staff-rbac.spec.ts
  - e2e/tutorials/suppliers/suppliers.spec.ts
  - package.json
  - playwright.config.ts
  - playwright.tutorial.config.ts
  - scripts/tutorial-videos-convert.test.ts
  - scripts/tutorial-videos-convert.ts
  - src/shared/lib/domain.ts
  - vitest.config.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 34: Code Review Report

**Reviewed:** 2026-09-16
**Depth:** standard
**Files Reviewed:** 28
**Status:** issues_found

## Summary

This phase adds a Playwright-based tutorial-video-recording harness (`e2e/tutorials/**`), a small
shared pacing/locale/selector library, a video→mp4 conversion script, and one production fix in
`src/shared/lib/domain.ts`.

The one production change — loosening `CajaReportStaffSchema.salesTotal` from the nonnegative
`MoneySchema` to a plain `z.number().multipleOf(0.01)` — is correct, minimal, and well-isolated.
It does not touch `MoneySchema` itself or any other schema, so no other validation is loosened.
`git blame`/`git show` confirm this is the only commit touching that line, and the change is
consistent with `CajaReportPanel.tsx`'s existing use of `MoneyDisplay`, which already renders
negative amounts. No issue found here.

The e2e/tutorial harness itself (`pacing.ts`, `locale.ts`, `i18n-selectors.ts`, `fixtures.ts`) is
carefully built and covered by real unit tests. Spot-checking a large sample of the dual-locale
regex selectors against the actual es-MX/en-US locale JSON files (`wPanels.json`, `wAdmin.json`,
`pages.json`, `featOrders.json`) found them all correct. `playwright.tutorial.config.ts`'s
`outputDir` fix (moving it to a `.pw-artifacts` sibling folder so Playwright's own output-clearing
`rm -rf` no longer deletes the first locale's already-saved `.webm` files on the second locale's
run) is correct and verified against the commit that introduced the bug.

Two real gaps were found, both quality/robustness issues rather than production bugs: the four new
Vitest unit-test files for this harness are never actually executed by any npm script or CI
pathway (they sit in a `vitest.config.ts` project — `e2e-tools` — that nothing runs), and three
call sites read `E2E_MANAGER_PIN` directly via `process.env[...] ?? ''` instead of through the
existing `staffForRole()` helper, silently entering an empty PIN instead of failing loudly when the
env var is missing.

## Warnings

### WR-01: New harness unit tests are never run by any script or CI job

**File:** `vitest.config.ts:107-116`, `package.json:16-21`

**Issue:** `vitest.config.ts` defines a third project, `e2e-tools`, whose `include` covers exactly
the four test files delivered by this phase (`e2e/tutorials/pacing.test.ts`,
`e2e/tutorials/locale.test.ts`, `e2e/tutorials/i18n-selectors.test.ts`,
`scripts/tutorial-videos-convert.test.ts`). Every test-running script in `package.json`
(`test`, `test:watch`, `test:ui`, `test:coverage`) is hardcoded to `--project unit`, and there is no
`test:e2e-tools` (or equivalent) script, nor any reference to the `e2e-tools` project name anywhere
in `package.json` or a CI workflow. `npm run test` — the CLAUDE.md-documented CI gate — therefore
never executes these four files. They only run if someone manually types
`npx vitest run --project e2e-tools`, which nobody is instructed to do. In practice this is
untested code from day one: a regression in `resolveHoldMs`, `buildVideoOutputPath`,
`seedStaffLocale`, `selectProductRe`, or `resolveOutputPath`/`buildFfmpegArgs` will pass CI silently.

**Fix:** Add a script that runs it (and wire it into whatever aggregate "test" step CI actually
invokes), e.g.:
```json
"test:e2e-tools": "vitest run --project e2e-tools --reporter=dot",
```
and either fold it into `npm run test` (`vitest run --project unit --project e2e-tools --reporter=dot`)
or add a fourth conjunct to whatever CI job runs `npm run test`.

### WR-02: Manager PIN read via raw `process.env` instead of the existing validated helper — silently enters an empty PIN if unset

**File:** `e2e/tutorials/payments/payments.spec.ts:245`, `e2e/tutorials/payments/payments.spec.ts:269`, `e2e/tutorials/full-walkthrough/full-walkthrough.spec.ts:105`

**Issue:** All three call sites already import `staffForRole` from `../../helpers/auth` (and use it
for `.name` in the same file), but read the manager's PIN with
`process.env['E2E_MANAGER_PIN'] ?? ''` instead of `staffForRole('manager').pin`. `staffForRole()`
goes through `envOrThrow()`, which throws an explicit, actionable error
(`Missing required env: E2E_MANAGER_PIN ...`) the moment the env var is missing or blank. The
direct-`process.env` path instead silently produces `managerPin = ''`; `enterPin(page, '')`
(`e2e/helpers/auth.ts:42-47`) then iterates zero times over the empty string, clicking no PIN keys
at all, and the test fails later with an opaque timeout on the PIN dialog rather than a clear
"missing env var" message — the exact failure mode `envOrThrow` exists to prevent.

**Fix:** Use the already-imported helper consistently:
```ts
const { pin: managerPin } = staffForRole('manager');
```

### WR-03: `e2e/tutorials/settings/settings.spec.ts`'s second test depends on execution order of the first

**File:** `e2e/tutorials/settings/settings.spec.ts:117-163`

**Issue:** Test 2 (`'a dirty settings tab prompts Save/Discard/Stay on navigation away'`) does not
call `resetTestState()` and relies on a code comment's claim that Test 1 always runs first because
`playwright.tutorial.config.ts` sets `fullyParallel: false, workers: 1`. That's true for a full
`npx playwright test --config=playwright.tutorial.config.ts` run of the whole file, but breaks
under any narrower invocation Playwright explicitly supports and this suite's own package.json
comments elsewhere assume people will use — e.g. `playwright test e2e/tutorials/settings -g "dirty
settings tab"` while debugging a flaky recording, or reordering/adding a test above it later. In
this specific case the fallout is limited (the dual-locale selectors this test uses are
locale-agnostic, so it happens to still pass regardless of actual staff locale state), but the
pattern — silent cross-test ordering dependency guarded only by a comment, not an explicit
`test.describe.configure({ mode: 'serial' })` or an assertion — is fragile and will bite the next
person who adds a test between them.

**Fix:** Make the dependency explicit and enforced, not just documented:
```ts
test.describe.configure({ mode: 'serial' });
```
at the top of the `describe` block (Playwright will then fail loudly instead of silently reordering
if the constraint is ever violated).

## Info

### IN-01: `caja.spec.ts`'s `.single()` query assumes exactly one open caja session exists

**File:** `e2e/tutorials/caja/caja.spec.ts:96-100`

**Issue:** `admin.from('caja_sessions').select('id').eq('status', 'open').single()` throws if more
than one row matches. Per CLAUDE.md, caja sessions are now scoped per-terminal (multiple can be
open simultaneously across terminals), so this query is only safe because `resetTestState()` is
assumed to leave exactly one caja session open (the one just opened via the UI two lines above).
That assumption holds today but isn't defensive — a future change to `resetTestState()` or to this
test (e.g., adding a second terminal to the tutorial) will produce an opaque "JSON object requested,
multiple (or no) rows returned" error instead of a clear one.

**Fix:** Scope the query to the terminal this test actually opened, e.g.
`.eq('terminal_id', 'POS-1')`, or use `.limit(1).maybeSingle()` with an explicit null-check error
message.

### IN-02: `buildVideoOutputPath`'s output path collides across spec files that happen to share both a domain folder name and a test title

**File:** `e2e/tutorials/pacing.ts:30-37`

**Issue:** The raw `.webm` path is `raw/<parent-dir-of-spec-file>/<slugified-test-title>.<locale>.webm`
— it does not include the spec filename itself, only its parent directory. Today every tutorial
domain folder holds exactly one spec file, so this is harmless, but nothing enforces that
invariant; a second spec file added to the same domain folder with a same-named test (e.g. two
"happy path" tests in different files under `e2e/tutorials/checkout/`) would silently overwrite one
video with the other with no error, only `video.saveAs()` succeeding twice into the same path.

**Fix:** Not urgent given the current one-file-per-domain convention; if a second spec file is ever
added to a domain folder, include the spec's own basename in the output path to guarantee
uniqueness.

---

_Reviewed: 2026-09-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
