# Phase 34: Tutorial Video Generation - Research

**Researched:** 2026-09-16
**Domain:** Playwright-driven screen-recording harness + ffmpeg video conversion (no new runtime dependencies)
**Confidence:** HIGH

## User Constraints

> No `34-CONTEXT.md` exists for this phase (no `/gsd-discuss-phase` run — per `.planning/REQUIREMENTS.md`,
> scope was confirmed directly with the user during `/gsd-plan-phase` clarifying questions on 2026-09-16).
> The constraints below are copied verbatim from the task brief and `REQUIREMENTS.md`'s Phase 34 section,
> which together are this phase's locked-decision record.

### Locked Decisions

- Playwright + Chromium only. Both already installed — do NOT propose new dependencies, new browsers, or new video/screen-recording libraries.
- Output directory: new top-level `tutorial-videos/` (not under `e2e/`), mirroring `e2e/`'s domain structure (`tutorial-videos/checkout/`, `tutorial-videos/inventory/`, etc.), gitignored as build output.
- Scope: one video per `e2e/`-domain group — **checkout, inventory, suppliers, payments, staff/rbac, caja, reports, promotions, receipts, purchase-orders, settings, audit** (12 groups, `staff` and `rbac` combined into one video per REQUIREMENTS.md VIDEO-02's own wording) — covering that domain's real workflow(s) plus key edge cases, PLUS one long full end-to-end video (cashier checkout → manager refund/approval → admin reporting).
- Bilingual: every recorded scenario produced in both es-MX and en-US via the app's existing per-staff `profiles.locale` switch (Settings → Language, or admin staff-locale field) — not a separate app build.
- Format: Playwright's native `recordVideo` produces `.webm`; a build step converts to HD `.mp4` via `ffmpeg` (confirmed present, v8.1.x with libx264/aac). Final `.mp4` files land under `tutorial-videos/<domain>/`.
- Pacing: every meaningful UI action (click, type, navigate) is followed by a deliberate 2-4 second hold before the next action.
- No open-ended e2e-spec-debugging loop: this is new recording-script infrastructure, not a repair of flaky e2e specs. Existing `e2e/*.spec.ts` files are reference for realistic flows only, not literal scripts to copy.

### Claude's Discretion

- Exact script/config file names and directory layout for the recording scripts themselves (only the *output* directory, `tutorial-videos/`, is locked).
- Whether to seed a staff member's locale via direct DB write vs. driving the Settings UI in every scenario (see Pitfall/Pattern below — recommend DB seed except for the Settings-domain video itself).
- Exact edge cases selected per domain, within "the domain's real workflow(s) plus key edge cases."

### Deferred Ideas (OUT OF SCOPE)

- None recorded — this phase was scoped directly, no `/gsd-explore` seed file exists for it.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VIDEO-01 | Reusable Playwright recording harness: HD viewport, native `recordVideo`, scripted 2-4s pause after every meaningful action | See "Architecture Patterns" — harness built on the **already-shipped** `e2e/training/` + `playwright.training.config.ts` prior art, extended with an explicit post-action hold helper |
| VIDEO-02 | One video per `e2e/` domain group (12 groups) covering real workflow + edge cases | See "Per-Domain Script Structure" — concrete workflow/edge-case list grounded in existing spec titles, per domain |
| VIDEO-03 | One long full end-to-end video (cashier → manager → admin) | See "Per-Domain Script Structure" → Full E2E Walkthrough |
| VIDEO-04 | Bilingual (es-MX/en-US) via existing per-staff locale mechanism, not separate builds | See "Bilingual Strategy" — DB-seeded locale + env-var-driven double run |
| VIDEO-05 | `.webm` → HD `.mp4` via ffmpeg build step, under `tutorial-videos/<domain>/`, gitignored | See "ffmpeg Conversion" and "Code Examples" |
| VIDEO-06 | No open-ended e2e-spec-debugging loop — stop and ask if a script gets stuck | Process constraint for the executor, not a research finding — noted in Pitfalls |

## Summary

This phase needs zero new dependencies: `@playwright/test`/`playwright` (^1.59.1) are already installed,
and `ffmpeg` 8.1 (with `libx264`/`aac`) is confirmed present on this machine
`[VERIFIED: ffmpeg -version output, this session]`. More importantly, **this exact problem has already
been solved once in this codebase** — `e2e/training/` + `playwright.training.config.ts` +
`e2e/training/caption.ts` is a working, shipped "captioned screen-recording video for the user manual"
harness (`npm run test:e2e:training`), built for a narrower case (two combo-promotion videos). It already
demonstrates every hard part: HD `recordVideo` config, an on-screen caption banner with a scripted pause,
running against the plain Vite dev server (not the Tauri shell), and reusing `loginAs()`/`openCaja()`/
seeding helpers from `e2e/helpers/`. The right move is to **extend this pattern, not reinvent it**: add a
new `e2e/tutorials/<domain>/*.spec.ts` tree (one folder per `e2e/`-domain group) with its own
`playwright.tutorial.config.ts` cloned from `playwright.training.config.ts`, reusing `caption.ts` by
import, plus one new tiny helper for a post-action hold and one new tiny helper for seeding a staff
member's `profiles.locale` directly (skipping the Settings UI for every domain except the Settings video
itself, where the locale switch UI *is* the workflow). A single Node script (`tsx`, already a
devDependency) globs the recorded `.webm` files and shells out to `ffmpeg` once per file to produce
`tutorial-videos/<domain>/<scenario>.<locale>.mp4`.

The one finding that changes the shape of the plan: **this app is a Tauri 2 desktop app, but every
video will show the plain web frontend in a browser viewport, not a native OS window.** This is not a
gap introduced by this phase — it is the same tradeoff the entire existing `e2e/` suite and
`e2e/training/` already made (`baseURL: 'http://localhost:1520'`, the Vite dev server, with
`__TAURI_INTERNALS__`/`__TAURI__` mocked in `page.addInitScript()`). Playwright cannot attach its CDP
screencast to a real Tauri WebView2 (Windows) or webkit2gtk (Ubuntu) window — there is no Chrome DevTools
Protocol bridge into Tauri's native webview in this codebase, and building one is far outside this
phase's scope. This is stated as a confirmed, load-bearing finding, not a blocker: it matches how the
rest of the E2E suite already validates this app, and for a *content* training video (workflow/screen
walkthrough, not "here is what the desktop chrome looks like") a plain browser viewport recording is
what the user needs.

**Primary recommendation:** Add `e2e/tutorials/` (new tree, mirrors `e2e/` domain names) +
`playwright.tutorial.config.ts` (clone of `playwright.training.config.ts`, HD 1920x1080) +
`scripts/tutorial-videos-convert.ts` (ffmpeg pass), reusing `e2e/training/caption.ts`,
`e2e/helpers/auth.ts`, and `e2e/helpers/supabase.ts` wholesale. Run each domain script twice via a
`TUTORIAL_LOCALE` env var that a new `seedStaffLocale()` helper applies before login, except the
Settings-domain script, which demonstrates the real Settings → Language switch as its own step.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Video capture (browser-side frame recording) | Browser / Client (Playwright-driven Chromium) | — | Playwright's `recordVideo` captures rendered frames via CDP screencast in the browser process itself; nothing server-side is involved |
| Scenario scripting (login, navigate, act, pause) | Test/tooling layer (`e2e/tutorials/*.spec.ts`) | API/Backend (via existing app + local Supabase) | Scripts drive the real running app exactly like `e2e/*.spec.ts` does — no new app code, no new backend surface |
| Locale switching for bilingual capture | Database / Storage (direct `profiles.locale` write via service-role client) for 11 of 12 domains | Browser / Client (real Settings UI) for the Settings-domain video only | A direct DB seed is far cheaper per-scenario than driving the Settings UI in every one of 24+ recordings; the Settings video is the one place the UI switch itself is the content |
| `.webm` → `.mp4` conversion | Build tooling (Node script + `ffmpeg` subprocess) | — | Pure post-processing, no app/runtime involvement |
| Video output storage | Filesystem (`tutorial-videos/`, gitignored) | — | Build artifact, matches existing `e2e-results*/` / `playwright-report*/` gitignore precedent |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@playwright/test` | 1.59.1 (already pinned in `package.json`) `[VERIFIED: package.json devDependencies, this session]` | Test runner + browser automation + native video recording | Already the project's sole E2E tool; `recordVideo` is a first-class, built-in context option — no plugin needed |
| `playwright` | 1.59.1 (already pinned) `[VERIFIED: package.json devDependencies, this session]` | Browser binaries (bundled Chromium) that `@playwright/test` drives | Same reasoning |
| `ffmpeg` | 8.1-full_build (confirmed on this machine) `[VERIFIED: ffmpeg -version output, this session]` | `.webm` (VP8/VP9+Opus) → `.mp4` (H.264/AAC) conversion, one command per file | User-confirmed present; standard, boring, zero-install conversion tool — no npm ffmpeg wrapper needed |
| `tsx` | ^4.21.0 (already a devDependency) `[VERIFIED: package.json devDependencies, this session]` | Run the Node conversion script (`scripts/tutorial-videos-convert.ts`) | Already how every other one-off script in `scripts/` runs (`seed-demo.ts`, `seed-dev-data.ts`) — matches project convention exactly |
| `glob` | ^13.0.6 (already a dependency) `[VERIFIED: package.json dependencies, this session]` | Find recorded `.webm` files under the raw-output directory | Already installed; avoids hand-rolling recursive directory walking |

**No new packages are installed by this phase.** Zero `npm install` needed.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Playwright's built-in `recordVideo` | A separate screen-recording tool (OBS, `puppeteer-screen-recorder`, etc.) | Explicitly excluded by the user's locked constraint — Playwright + Chromium only, no new deps |
| ffmpeg CLI subprocess | `fluent-ffmpeg` npm wrapper | Adds a dependency for what is one `ffmpeg` invocation with ~8 fixed flags — pure overhead, rejected |
| Direct DB locale seed for bilingual capture | Driving the Settings → Language UI in every domain script | Doubles every domain script's runtime/step-count with an irrelevant "switch language" sub-flow that has nothing to do with that domain's content; the mechanism itself only needs to be *used*, and VIDEO-04 doesn't require showing the switch UI in every video |

**Installation:** None required — see Standard Stack above.

## Package Legitimacy Audit

**Not applicable.** This phase installs zero new packages (see Standard Stack — every tool used is
already a pinned dependency or a pre-existing system binary). No `npm view`/`pip`/`cargo` legitimacy
check is needed.

## Architecture Patterns

### System Architecture Diagram

```
 npm run tutorial-videos:record            (Playwright, per domain × per locale)
        │
        ▼
 ┌───────────────────────────────────────────────────────────┐
 │ e2e/tutorials/<domain>/*.spec.ts                           │
 │  1. seedStaffLocale(name, TUTORIAL_LOCALE)  ── DB write ──►│──► local Supabase (profiles.locale)
 │  2. resetTestState() / openCaja() / product seeding        │──► local Supabase (tabs/caja/inventory)
 │  3. loginAs(page, role)            ── reused from          │
 │     e2e/helpers/auth.ts                                    │
 │  4. narrate(page, "1. Do X", async () => { ...click... })  │
 │       └─ caption(page, text)   ── shows on-screen banner   │
 │       └─ perform the real UI action (click/type/goto)      │
 │       └─ page.waitForTimeout(HOLD_MS)  ── 2000-4000ms      │
 │  5. repeat for every scripted step                         │
 │  6. context/page close ──► Playwright writes raw .webm     │
 └───────────────────────────────────────────────────────────┘
        │  (in a global test.afterEach / fixture teardown)
        ▼
 page.video().saveAs('e2e-results-tutorials/raw/<domain>/<scenario>.<locale>.webm')
        │
        ▼
 npm run tutorial-videos:convert   (tsx scripts/tutorial-videos-convert.ts)
        │  glob('e2e-results-tutorials/raw/**/*.webm')
        │  for each: spawn ffmpeg -i in.webm -c:v libx264 ... -c:a aac ... out.mp4
        ▼
 tutorial-videos/<domain>/<scenario>.<locale>.mp4   (gitignored build artifact)
```

### Recommended Project Structure

```
e2e/
├── tutorials/                      # NEW — this phase's recording scripts
│   ├── fixtures.ts                 # narrate()/hold() + video.saveAs() teardown, extends base test
│   ├── locale.ts                   # seedStaffLocale() helper (new, ~10 lines)
│   ├── checkout/checkout.spec.ts
│   ├── inventory/inventory.spec.ts
│   ├── suppliers/suppliers.spec.ts
│   ├── payments/payments.spec.ts
│   ├── staff-rbac/staff-rbac.spec.ts
│   ├── caja/caja.spec.ts
│   ├── reports/reports.spec.ts
│   ├── promotions/promotions.spec.ts
│   ├── receipts/receipts.spec.ts
│   ├── purchase-orders/purchase-orders.spec.ts
│   ├── settings/settings.spec.ts
│   ├── audit/audit.spec.ts
│   └── full-walkthrough/full-walkthrough.spec.ts
├── training/                        # UNCHANGED — existing combo-promo training videos, separate deliverable
│   └── caption.ts                   # REUSED by e2e/tutorials/ via import, not duplicated
playwright.tutorial.config.ts        # NEW — clone of playwright.training.config.ts, testDir e2e/tutorials
scripts/
└── tutorial-videos-convert.ts       # NEW — ffmpeg pass, one invocation per .webm
tutorial-videos/                     # NEW, gitignored — final .mp4 output, one subfolder per domain
```

**Why a new `e2e/tutorials/` tree instead of extending `e2e/training/` in place:** `e2e/training/`
+ `playwright.training.config.ts` + `npm run test:e2e:training` are an already-shipped deliverable
(combo-checkout/combo-wizard videos) with their own purpose and own npm script. Repurposing that
directory's meaning to "the phase 34 comprehensive tutorial suite" would silently change what an
existing, working script does. Adding a sibling tree keeps both working and is a smaller diff than a
rename+merge.

### Pattern 1: Narrated action with a real post-action hold

**What:** A `narrate()` helper that shows the existing `caption()` banner, performs the real Playwright
action, then explicitly holds 2-4 seconds — closing the gap in `e2e/training/`'s current pattern, where
`caption()`'s own `pauseMs` (default 1800ms) only pauses *before* the action runs, not after it
completes.
**When to use:** Every scripted step in every `e2e/tutorials/**/*.spec.ts` file.
**Example:**
```typescript
// New file: e2e/tutorials/fixtures.ts
import { test as base, expect, type Page } from '@playwright/test';
import { caption } from '../training/caption';

export type NarrateFn = (
  page: Page,
  text: string,
  action: () => Promise<void>,
  holdMs?: number,
) => Promise<void>;

async function narrate(
  page: Page,
  text: string,
  action: () => Promise<void>,
  holdMs = 3000, // within the required 2000-4000ms range
): Promise<void> {
  await caption(page, text, 800); // brief pre-action beat, matches existing caption() default use
  await action();
  await page.waitForTimeout(holdMs); // the actual "watch what happened" hold
}

export const test = base.extend<{ narrate: NarrateFn }>({
  narrate: async ({}, use) => {
    await use(narrate);
  },
});
export { expect };
```

### Pattern 2: Locale seeded directly, no UI detour

**What:** Set the acting staff member's `profiles.locale` via the service-role client before `loginAs()`,
mirroring every other `e2e/helpers/supabase.ts` setter (`setProductActive`, `setInventoryQty`, etc.).
**When to use:** Every domain script except `settings` (where the Settings → Language UI switch is the
content being recorded).
**Example:**
```typescript
// New file: e2e/tutorials/locale.ts — same style as existing e2e/helpers/supabase.ts setters
import { getServiceClient } from '../helpers/supabase';

export async function seedStaffLocale(
  staffName: string,
  locale: 'es-MX' | 'en-US',
): Promise<void> {
  const admin = getServiceClient();
  const { error } = await admin.from('profiles').update({ locale }).eq('name', staffName);
  if (error) throw new Error(`seedStaffLocale(${staffName}): ${error.message}`);
}
```
Driven by an env var at the top of each spec's `beforeEach`:
```typescript
const TUTORIAL_LOCALE = (process.env['TUTORIAL_LOCALE'] as 'es-MX' | 'en-US' | undefined) ?? 'es-MX';
test.beforeEach(async () => {
  requireIntegrationEnv();
  await resetTestState();
  await seedStaffLocale(envOrThrow('E2E_MANAGER_NAME'), TUTORIAL_LOCALE); // whichever role logs in
});
```

### Pattern 3: Stable per-scenario video filename via `page.video().saveAs()`

**What:** Playwright's `video: { mode: 'on' }` writes each test's video to a Playwright-managed
temp/output path named from the test title slug — not guaranteed stable or predictable enough for a
build script to consume directly. `Video.saveAs(path)` copies the finished recording to an explicit
path once the owning page/context has closed `[CITED: playwright.dev/docs/api/class-video]`.
**When to use:** In a shared `afterEach` (or the `narrate` fixture's teardown) in every tutorial spec.
**Example:**
```typescript
// e2e/tutorials/fixtures.ts (continued)
import path from 'node:path';

test.afterEach(async ({ page }, testInfo) => {
  const video = page.video();
  if (!video) return;
  const domain = path.basename(path.dirname(testInfo.file)); // e.g. "checkout"
  const locale = process.env['TUTORIAL_LOCALE'] ?? 'es-MX';
  const slug = testInfo.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const dest = path.join('e2e-results-tutorials', 'raw', domain, `${slug}.${locale}.webm`);
  await video.saveAs(dest); // resolves only after the context is closed — Playwright docs, does not hang mid-test
});
```
`saveAs()` **copies** the file rather than moving it — the original stays in Playwright's own
`outputDir` and is safe to leave there (already gitignored via the new `e2e-results-tutorials/` entry).

### Anti-Patterns to Avoid

- **Recording the barcode-scan peek window (PEEK-01..04) as-is for the checkout tutorial:** the peek
  window is simulated in `e2e/` as a *second Playwright `Page` in the same `BrowserContext`*
  (`e2e/helpers/tauriPeekMock.ts`'s `BroadcastChannel` relay), not a real second OS window. Playwright
  records one video per page — recording this feature would produce two separate `.webm` files that
  would need manual side-by-side video compositing to look like "a window pops up." Skip the peek
  window from the checkout tutorial video; it is not core-workflow (VIDEO-02 asks for "real
  workflow(s) plus key edge cases," not every feature).
- **Driving the Settings → Language UI switch inside all 12 domain scripts:** wastes 2 extra scripted
  steps × 2-4s holds × 12 domains × 2 locales for a UI action that has nothing to do with 11 of those
  domains' content. Seed the DB column directly instead (Pattern 2).
- **Reusing `playwright.config.ts` (the CI-critical config) for recording:** it sets `video: 'retain-on-failure'` (only on failure) and 1280x800 viewport — wrong on both counts for HD, always-on recording. Clone `playwright.training.config.ts` instead, which already sets `video: { mode: 'on' }`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| On-screen step captions | A new caption/overlay component or library | Import `caption()`/`clearCaption()` from `e2e/training/caption.ts` (already exists, already proven in two shipped videos) | Zero-risk reuse of exactly the code this phase needs |
| Login / PIN entry | New login-automation code | `loginAs(page, role)` / `loginAsNamed(page, name, pin)` from `e2e/helpers/auth.ts` | Already handles both locales' heading text, the opening-cash shift-start dialog, and the `/home` vs `/pos` landing race |
| Test data seeding (products, caja, inventory expiry, promotions) | New seeding logic per tutorial script | `resetTestState()`, `openCaja()`, `setInventoryFarFromExpiry()`, `seedComboPromotion()`, etc. from `e2e/helpers/supabase.ts` | Already the exact set of helpers `e2e/training/combo-checkout.spec.ts` uses for a nearly-identical recording use case |
| `.webm`→`.mp4` conversion pipeline | A custom video-editing/transcoding library integration | One `ffmpeg` subprocess call per file with the standard `libx264`/`aac`/`+faststart` flags | ffmpeg already does exactly this, already installed, one command is sufficient — no editing/compositing needed per the user's own constraint |
| Print/receipt/broker hardware calls during recording | A new print-hardware stub | Reuse the existing `page.addInitScript()` `__TAURI_INTERNALS__.invoke` mocks (`e2e/receipts/reprint.spec.ts`'s `injectPrintMock`, `e2e/helpers/tauriPeekMock.ts`) | Already the exact mechanism `e2e/` uses so print/peek code paths don't throw when there's no real Tauri backend or hardware |

**Key insight:** Every piece of infrastructure this phase needs (caption UI, login helpers, seeding
helpers, Tauri IPC mocks, an HD `recordVideo` Playwright config) already exists in this codebase in a
proven, shipped form. The only genuinely new code is: (1) a ~15-line post-action hold + video-rename
fixture, (2) a ~8-line locale-seeding helper, and (3) a ~20-line ffmpeg conversion script.

## Common Pitfalls

### Pitfall 1: Tauri desktop chrome is never visible in any recording
**What goes wrong:** Someone expects the video to show a native Windows/Ubuntu app window with a title
bar, because this ships as a Tauri desktop app.
**Why it happens:** Playwright automates Chromium via CDP; it has no bridge into Tauri's native
WebView2 (Windows) / webkit2gtk (Ubuntu) webview process. Every `baseURL: 'http://localhost:1520'`
config in this repo (including `playwright.config.ts` and `playwright.training.config.ts`) already
targets the plain Vite dev server, not a packaged Tauri window — confirmed by reading both configs this
session.
**How to avoid:** Set expectations up front (this RESEARCH.md does): every tutorial video shows the
web content in a plain HD browser viewport. This is consistent with how the whole `e2e/` suite already
validates the app and is what a workflow-training video needs anyway.
**Warning signs:** A plan or task that says "capture the native app window" or references OS-level
chrome.

### Pitfall 2: `page.video().path()` hangs if called before the context closes
**What goes wrong:** Calling `.path()` (or resolving `.saveAs()`) mid-test, before the owning
`page`/`context` is closed, hangs indefinitely — the video file isn't finalized until then
`[CITED: playwright.dev/docs/api/class-video]`.
**Why it happens:** Playwright only flushes/finalizes the video encoder on context teardown.
**How to avoid:** Only call `video.saveAs()` in `test.afterEach` (or an equivalent fixture teardown)
after the test body has finished — never inside the scripted narration steps.
**Warning signs:** A recording run that never completes / times out on the last test in a file.

### Pitfall 3: `resetTestState()` / `pruneTransactionalHistory()` wipe rows tutorial scripts may want to keep visible on-screen
**What goes wrong:** `global-setup.ts` prunes `tabs`/`orders`/`payments`/`refunds`/`bank_transfers`
tables at the start of the whole Playwright run (confirmed by reading `e2e/global-setup.ts` this
session), and `resetTestState()` (referenced in every training/e2e spec) runs per-test. A domain video
that wants to show, e.g., a *history* of prior sales (Reports, Audit) needs its own seed data created
within that scenario, not assumed to pre-exist.
**How to avoid:** Each domain script must create whatever historical rows it needs to show (e.g., the
Reports/Audit videos should run a checkout or two as setup steps, or as part of the visible narration,
before demonstrating the report/log view) rather than relying on leftover state from a previous run.
**Warning signs:** A Reports or Audit tutorial video opens on an empty table.

### Pitfall 4: Recording the peek window or a second browser tab produces an unusable second video
**What goes wrong:** Features implemented as a second Playwright `Page` in the same context (barcode
peek window) record their own separate `.webm`, not a combined split-screen recording.
**How to avoid:** See "Anti-Patterns to Avoid" above — skip peek-window from the checkout tutorial, or
treat it as an optional standalone bonus clip if a future phase wants it, not composited into the main
checkout video.
**Warning signs:** A plan task asks for "the peek window opening" to appear inside the single checkout
video.

### Pitfall 5: `staffForRole()`'s internal env-var names are bar-pos leftovers, not a functional bug
**What goes wrong:** `e2e/helpers/auth.ts`'s cashier lookup reads `E2E_BARTENDER_NAME`/`E2E_BARTENDER_PIN`
(confirmed by reading the file this session) — a naming leftover from the bar-pos pivot, documented
in-file as deliberate ("internal-only, never user-visible, avoids a CI secret-store rename"). This is
not something to "fix" as part of this phase; a tutorial script should just call `loginAs(page,
'cashier')` like every other spec does and never touch the env var name directly.
**How to avoid:** Use the `StaffRole` union (`'cashier' | 'manager' | 'admin' | 'kitchen'`) through
`loginAs()`, never read the underlying env vars directly in a new tutorial script.

### Pitfall 6: `outputDir`/`use.video.mode` must not leak into the CI-critical suite
**What goes wrong:** Accidentally editing `playwright.config.ts` (the default `npm run test:e2e`
config) instead of adding a new dedicated config would turn on always-on HD video recording for every
CI run, slowing it down and bloating `e2e-results/`.
**How to avoid:** Always clone into a new `playwright.tutorial.config.ts`; never touch
`playwright.config.ts`'s `use.video`/`viewport` for this phase.

## Code Examples

### ffmpeg conversion (one invocation per file, no editing pipeline)
```typescript
// scripts/tutorial-videos-convert.ts — run via `npx tsx scripts/tutorial-videos-convert.ts`
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

const RAW_DIR = 'e2e-results-tutorials/raw';
const OUT_DIR = 'tutorial-videos';

const rawFiles = globSync(`${RAW_DIR}/**/*.webm`);
if (rawFiles.length === 0) {
  console.error(`No .webm files found under ${RAW_DIR} — did the recording run first?`);
  process.exit(1);
}

for (const raw of rawFiles) {
  const rel = path.relative(RAW_DIR, raw).replace(/\.webm$/, '.mp4');
  const out = path.join(OUT_DIR, rel);
  mkdirSync(path.dirname(out), { recursive: true });
  console.log(`Converting ${raw} -> ${out}`);
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i', raw,
      '-c:v', 'libx264',
      '-crf', '20',
      '-preset', 'medium',
      '-pix_fmt', 'yuv420p', // broad compatibility (QuickTime/Safari/iOS), source: ffmpeg-cookbook.com
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart', // web-embeddable: index at file start
      out,
    ],
    { stdio: 'inherit' },
  );
}
console.log(`Converted ${rawFiles.length} video(s) into ${OUT_DIR}/`);
```
`[CITED: ffmpeg-cookbook.com/en/articles/webm-to-mp4]` for the exact flag set (`libx264`/`crf 20`/
`pix_fmt yuv420p`/`aac 128k`/`+faststart`); `crf 20` chosen slightly below the commonly-cited default of
23 for a sharper training-video result at a still-small file size — adjust if file size becomes a
concern once real videos are generated.

### `playwright.tutorial.config.ts` (clone of the existing training config, HD + new paths)
```typescript
import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

export default defineConfig({
  testDir: './e2e/tutorials',
  outputDir: './e2e-results-tutorials',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000, // longer than training's 120s — full-walkthrough video has many more steps
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:1520',
    headless: true,
    viewport: { width: 1920, height: 1080 }, // true HD per VIDEO-01
    trace: 'off',
    video: { mode: 'on', size: { width: 1920, height: 1080 } },
    screenshot: 'off',
  },
  projects: [{ name: 'chromium', use: {} }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:1520',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

### New `package.json` scripts
```json
{
  "scripts": {
    "tutorial-videos:record": "playwright test --config=playwright.tutorial.config.ts",
    "tutorial-videos:convert": "tsx scripts/tutorial-videos-convert.ts",
    "tutorial-videos": "npm run tutorial-videos:record && npm run tutorial-videos:convert"
  }
}
```
Bilingual double-run (documented, not itself a script — env var pattern matches the existing
`FAST_E2E=1` convention already used with this project's Bash/Git-Bash dev shell on both Windows and
Ubuntu):
```bash
TUTORIAL_LOCALE=es-MX npm run tutorial-videos:record
TUTORIAL_LOCALE=en-US npm run tutorial-videos:record
npm run tutorial-videos:convert
```

## Per-Domain Script Structure

Grounded in the actual `test.describe`/`test(...)` titles found in each `e2e/` domain folder this
session (not re-derived from memory). One realistic workflow + 1-2 edge cases per domain, sized for a
single video each:

| Domain | Real workflow (from existing specs) | Edge case(s) to include |
|--------|--------------------------------------|--------------------------|
| **checkout** | Scan/search a product → add to cart → cash payment → receipt (`happy-path.spec.ts`) | Card payment; a promotion auto-discounting live at scan time (`promotion-live-price.spec.ts`) |
| **inventory** | `/inventory` hub tabs → manager adjusts stock with a required reason (`inventory-management.spec.ts` T4/T5) | Near-expiry alert threshold (`near-expiry-alerts.spec.ts`); low-stock badge visible to manager, hidden from cashier |
| **suppliers** | Create a supplier with contact details + a linked product (`supplier-crud.spec.ts`) | Receive a shipment via quick-add (`supplier-receiving.spec.ts`) — a duplicate-barcode rejection |
| **payments** | `/payments` PaymentPane: select an open tab, manager PIN unlocks the form, complete a cash payment (`payment-pane.spec.ts` T5-T9) | Refund with manager PIN gate (`refund.spec.ts` T1-T4); split payment (cash+card) |
| **staff/rbac** | Admin adds a new staff member via Add Staff dialog, forced PIN change on first login (`staff-management.spec.ts` SM2); admin resets a different staff member's PIN (SM9) | Non-admin redirected from `/rbac` (`rbac.spec.ts`); admin toggles a permission on the matrix (T-RP-02) |
| **caja** | Manager opens caja with a drawer float, then closes it at end of day (`session-management.spec.ts`) | Cannot close caja with open tabs; register a cash expense entry (`entries.spec.ts`) |
| **reports** | Reports page: pick a closed session, view revenue/cash-reconciliation breakdown, Product Sales tab (`report-tabs.spec.ts`) | CSV export of a report (Payment Methods or Product Sales); inventory valuation/turnover report |
| **promotions** | Admin creates a percent-off promotion scoped to a category via the promotion dialog (`promotion-dialog-validation.spec.ts`) | Combo wizard: 3x2 cheapest-free bundle (`combo-wizard.spec.ts`); best-price-wins when two promotions overlap (`scope-overlap-resolution.spec.ts`) |
| **receipts** | Hardware/Receipt Settings: configure paper width + header/footer with live preview (`settings.spec.ts`) | Reprint the most recently completed sale (`reprint.spec.ts`); a transient printer failure auto-retries without blocking the sale (`print-retry-resilience.spec.ts`) |
| **purchase-orders** | Manager creates a PO manually against a supplier (`purchase-orders.spec.ts` PO-01) | "Suggest reorder" pre-filled from low stock (PO-02); receiving a PO updates stock and closes it (PO-03) |
| **settings** | Settings → Language: self-service switch from es-MX to en-US, live re-render, no reload (`i18n-locale-switch.spec.ts`) — **the one domain where the real locale-switch UI is the content, not a DB-seeded shortcut** | Unsaved-changes guard prompt on navigating away from a dirty tab (`unsaved-changes-guard.spec.ts`) |
| **audit** | Audit Log: view entries after processing a payment, open the diff sheet on a row click (`audit-logs.spec.ts`) | Date-range filter narrows results; non-admin redirected away from `/audit` |

### Full E2E Walkthrough (VIDEO-03)

One continuous business-day narrative spanning all three roles, built from pieces of the above:
1. **Manager** opens caja with a drawer float (`caja`).
2. **Cashier** logs in, scans/searches a couple of products, completes a cash sale, receipt shown
   (`checkout`).
3. **Manager** processes a refund on that sale with the manager PIN gate (`payments`/`refund.spec.ts`).
4. **Admin** logs in, opens Reports, views the day's revenue/cash-reconciliation reflecting the sale and
   the refund (`reports`).
5. **Manager** closes caja at end of day (`caja`).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `e2e/training/` — two hand-written combo-specific captioned videos, run manually via `npm run test:e2e:training` | This phase generalizes the same pattern into a comprehensive per-domain suite under `e2e/tutorials/` | This phase (2026-09-16) | `e2e/training/` stays as-is (its own deliverable); `e2e/tutorials/` is new, sibling infrastructure reusing its `caption.ts` |

**Deprecated/outdated:** Nothing in this phase deprecates existing infrastructure — it is purely
additive (new config, new spec tree, new conversion script, new gitignored output directory).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | "staff/rbac" in VIDEO-02 means ONE combined video covering both staff-management and RBAC/permission-matrix workflows, not two separate videos, based on REQUIREMENTS.md's own wording ("staff/rbac") vs. the task brief's looser phrasing ("staff, rbac" as if separate) `[ASSUMED]` | Per-Domain Script Structure | If the user actually wants 13 domain videos (staff and rbac split), the plan undercounts by one video — low-cost to fix (one more script) if corrected during planning/discuss-phase |
| A2 | `crf 20` (slightly sharper than ffmpeg's commonly-documented default of 23) is an acceptable quality/file-size tradeoff for training videos meant to be watched clearly `[ASSUMED]` | Code Examples — ffmpeg conversion | If file size for website embedding matters more than sharpness, bump to `crf 23` or add `-vf scale=1280:720` — a one-flag change, no rework |
| A3 | A direct `profiles.locale` DB seed (bypassing the Settings UI) satisfies VIDEO-04's "via the app's existing per-staff locale switch" requirement, since the *mechanism* being exercised (the `profiles.locale` column driving `i18n.changeLanguage()`) is the same one the Settings UI writes to `[ASSUMED]` | Bilingual Strategy / Pattern 2 | If the user intends every video to visibly demonstrate the language-switch UI, this needs revisiting — cheap to add a caption showing the current UI language is intentional, more costly to re-record 22 domain scenarios with an added UI step |

## Open Questions

1. **Exact edge-case count per domain video**
   - What we know: VIDEO-02 says "real workflow(s) plus its key edge cases/error states" — no fixed number.
   - What's unclear: Whether the planner should cap each domain video at exactly 1 workflow + 1 edge case for time/consistency, or allow richer domains (checkout, payments, promotions) 2-3 edge cases.
   - Recommendation: Cap at workflow + up to 2 edge cases per domain (as tabulated above) to keep each video reasonably short and keep the total recording/conversion run time bounded — 12 domains × 2 locales × (1 workflow + ~1.5 edge cases avg) is already ~40+ short recordings before the full walkthrough.

2. **Whether `tutorial-videos/` needs a manifest/index file for the website embed**
   - What we know: VIDEO-05 only requires the `.mp4` files land under `tutorial-videos/<domain>/`.
   - What's unclear: Whether a later phase (or this one) needs a JSON/README manifest listing filenames + locale + duration for the website's embed code to consume.
   - Recommendation: Out of scope for this phase per the locked requirements — leave for a future website-integration phase unless the user says otherwise during planning.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@playwright/test` / `playwright` | Recording harness | ✓ | 1.59.1 `[VERIFIED: package.json, this session]` | — |
| `ffmpeg` | `.webm` → `.mp4` conversion | ✓ | 8.1-full_build (libx264, aac) `[VERIFIED: ffmpeg -version, this session]` | — |
| `tsx` | Running the conversion script | ✓ | ^4.21.0 `[VERIFIED: package.json, this session]` | — |
| `glob` | Finding recorded `.webm` files | ✓ | ^13.0.6 `[VERIFIED: package.json, this session]` | Node's built-in recursive `fs.readdirSync` if preferred — trivial swap either way |
| Local Supabase stack (55321-55323) | Seeding/login for every recording | Not directly probed this session — assumed running per standard dev workflow `[ASSUMED]` | — | Recording scripts already `test.skip()` cleanly via `requireIntegrationEnv()` if env vars are missing, matching existing e2e behavior |
| `npm run dev` (Vite, port 1520) | `baseURL` for every recording | Not directly probed this session — assumed available per standard dev workflow `[ASSUMED]` | — | Playwright's `webServer` block auto-starts it if not already running (`reuseExistingServer: true`) |

**Missing dependencies with no fallback:** None — every tool required is already installed and
confirmed.

## Validation Architecture

This phase produces build tooling and video artifacts, not application business logic — "tests" here
validate the *harness*, not app behavior (app behavior is already covered by the existing `e2e/` suite,
which these scripts deliberately do not re-verify).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (unit, for the small new helpers) + Playwright (the recording scripts themselves are the "test") |
| Config file | `vitest.config.ts` (existing, `unit` project) for helper unit tests; `playwright.tutorial.config.ts` (new) for recordings |
| Quick run command | `npx vitest run e2e/tutorials/locale.test.ts --project unit` (if a unit test is added for `seedStaffLocale`) |
| Full suite command | `npm run tutorial-videos` (record + convert, end to end) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VIDEO-01 | Post-action hold lands within 2000-4000ms | unit (fake timers on the `narrate()` helper) | `npx vitest run e2e/tutorials/fixtures.test.ts` | ❌ Wave 0 |
| VIDEO-02/VIDEO-03 | Each domain/full-walkthrough script runs to completion and produces a non-empty `.webm` | integration (the recording run itself) | `npm run tutorial-videos:record` | ❌ Wave 0 (new specs) |
| VIDEO-04 | Both locale runs produce distinct output files, and the target locale's strings actually render (spot-check one caption/heading text per locale) | integration (assertion inside each spec, e.g. `expect(heading).toHaveText(...)` locale-aware regex, matching the existing `i18n-locale-switch.spec.ts` pattern) | Part of `npm run tutorial-videos:record` | ❌ Wave 0 |
| VIDEO-05 | Conversion script produces one non-zero-byte `.mp4` per `.webm`, under the correct `tutorial-videos/<domain>/` path | integration (a small Node assertion script, or a manual `ls -la tutorial-videos/**/*.mp4` size check) | `npm run tutorial-videos:convert` then a file-count/size assertion | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** Run the single new domain script being added (`npx playwright test e2e/tutorials/<domain> --config=playwright.tutorial.config.ts`) — do not re-run the whole suite per commit.
- **Per wave merge:** Full `npm run tutorial-videos:record` for one locale, spot-check 2-3 output videos play back correctly.
- **Phase gate:** Full `npm run tutorial-videos` (both locales, full conversion) before considering the phase done; verify file count matches `12 domains + 1 full-walkthrough) × 2 locales`.

### Wave 0 Gaps
- [ ] `e2e/tutorials/fixtures.ts` — the `narrate()`/hold + `video.saveAs()` teardown helper (new)
- [ ] `e2e/tutorials/locale.ts` — `seedStaffLocale()` helper (new)
- [ ] `playwright.tutorial.config.ts` — new dedicated config (new)
- [ ] `scripts/tutorial-videos-convert.ts` — ffmpeg conversion script (new)
- [ ] `.gitignore` entries for `e2e-results-tutorials/` and `tutorial-videos/` (new)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No new surface | Reuses existing `loginAs()`/PIN flow against the existing local dev Supabase auth — no new auth code is written |
| V3 Session Management | No | No session logic touched |
| V4 Access Control | No | No RBAC logic touched — recordings merely demonstrate existing RBAC gates (e.g. cashier denied `/rbac`) |
| V5 Input Validation | No | No new user-facing input is added; scripts only drive existing, already-validated forms |
| V6 Cryptography | No | Not touched |

This phase adds zero production code shipped to the built app or customer machine — every new file is
dev/build tooling (`e2e/tutorials/**`, `playwright.tutorial.config.ts`, `scripts/tutorial-videos-convert.ts`)
that never enters `dist/` or the Tauri bundle.

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| A recorded video accidentally shows a real secret (e.g. `SUPABASE_SERVICE_ROLE_KEY`, a real customer PIN) | Information Disclosure | Recordings only ever drive the UI as a logged-in staff member using the existing test-only `.env.local` PINs (e.g. admin `0000`, already documented as a non-secret dev fixture in `CLAUDE.md`); scripts must never `console.log`/caption raw env var values or service-role keys on screen. Mirror `global-setup.ts`'s existing guard: `playwright.tutorial.config.ts` sources `.env.local` only (never `.env.production`/`.env.remote-e2e`), so recordings can only ever run against the local dev Supabase stack |
| A recording accidentally hits the real remote/production Supabase project | Tampering / Information Disclosure | Follow the exact same pattern as `e2e/global-setup.ts`'s `pruneTransactionalHistory()` guard (only runs when `VITE_SUPABASE_URL` matches `127.0.0.1`/`localhost`) — the tutorial harness should perform the same URL check before any seeding/write helper runs, refusing to proceed against a non-local URL |

## Sources

### Primary (HIGH confidence)
- `D:\Projects\Code\supermarket-pos\e2e\training\caption.ts`, `combo-checkout.spec.ts`,
  `playwright.training.config.ts` — read in full this session; the proven prior-art pattern this
  research builds on
- `D:\Projects\Code\supermarket-pos\playwright.config.ts` — read in full this session; confirms
  `baseURL`, headless default, agent-browser Chrome-for-Testing detection, and that video recording is
  `'retain-on-failure'` in the CI-critical config (not to be touched)
- `D:\Projects\Code\supermarket-pos\e2e\helpers\auth.ts`, `supabase.ts` (function names),
  `requireEnv.ts`, `tauriPeekMock.ts`, `e2e\receipts\reprint.spec.ts` (print mock),
  `e2e\global-setup.ts`, `e2e\settings\i18n-locale-switch.spec.ts` — all read this session
- `ffmpeg -version` output, run this session — confirms 8.1-full_build with `libx264`/`aac` present
- `package.json` — read this session — confirms `@playwright/test`/`playwright` 1.59.1, `tsx` ^4.21.0,
  `glob` ^13.0.6, no `cross-env`

### Secondary (MEDIUM confidence)
- [Video | Playwright (playwright.dev/docs/api/class-video)](https://playwright.dev/docs/api/class-video) — `saveAs()`/`path()` semantics (copies file, resolves only after context close)
- [WebM to MP4 with FFmpeg — VP8/VP9 + Opus to H.264/AAC (ffmpeg-cookbook.com)](https://ffmpeg-cookbook.com/en/articles/webm-to-mp4/) — the exact flag set used in the Code Examples section

### Tertiary (LOW confidence)
- None used as load-bearing claims — all package/tool claims above were verified directly against this repo's `package.json` or a run command, not left as unverified training-data recall.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every tool confirmed present via `package.json`/`ffmpeg -version` this session, zero new installs
- Architecture: HIGH — built directly on a working, shipped prior-art pattern (`e2e/training/`) read in full this session, not designed from scratch
- Pitfalls: HIGH — grounded in reading the actual Tauri-mock/peek-window/print-mock source files this session, not inferred

**Research date:** 2026-09-16
**Valid until:** Stable for this phase's lifetime — no external API/library version drift risk since zero new dependencies are introduced; re-check only if `@playwright/test` is upgraded before this phase executes.

## RESEARCH COMPLETE
