---
phase: 34-tutorial-video-generation
plan: 01
subsystem: testing
tags: [playwright, ffmpeg, e2e, video-recording, i18n, vitest]

# Dependency graph
requires: []
provides:
  - "e2e/tutorials/pacing.ts — resolveHoldMs()/buildVideoOutputPath() pure helpers, zero Playwright import"
  - "e2e/tutorials/i18n-selectors.ts — dual-locale (es-MX/en-US) selector constants + selectProductRe()"
  - "e2e/tutorials/locale.ts — seedStaffLocale()/currentTutorialLocale(), localhost-only guard"
  - "e2e/tutorials/fixtures.ts — narrate() + page-fixture video.saveAs() teardown (with the page.close() fix)"
  - "playwright.tutorial.config.ts — dedicated HD (1920x1080) always-on-video recording config"
  - "scripts/tutorial-videos-convert.ts — resolveOutputPath()/buildFfmpegArgs() + CLI ffmpeg conversion pass"
  - "One real, playable checkout tutorial video pair at tutorial-videos/checkout/*.mp4"
affects: [34-02, 34-03, 34-04, 34-05, 34-06]

# Actuals (#2632)
actuals:
  tokens: 5761
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tutorial-video harness: narrate(page, caption, action, holdMs?) wraps caption() + action + resolveHoldMs() post-action hold"
    - "Locale-safe dual-regex selectors (es-MX/en-US) centralized in i18n-selectors.ts, generalizing the existing WHO_ARE_YOU_RE pattern from e2e/helpers/auth.ts"
    - "Direct profiles.locale DB seed (seedStaffLocale) instead of driving the Settings UI, guarded to localhost-only Supabase URLs"

key-files:
  created:
    - e2e/tutorials/pacing.ts
    - e2e/tutorials/pacing.test.ts
    - e2e/tutorials/i18n-selectors.ts
    - e2e/tutorials/i18n-selectors.test.ts
    - e2e/tutorials/locale.ts
    - e2e/tutorials/locale.test.ts
    - e2e/tutorials/fixtures.ts
    - playwright.tutorial.config.ts
    - scripts/tutorial-videos-convert.ts
    - scripts/tutorial-videos-convert.test.ts
    - e2e/tutorials/checkout/checkout.spec.ts
  modified:
    - e2e/helpers/auth.ts
    - playwright.config.ts
    - vitest.config.ts
    - .gitignore
    - package.json

key-decisions:
  - "Video.saveAs() must run after an explicit page.close() inside the page fixture's teardown — the base page/context fixtures don't close until after this fixture's own teardown returns, so calling saveAs() without closing first deadlocks until the test's global timeout"
  - "scripts/tutorial-videos-convert.ts's run-as-CLI guard uses pathToFileURL(process.argv[1]).href, not a literal file://${process.argv[1]} template, so it works correctly on Windows"

patterns-established:
  - "Every future domain script (34-02..34-06) imports test/expect from e2e/tutorials/fixtures.ts, staffForRole/loginAs from e2e/helpers/auth.ts, seedStaffLocale/currentTutorialLocale from e2e/tutorials/locale.ts, and locale-safe selectors from e2e/tutorials/i18n-selectors.ts — none of these files should be modified by later plans"

requirements-completed: [VIDEO-01, VIDEO-02, VIDEO-04, VIDEO-05, VIDEO-06]

coverage:
  - id: D1
    description: "Reusable pacing/path helpers (resolveHoldMs, buildVideoOutputPath) with zero Playwright import, unit tested"
    requirement: "VIDEO-01"
    verification:
      - kind: unit
        ref: "e2e/tutorials/pacing.test.ts — 4 cases (default hold, clamp low, clamp high, path build)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Dual-locale (es-MX/en-US) selector constants + selectProductRe(), unit tested including regex-escaping"
    requirement: "VIDEO-04"
    verification:
      - kind: unit
        ref: "e2e/tutorials/i18n-selectors.test.ts — 3 cases (dual-locale match, special-char escaping)"
        status: pass
    human_judgment: false
  - id: D3
    description: "seedStaffLocale()/currentTutorialLocale() locale-seeding helper, localhost-only guard (T-34-02)"
    requirement: "VIDEO-04"
    verification:
      - kind: unit
        ref: "e2e/tutorials/locale.test.ts — 3 cases (update/eq called correctly, error propagation, non-local URL refuses to call getServiceClient)"
        status: pass
    human_judgment: false
  - id: D4
    description: "playwright.tutorial.config.ts loads correctly and the CI-critical suite provably ignores e2e/tutorials/**"
    requirement: "VIDEO-01"
    verification:
      - kind: e2e
        ref: "npx playwright test --config=playwright.tutorial.config.ts --list (loads cleanly); npx playwright test --list | grep -c e2e/tutorials (returns 0)"
        status: pass
    human_judgment: false
  - id: D5
    description: "ffmpeg conversion pure helpers (resolveOutputPath, buildFfmpegArgs) unit tested"
    requirement: "VIDEO-05"
    verification:
      - kind: unit
        ref: "scripts/tutorial-videos-convert.test.ts — 2 cases"
        status: pass
    human_judgment: false
  - id: D6
    description: "End-to-end tracer: two checkout scenarios (cash + card) record, hold, produce .webm, convert to playable H.264 .mp4 under tutorial-videos/checkout/"
    requirement: "VIDEO-02"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/tutorials/checkout --config=playwright.tutorial.config.ts — 2 passed (~20s each)"
        status: pass
      - kind: other
        ref: "npm run tutorial-videos (record+convert) then ffprobe on both tutorial-videos/checkout/*.mp4 — h264 video stream, non-zero duration (17.9s/18.8s), file size >0"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-09-16
status: complete
---

# Phase 34 Plan 01: Tutorial Video Harness + Checkout Tracer Summary

**Reusable Playwright tutorial-video harness (pacing/hold, locale-safe dual-regex selectors, locale-seeding, HD recording config, ffmpeg conversion script) with the full record → pace → `.webm` → ffmpeg → `.mp4` pipeline proven end-to-end on two real checkout scenarios (cash + card payment) in es-MX.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-09-16T12:35:00Z (approx.)
- **Completed:** 2026-09-16T13:31:31-06:00
- **Tasks:** 3
- **Files modified:** 16

## Accomplishments
- `e2e/tutorials/pacing.ts` / `i18n-selectors.ts` — pure, Playwright-free helpers (post-action hold clamping, stable video-path slugging, dual-locale product-select regex) with 7 passing unit tests
- `e2e/tutorials/locale.ts` / `fixtures.ts` — locale-seeding helper (localhost-only guarded) and the `narrate()` + video-save fixture every later domain script will import unmodified
- `playwright.tutorial.config.ts` — dedicated HD (1920×1080) always-on-recording config, provably excluded from the CI-critical `npm run test:e2e` suite
- `scripts/tutorial-videos-convert.ts` — ffmpeg conversion pass (libx264/aac/+faststart), unit-tested pure helpers plus a real CLI entrypoint
- **End-to-end proof:** `e2e/tutorials/checkout/checkout.spec.ts` records two es-MX checkout scenarios (cash sale, card payment) that convert into two real, playable `tutorial-videos/checkout/*.mp4` files (H.264, ~18s each, confirmed via `ffprobe`)

## Task Commits

Each task was committed atomically:

1. **Task 1: Pacing/path + locale-safe-selector pure helpers (TDD)** - `a0766b9` (test)
2. **Task 2: Locale-seeding helper + harness plumbing (TDD)** - `04a7706` (test)
3. **Task 3: Tracer — checkout domain video, full pipeline proof (es-MX)** - `7dd47ff` (feat)

_Note: all three commits are prefixed `test`/`feat` per TDD convention — each task's RED+GREEN work landed in a single commit since the harness helpers and their tests were authored together and verified passing before commit (no separate red-then-green history was preserved as distinct commits for this plan)._

## Files Created/Modified
- `e2e/tutorials/pacing.ts` - `resolveHoldMs()`/`buildVideoOutputPath()` pure helpers
- `e2e/tutorials/pacing.test.ts` - unit tests for the above
- `e2e/tutorials/i18n-selectors.ts` - dual-locale selector constants + `selectProductRe()`
- `e2e/tutorials/i18n-selectors.test.ts` - unit tests for the above
- `e2e/tutorials/locale.ts` - `seedStaffLocale()`/`currentTutorialLocale()`
- `e2e/tutorials/locale.test.ts` - unit tests (mocked `getServiceClient`)
- `e2e/tutorials/fixtures.ts` - `narrate()` + page-fixture video-save teardown
- `e2e/tutorials/checkout/checkout.spec.ts` - the tracer: cash + card payment scenarios
- `playwright.tutorial.config.ts` - dedicated HD recording config
- `scripts/tutorial-videos-convert.ts` - ffmpeg conversion script
- `scripts/tutorial-videos-convert.test.ts` - unit tests for the pure helpers
- `e2e/helpers/auth.ts` - exported `staffForRole` (was internal-only)
- `playwright.config.ts` - added `/tutorials\//` to `testIgnore`
- `vitest.config.ts` - added the `e2e-tools` project (`e2e/tutorials/**/*.test.ts` + `scripts/tutorial-videos-convert.test.ts`)
- `.gitignore` - added `e2e-results-tutorials/` and `tutorial-videos/`
- `package.json` - added `tutorial-videos:record`/`tutorial-videos:convert`/`tutorial-videos` scripts

## Decisions Made
- `Video.saveAs()`'s own semantics ("waits until the page is closed") require an explicit `page.close()` in the fixture's teardown before calling it — documented inline in `fixtures.ts` so 34-02..34-06 don't need to rediscover this.
- The CLI run-guard in `tutorial-videos-convert.ts` uses `pathToFileURL(process.argv[1]).href` instead of the plan's literal `file://${process.argv[1]}` template, for correct behavior on Windows.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `video.saveAs()` deadlock in the page fixture**
- **Found during:** Task 3 (tracer end-to-end run)
- **Issue:** The plan's literal fixture code called `page.video().saveAs(...)` immediately after `await use(page)` returns, but Playwright's base `page`/`context` fixtures don't actually close the page/context until after this overriding fixture's own teardown code finishes running. `Video.saveAs()`'s documented contract is "waits until the page is closed and the video is fully saved" — since nothing ever closed the page, every test run hung until the whole test's 180s global timeout forcibly killed it (confirmed via temporary `console.log` timing instrumentation: the actual test body, including the payment flow and the "Done" click, completed in ~19 seconds every time — the failure was 100% in teardown, not app/selector logic).
- **Fix:** Added `await page.close().catch(() => undefined);` immediately before `video.saveAs()` in `e2e/tutorials/fixtures.ts`.
- **Files modified:** `e2e/tutorials/fixtures.ts`
- **Verification:** Both checkout scenarios now pass in ~20s each (previously timed out at 180s every run); `.webm`/`.mp4` files produced correctly.
- **Committed in:** `7dd47ff` (Task 3 commit)

**2. [Rule 1 - Bug] Windows-incompatible CLI run-guard**
- **Found during:** Task 3 (writing `scripts/tutorial-videos-convert.ts`)
- **Issue:** The plan's specified guard `import.meta.url === \`file://${process.argv[1]}\`` never matches on Windows, since `process.argv[1]` uses backslashes and has no `file:///` scheme while `import.meta.url` is a proper `file:///`-prefixed URL with forward slashes — `main()` would never run when the script is invoked directly via `tsx`.
- **Fix:** Used `pathToFileURL(process.argv[1]).href === import.meta.url` instead (Node's documented cross-platform-correct pattern).
- **Files modified:** `scripts/tutorial-videos-convert.ts`
- **Verification:** `npm run tutorial-videos:convert` runs `main()` and converts both `.webm` files successfully.
- **Committed in:** `7dd47ff` (Task 3 commit)

**3. [Rule 3 - Blocking] `playwright.tutorial.config.ts` picked up its own `.test.ts` files**
- **Found during:** Task 2 (verifying the new config loads)
- **Issue:** Once Task 2 added `e2e/tutorials/locale.test.ts` alongside the (Task 1) `pacing.test.ts`/`i18n-selectors.test.ts` files inside `playwright.tutorial.config.ts`'s `testDir`, Playwright's default `testMatch` picked up these Vitest files too, throwing `Cannot redefine property: Symbol($$jest-matchers-object)` and aborting discovery entirely — the exact same root cause `playwright.config.ts` already documents for the CI-critical suite.
- **Fix:** Added `testIgnore: [/\.test\.ts$/]` to `playwright.tutorial.config.ts`, mirroring the CI-critical config's own entry.
- **Files modified:** `playwright.tutorial.config.ts`
- **Verification:** `npx playwright test --config=playwright.tutorial.config.ts --list` now lists cleanly with no errors.
- **Committed in:** `04a7706` (Task 2 commit)

**4. [Rule 3 - Blocking] Missing worktree-local `.env.local` and a down local edge-runtime container (environment-only, not a file change)**
- **Found during:** Task 3 precondition check and first tracer run
- **Issue:** This git worktree never received `.env.local` (gitignored, doesn't propagate to worktrees), so `requireIntegrationEnv()` would have skipped the spec entirely. Separately, the first real recording attempt failed with "Payment could not be completed" — the local `supabase_edge_runtime_supermarket-pos-selfhosted` Docker container (which serves the `process-direct-sale` edge function `process_direct_sale_atomic` routes through) had exited.
- **Fix:** Copied `.env.local` from the main checkout into this worktree; ran `docker start supabase_edge_runtime_supermarket-pos-selfhosted`.
- **Files modified:** None (environment-only; `.env.local` stays gitignored and is not committed).
- **Verification:** Subsequent payment flows completed successfully against the local Supabase instance.

---

**Total deviations:** 4 auto-fixed (2 bugs, 1 blocking config issue, 1 blocking environment issue)
**Impact on plan:** All four were necessary to get a real, passing tracer run. The `video.saveAs()` deadlock fix is the most consequential for future plans — 34-02 through 34-06 import `fixtures.ts` unmodified and would have hit the identical 180s-timeout deadlock on every single domain script without it.

## Issues Encountered

- During investigation of the `video.saveAs()` deadlock, two red herrings were ruled out before the real cause was found: (1) a leaked `terminal_lock_settings` row for `terminal_id='POS-1'` was checked and found to already hold the correct default (60s), and was left as found (restored after a diagnostic delete); (2) this local Supabase instance's `products`/`categories` tables carry substantial leaked `'E2E %'`-prefixed test fixtures from other e2e specs (218/264 products, 170/185 categories) that never got swept — this was proven NOT to be the bottleneck by running the CI-critical `e2e/checkout/happy-path.spec.ts` against the identical polluted DB, which passed in 5.1s. This pre-existing test-data hygiene gap (no `resetTestState()` sweep exists for `'E2E %'`-named products/categories, unlike the existing sweep for `'E2E %'`-named promotions) is out of this plan's scope and is not currently blocking anything, but is worth a future cleanup.

## User Setup Required

None - no external service configuration required. (Local Supabase + the local `process-direct-sale` edge function must be running for anyone re-running `npm run tutorial-videos:record`, same as for the rest of the `e2e/` suite.)

## Next Phase Readiness

- `pacing.ts`, `i18n-selectors.ts`, `locale.ts`, `fixtures.ts` (with the `page.close()` fix), and `playwright.tutorial.config.ts` are stable, proven building blocks — Plans 34-02 through 34-06 can import them unmodified with confidence the video-save pipeline actually works.
- `scripts/tutorial-videos-convert.ts` handles any number of `.webm` files under `e2e-results-tutorials/raw/**` with no per-domain changes needed.
- No blockers for 34-02 through 34-06. Minor note: the local Supabase instance's leaked `'E2E %'`-prefixed products/categories (see Issues Encountered) don't block anything today, but a future phase could add the equivalent sweep to `resetTestState()`'s existing `'E2E %'` promotions cleanup for general test-suite hygiene.

---
*Phase: 34-tutorial-video-generation*
*Completed: 2026-09-16*

## Self-Check: PASSED

All 11 created files confirmed present on disk; all 3 task commits (`a0766b9`, `04a7706`, `7dd47ff`) confirmed in `git log`.
