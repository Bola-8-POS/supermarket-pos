---
phase: 34-tutorial-video-generation
plan: 06
subsystem: testing
tags: [playwright, ffmpeg, e2e, video-recording, i18n, zod]

# Dependency graph
requires:
  - phase: 34-01
    provides: "e2e/tutorials/{pacing,i18n-selectors,locale,fixtures}.ts, playwright.tutorial.config.ts, scripts/tutorial-videos-convert.ts"
  - phase: 34-02
    provides: "e2e/tutorials/{inventory,suppliers,payments}/*.spec.ts"
  - phase: 34-03
    provides: "e2e/tutorials/{staff-rbac,caja,reports}/*.spec.ts"
  - phase: 34-04
    provides: "e2e/tutorials/{promotions,receipts,purchase-orders}/*.spec.ts"
  - phase: 34-05
    provides: "e2e/tutorials/{settings,audit}/*.spec.ts"
provides:
  - "e2e/tutorials/full-walkthrough/full-walkthrough.spec.ts — one continuous business-day video (caja open -> cashier sale -> manager refund -> admin reports -> caja close)"
  - "The complete tutorial-videos/ tree: 50 non-empty, playable .mp4 files (25 es-MX + 25 en-US) across all 13 spec groups"
  - "Fixed CajaReportStaffSchema.salesTotal (was nonnegative, rejected legitimate negative net totals after a refund)"
  - "Fixed playwright.tutorial.config.ts outputDir so a second locale record pass no longer deletes the first locale's .webm output"
affects: []

# Actuals (#2632)
actuals:
  tokens: 2800
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "playwright.tutorial.config.ts's outputDir must be a directory that does NOT contain pacing.ts's RAW_VIDEO_DIR ('e2e-results-tutorials/raw') — Playwright's runner rm -rf's the whole configured outputDir at the start of every invocation, and a sequential bilingual double-run (TUTORIAL_LOCALE=es-MX then =en-US) silently destroys the first locale's saved videos otherwise"
    - "A report/summary schema field that represents a NET total (sales minus refunds attributed to one staff member) cannot use the same nonnegative MoneySchema as a raw sale/payment amount — it can legitimately go negative for a staff member who only processes refunds in a session"

key-files:
  created:
    - e2e/tutorials/full-walkthrough/full-walkthrough.spec.ts
  modified:
    - playwright.tutorial.config.ts
    - src/shared/lib/domain.ts

key-decisions:
  - "full-walkthrough.spec.ts refunds the REAL sale created by its own Step 2 checkout (not a synthetically seeded tab like payments.spec.ts's isolated refund test) — this is the only tutorial spec that chains real state across role transitions rather than seeding fixtures per test"
  - "Admin reviews Reports on the caja session while it is still OPEN (Step 4, before Step 5's close) — CajaReportPanel's session selector already lists open sessions with an 'open' suffix, so no reordering of the plan's 5 steps was needed"
  - "outputDir fix scoped to a one-line path change (sibling '.pw-artifacts' subfolder) rather than touching pacing.ts's RAW_VIDEO_DIR — smallest diff that decouples Playwright's own scratch-cleanup from the saveAs() destination"

patterns-established: []

requirements-completed: [VIDEO-03, VIDEO-04, VIDEO-05, VIDEO-06]

coverage:
  - id: D1
    description: "Full end-to-end business-day walkthrough video: manager opens caja -> cashier cash sale -> manager refund with PIN gate -> admin reviews Reports -> manager closes caja, one continuous test, one .webm/.mp4 per locale"
    requirement: "VIDEO-03"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/tutorials/full-walkthrough --config=playwright.tutorial.config.ts — 1 passed (1.8m)"
        status: pass
      - kind: other
        ref: "tutorial-videos/full-walkthrough/*.mp4 — 2 files (es-MX 94.16s, en-US), ffprobe confirms h264/1920x1080/non-zero duration"
        status: pass
    human_judgment: false
  - id: D2
    description: "Full bilingual double-run across all 13 spec groups (12 domains from 34-01..34-05 plus this plan's full-walkthrough) produces exactly 50 non-empty .webm recordings"
    requirement: "VIDEO-04"
    verification:
      - kind: e2e
        ref: "TUTORIAL_LOCALE=es-MX npm run tutorial-videos:record (25 passed) && TUTORIAL_LOCALE=en-US npm run tutorial-videos:record (25 passed); find e2e-results-tutorials/raw -name '*.webm' | wc -l -> 50"
        status: pass
    human_judgment: false
  - id: D3
    description: "Final ffmpeg conversion produces exactly 50 non-empty .mp4 files under tutorial-videos/<domain>/, split 25 es-MX / 25 en-US, full-walkthrough/ containing exactly 2 files"
    requirement: "VIDEO-05"
    verification:
      - kind: other
        ref: "npm run tutorial-videos:convert -> 'Converted 50 video(s)'; find tutorial-videos -name '*.mp4' | wc -l -> 50; -size 0 | wc -l -> 0; *.es-MX.mp4 | wc -l -> 25; *.en-US.mp4 | wc -l -> 25; full-walkthrough/ -> 2 files"
        status: pass
    human_judgment: false
  - id: D4
    description: "No flow needed more than 3 debugging attempts beyond straightforward copy-paste before stopping to ask (VIDEO-06 stop-and-ask threshold never triggered — both real bugs found were root-caused and fixed within the phase's own deviation rules, not escalated)"
    verification:
      - kind: other
        ref: "See Deviations from Plan — 2 auto-fixed bugs (Rule 1), both required investigation but resolved without exceeding the STOP-AND-ASK budget"
        status: pass
    human_judgment: false

duration: 70min
completed: 2026-09-16
status: complete
---

# Phase 34 Plan 06: Full Business-Day Walkthrough + Full Bilingual Phase-Gate Summary

**One continuous full-business-day tutorial video (caja open -> cash sale -> refund -> admin reports -> caja close) plus the complete bilingual `tutorial-videos/` deliverable: 50 non-empty, ffprobe-verified H.264 .mp4 files (25 es-MX + 25 en-US) across all 13 spec groups, closing out Phase 34.**

## Performance

- **Duration:** ~70 min
- **Started:** 2026-09-16T20:26:00Z (approx.)
- **Completed:** 2026-09-16T21:34:00Z
- **Tasks:** 3
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- `e2e/tutorials/full-walkthrough/full-walkthrough.spec.ts` — a single continuous test chaining all three roles via `logout()`/`loginAs()`: manager opens caja with a drawer float, cashier completes a real cash sale, manager refunds that same sale with the PIN gate, admin reviews the day's revenue/reconciliation on the still-open session, manager closes the caja at end of day. Every step sequence copied verbatim from the domain spec that already proved it (34-01/34-02/34-03).
- Found and fixed a real, previously-latent app bug (Rule 1): `CajaReportStaffSchema.salesTotal` used the nonnegative `MoneySchema`, silently blanking the entire Reports page (no error shown) whenever a session's staff summary included a refund-driven negative net total — a combination no prior plan's tests ever exercised (refund + report-review on the same session).
- Found and fixed a real harness bug (Rule 1/3): `playwright.tutorial.config.ts`'s `outputDir` overlapped with `pacing.ts`'s `RAW_VIDEO_DIR`, so Playwright's own start-of-run cleanup silently deleted the first locale's entire `.webm` output when the second locale's record pass began — invisible until this plan became the first to actually run the bilingual double-pass end to end.
- Ran the full bilingual record pass across all 13 spec groups twice (`TUTORIAL_LOCALE=es-MX` then `=en-US`), 25/25 tests passing each time, then the final `ffmpeg` conversion — producing exactly 50 non-empty, ffprobe-verified `.mp4` files (25 es-MX + 25 en-US) under `tutorial-videos/`, matching the phase's full deliverable spec exactly.

## Task Commits

Each task was committed atomically:

1. **Task 1: Full end-to-end business-day walkthrough video** - `0e4dc7f` (feat) — includes the `CajaReportStaffSchema` fix, discovered while getting this task's own verify to pass
2. **Task 2: Full bilingual double-run across all 13 spec groups** - `29c4fd3` (fix) — the `outputDir` fix, discovered mid-task when the first bilingual pass produced only 25 (not 50) `.webm` files
3. **Task 3: Final ffmpeg conversion + phase-gate file-count verification** - no commit (generated output only, as the plan specifies — `tutorial-videos/` and `e2e-results-tutorials/` are both gitignored)

## Files Created/Modified
- `e2e/tutorials/full-walkthrough/full-walkthrough.spec.ts` - the single continuous full-business-day video spec
- `playwright.tutorial.config.ts` - `outputDir` moved to a sibling subfolder (`.pw-artifacts`) so it no longer overlaps `RAW_VIDEO_DIR`
- `src/shared/lib/domain.ts` - `CajaReportStaffSchema.salesTotal` loosened from the nonnegative `MoneySchema` to a plain signed `z.number().multipleOf(0.01)`

## Decisions Made
- The refund in Step 3 targets the REAL sale created by Step 2's checkout (not a synthetically seeded tab like `payments.spec.ts`'s isolated refund test) — this is the only tutorial spec in the phase that chains real state across role transitions instead of seeding fresh fixtures per test.
- Step 4 (admin reviews Reports) runs against the caja session while it is still OPEN, before Step 5 closes it — confirmed via `CajaReportPanel.tsx` that the session selector already lists open sessions (with an "open" suffix), so no reordering of the plan's specified 5-step sequence was needed.
- The `outputDir` fix is a one-line path change to a sibling subfolder rather than touching `pacing.ts`'s `RAW_VIDEO_DIR` — smallest diff that decouples Playwright's own scratch-cleanup from the `saveAs()` destination, with zero risk to any of the 12 already-shipped domain specs (they only import `RAW_VIDEO_DIR` indirectly via `fixtures.ts`, never `outputDir` directly).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `CajaReportStaffSchema.salesTotal` rejected a legitimate negative net total, blanking the entire Reports page**
- **Found during:** Task 1 (full-walkthrough Step 4 — admin reviews Reports after the Step 3 refund)
- **Issue:** `get_caja_report`'s RPC response correctly returned a `staffSummary` row for the manager with `salesTotal: -55.00` (the manager processed a refund without a corresponding sale in that session — a real, valid net total). `CajaReportStaffSchema.salesTotal: MoneySchema` uses `z.number().nonnegative()`, so `CajaReportSchema.parse(data)` threw inside `useCajaReport`'s `queryFn`, `reportResult.ok` became `false`, and `report` stayed `null` — the whole Reports content area rendered blank with no spinner and no error message (confirmed via a `page.on('response')` capture showing a valid `200 ok:true` RPC response, plus polling `page.getByText(...).count()` over 18s showing neither the revenue card nor a loading spinner ever appeared). `MoneyDisplay`'s own doc comment (`<MoneyDisplay amount={-5.00} />`) and its `isNegative` styling already prove negative money values are a supported, intentional UI pattern elsewhere in the app — this was purely an over-strict schema on one specific net-total field, not a rendering gap.
- **Fix:** Changed `CajaReportStaffSchema.salesTotal` from `MoneySchema` to `z.number().multipleOf(0.01)` (still 2-decimal-precision, but signed).
- **Files modified:** `src/shared/lib/domain.ts`
- **Verification:** `npm run typecheck` passes; `npx vitest run` on `pdf.test.ts`/`excel.test.ts` (both exercise `salesTotal` with positive fixture values) — 15/15 pass; re-ran the full-walkthrough spec, Reports now renders Total Revenue/Cash Reconciliation/Top 10 Products correctly.
- **Committed in:** `0e4dc7f` (Task 1 commit)

**2. [Rule 1/3 - Bug/Blocking] Second locale's record pass deleted the first locale's `.webm` output**
- **Found during:** Task 2 (full bilingual double-run) — after both `TUTORIAL_LOCALE=es-MX` and `=en-US` record passes reported "25 passed" each, `find e2e-results-tutorials/raw -name "*.webm" | wc -l` returned only 25, not 50; all 25 remaining files were en-US-only, every es-MX file was gone.
- **Issue:** `playwright.tutorial.config.ts`'s `outputDir` was `./e2e-results-tutorials` — the exact parent directory of `pacing.ts`'s `RAW_VIDEO_DIR` (`e2e-results-tutorials/raw`), the destination `fixtures.ts`'s `video.saveAs()` copies each recording into. Playwright's runner unconditionally `rm -rf`'s the configured `outputDir` at the start of every `playwright test` invocation (confirmed by reading `node_modules/playwright/lib/runner/tasks.js`'s `"clear output"` task, which calls `removeFolders([outputDir])` in its `setup`). Since no prior plan (34-01 through 34-05) ever ran the record pass more than once in a session, this destructive overlap was invisible until this plan became the first to run the config twice in sequence against the same `outputDir`.
- **Fix:** Moved `outputDir` to a sibling subfolder, `./e2e-results-tutorials/.pw-artifacts`, so Playwright's own scratch-cleanup no longer touches the `raw/` folder `saveAs()` writes into.
- **Files modified:** `playwright.tutorial.config.ts`
- **Verification:** Re-ran the es-MX pass after the fix (25 passed) — the previously-recorded 25 en-US files survived intact, bringing the total to the expected 50. Config still loads cleanly (`--list` shows 25 tests, 13 files) and the CI-critical suite still reports 0 `e2e/tutorials` matches.
- **Committed in:** `29c4fd3` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs, one app-level schema bug and one test-harness infrastructure bug)
**Impact on plan:** Both fixes were necessary to produce the phase's actual deliverable — without #1, every bilingual Reports recording would show a blank report screen; without #2, the bilingual double-run would never produce more than 25 total files no matter how many times it was retried. Neither required more than one round of investigation + fix (well within the VIDEO-06 stop-and-ask budget). No scope creep — no other domain spec files were touched.

## Issues Encountered

- Diagnosing deviation #1 required attaching temporary `page.on('response')`/`console.log` debug instrumentation directly in the spec under test to distinguish "RPC never fired" from "RPC succeeded but the client rejected the payload" — all debug code was removed before the final passing run and final commit; the committed spec file contains zero debug instrumentation.
- The local Supabase instance's `caja_sessions` table has accumulated a large number of historical closed sessions across this phase's many prior test runs (documented as a known, non-blocking condition since 34-01-SUMMARY.md) — this made the Reports session-selector dropdown render ~90 `<option>` elements during debugging, which was initially mistaken for a possible root cause before the actual schema-validation bug was found via network-response inspection. Not fixed (out of scope, matches 34-01's documented future-cleanup note).

## User Setup Required

None - no external service configuration required. (This worktree's `.env.local` was copied from the main checkout per every prior plan's documented gotcha — gitignored, not committed. The local `supabase_edge_runtime_supermarket-pos-selfhosted` Docker container was already running.)

## Next Phase Readiness

- Phase 34 (Tutorial Video Generation) is now fully complete: all 6 plans executed, `tutorial-videos/` contains the full 50-file bilingual deliverable (25 es-MX + 25 en-US) across all 13 spec groups (12 domains + full-walkthrough), ready to embed on the product website and hand to customers.
- Two genuine bugs were found and fixed as a direct result of this plan being the first to exercise the full pipeline at scale: a schema-validation gap in `CajaReportStaffSchema` (affects the live app, not just tests — any real store session with a refund and no offsetting sale for a staff member would have hit the same blank-Reports-page bug) and a Playwright harness config gap (affects only this dev-tooling, never shipped to the app). Both fixes are minimal, targeted, and verified.
- No blockers. `.planning/WINDOWS.md` and `deferred-items.md`: no new entries — no stubs, skipped tests, or unrun verifications from this plan.

---
*Phase: 34-tutorial-video-generation*
*Completed: 2026-09-16*

## Self-Check: PASSED

`e2e/tutorials/full-walkthrough/full-walkthrough.spec.ts` confirmed present on disk; commits `0e4dc7f` and `29c4fd3` confirmed in `git log`; `tutorial-videos/` confirmed to contain exactly 50 non-empty `.mp4` files (25 `es-MX` + 25 `en-US`), `tutorial-videos/full-walkthrough/` confirmed to contain exactly 2 files.
