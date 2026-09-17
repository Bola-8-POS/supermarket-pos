---
phase: 34-tutorial-video-generation
plan: 07
subsystem: testing
tags: [playwright, ffmpeg, e2e, video-recording, slowMo, gap-closure]

# Dependency graph
requires:
  - phase: 34-06
    provides: "e2e/tutorials/{full-walkthrough,...}/*.spec.ts, the full 50-file bilingual tutorial-videos/ deliverable, tutorial-videos-record/convert recipe"
provides:
  - "playwright.tutorial.config.ts's use.launchOptions.slowMo=600, closing UAT gap G-34-1's root cause (intra-narrate()-block action pacing)"
  - "8000ms success-toast duration on RefundSheet.tsx and useExportReport.ts, fixing a slowMo-exposed toast-dismissal race in 3/25 specs"
  - "All 50 tutorial-videos/*.mp4 regenerated with corrected per-action pacing (25 es-MX + 25 en-US)"
affects: []

# Actuals (#2632)
actuals:
  tokens: 42000
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "playwright.tutorial.config.ts's use.launchOptions.slowMo paces every raw Playwright action inside a narrate() closure — pacing.ts's resolveHoldMs only ever paces BETWEEN closures, never within one"
    - "The tutorial harness's :1520 dev server is an externally-managed, long-lived process (reuseExistingServer: true) rooted at the main checkout. A worktree-isolated executor cannot verify any src/**/*.tsx fix against it — edits made inside a worktree are never served. Any future phase-34-style plan needing to verify an app-code fix must do so from the main checkout, not from an isolated worktree."

key-files:
  created: []
  modified:
    - playwright.tutorial.config.ts
    - src/features/process-refund/ui/RefundSheet.tsx
    - src/features/export-report/model/useExportReport.ts

key-decisions:
  - "600ms chosen for slowMo per the plan's specified 500-700ms range; the checkout probe proved it adds +9.72s of real per-action pacing on a 7-action/4-block test, well over the +1.5s floor"
  - "slowMo exposed a pre-existing, always-marginal toast-dismissal race in 3/25 es-MX specs (refund, CSV export, and full-walkthrough's copy of the refund step) — root-caused to Sonner's 4000ms default toast duration fading before the paced assertion polled for it. Escalated to the user (not auto-selected) since 3 candidate fixes existed with real tradeoffs; user approved Candidate Fix A (extend toast duration to 8000ms) over reordering narrate() blocks (would violate this plan's own no-spec-edits guardrail) or shrinking global pacing (broader blast radius than the bug)"
  - "The toast-duration fix was authored and verified directly in the main checkout (not the worktree that ran Tasks 1-2) because the shared :1520 dev server only serves the main checkout's source — this is a structural limitation of worktree isolation for this specific harness, not a one-off choice"

patterns-established: []

requirements-completed: [VIDEO-01, VIDEO-04, VIDEO-05]

coverage:
  - id: D1
    description: "playwright.tutorial.config.ts has use.launchOptions.slowMo set to a numeric ms value; no other file changed by Task 1"
    requirement: "VIDEO-01"
    verification:
      - kind: other
        ref: "node -e \"...slowMo...\" verify script — PASS: slowMo configured"
        status: pass
    human_judgment: false
  - id: D2
    description: "Single-spec probe (checkout/cashier-completes-a-cash-sale, es-MX) proves slowMo adds >=1.5s of measurable pacing vs. the pre-fix baseline, plus a visual 3-frame spot-check of the exact bundled fill+click window named in gap G-34-1"
    requirement: "VIDEO-04"
    verification:
      - kind: other
        ref: "ffprobe: baseline=17.92s fresh=27.64s -> PASS: slowMo added 9.72s of real per-action pacing"
        status: pass
      - kind: other
        ref: "3 extracted frames (12.6s/13.4s/13.8s into the fresh .webm) visually confirm distinct search-filled, mid-click, and cart-updated states — not an instantaneous jump"
        status: pass
    human_judgment: false
  - id: D3
    description: "Full bilingual regen of all 50 tutorial-videos/*.mp4 with corrected pacing"
    requirement: "VIDEO-05"
    verification:
      - kind: other
        ref: "50/50 passed (25 es-MX + 25 en-US), including the two previously-failing refund/export-report specs after the toast-duration fix. 50 non-empty .mp4 files, 50 .webm raw recordings, fleet-wide duration 1226.96s -> 1900.48s (+673.52s, +55%)"
        status: pass
    human_judgment: false
---

# Phase 34 Plan 07: Fix Tutorial Video Pacing (G-34-1) — Complete

**All 3 tasks complete. UAT gap G-34-1 closed: slowMo pacing configured, proven, and applied fleet-wide across all 50 tutorial videos — including a real regression the fix exposed and a fix for it, both verified against the live dev server.**

## Performance

- **Duration:** ~90 min (Tasks 1-2 + root-cause diagnosis) + ~40 min (toast fix + full 50-video regen, resumed after a user decision checkpoint)
- **Tasks fully completed:** 3 of 3
- **Files modified:** 3 (playwright.tutorial.config.ts, RefundSheet.tsx, useExportReport.ts)

## Accomplishments

- **Task 1:** Added `use.launchOptions.slowMo: 600` to `playwright.tutorial.config.ts`, with an explanatory comment tying it to UAT gap G-34-1 (intra-`narrate()`-block action pacing, which `pacing.ts`'s `resolveHoldMs` never addressed since it only paces *between* `narrate()` blocks). No spec files touched.
- **Task 2:** Re-recorded ONLY `checkout/cashier-completes-a-cash-sale` (es-MX) against the new config. The fresh `.webm` (27.64s) was 9.72s longer than the pre-fix baseline `.mp4` (17.92s) — well over the plan's +1.5s floor. Three extracted frames from the exact "Search for a product and add it to the cart" window named in gap G-34-1 confirmed genuinely distinct states, not an instantaneous jump.
- **Task 3 — regression found and fixed:** The full es-MX record pass initially failed 3/25 tests deterministically (`payments.spec.ts` refund, `reports.spec.ts` CSV export, `full-walkthrough.spec.ts`'s copy of the refund step). Root-caused to a pre-existing, always-marginal race: the refund RPC + slowMo'd PIN entry pushed the toast-visibility assertion to ~4.4s after the toast fired, past Sonner's 4000ms default duration. This was escalated to the user as a decision checkpoint (3 candidate fixes existed, none was a safe auto-pick under the executor's Rules 1-3). The user approved extending the two affected toasts' duration to 8000ms. The fix was authored and verified directly against the live `:1520` dev server (the worktree that ran Tasks 1-2 could not self-verify — it has no local `node_modules` and the shared dev server only serves the main checkout's source). Both previously-failing specs then passed.
- **Task 3 — full regen:** Ran the full bilingual regen with both fixes in effect: `TUTORIAL_LOCALE=es-MX npm run tutorial-videos:record` (25/25 passed), `TUTORIAL_LOCALE=en-US npm run tutorial-videos:record` (25/25 passed), `npm run tutorial-videos:convert` (50 converted). Fleet-wide duration went from 1226.96s (pre-fix baseline) to 1900.48s (+673.52s, +55%), confirming the pacing fix applies across the whole 50-file deliverable, not just the one spec proven in Task 2.

## Task Commits

1. **Task 1: Add native per-action pacing via launchOptions.slowMo** — `9ce4d28` (authored in worktree `agent-a4de0c4717c26ef9d`, cherry-picked onto main as `d1e646c`)
2. **Task 2: Prove the fix on one spec** — no commit (generated output only, gitignored)
3. **Task 3: toast-duration fix + full bilingual regen** — `6dda875` (fix, authored+verified directly on main checkout per the dev-server constraint above); regen output is generated/gitignored, no commit

## Files Created/Modified

- `playwright.tutorial.config.ts` — `use.launchOptions.slowMo: 600` (Task 1)
- `src/features/process-refund/ui/RefundSheet.tsx` — refund-processed toast `duration: 8000` (Task 3 fix)
- `src/features/export-report/model/useExportReport.ts` — export-success toast `duration: 8000` (Task 3 fix)

## Deviations from Plan

### Rule 4 escalation — full regen initially blocked by a slowMo-exposed toast-dismissal race in 3/25 specs

Found during Task 3's first es-MX record attempt (in the worktree, before the fix). Root cause, the 3 candidate fixes considered, and why none was auto-selected are documented in the git history of this file (see commit `40689d7` on branch `worktree-agent-a4de0c4717c26ef9d` for the original diagnosis writeup) and summarized above. The orchestrator presented all 4 options to the user via checkpoint; the user selected Candidate Fix A (extend toast duration). No `*.spec.ts` file under `e2e/tutorials/` was modified — the fix is app-code only, consistent with this plan's own guardrail.

### Worktree isolation could not complete this plan end-to-end

The worktree that ran Tasks 1-2 (`agent-a4de0c4717c26ef9d`) could not verify the Task 3 toast-duration fix because (a) it has no local `node_modules`, and (b) the tutorial harness's `:1520` dev server (`reuseExistingServer: true`) is an externally-managed process that only serves the main checkout's source — edits made inside any worktree never reach it. The toast-duration fix and the full Task 3 regen were therefore completed directly on the main checkout by the orchestrator after the user's decision, rather than by a second worktree-isolated executor. This is a durable environmental constraint of this specific harness (shared long-lived dev server + generated deliverables that must land in the real checkout, not a disposable worktree), not a one-off shortcut — worth noting for any future phase-34-style video-generation plan.

## Issues Encountered

None beyond the diagnosed and resolved toast-duration race above.

## User Setup Required / Decision Needed

None — the decision checkpoint from the partial run was resolved (user approved Candidate Fix A) and the plan is now complete.

## Next Phase Readiness

- Ready. UAT gap G-34-1 is closed: every recorded click/fill across all 50 tutorial videos is individually visible on playback via `slowMo: 600`, and the regression it exposed is fixed.
- `.planning/WINDOWS.md`: not updated by this plan (no stub/skipped-test/unrun-verify entries apply).

---
*Phase: 34-tutorial-video-generation*
*Status: complete*

## Self-Check: PASSED

`playwright.tutorial.config.ts`'s `use.launchOptions.slowMo: 600` confirmed present on disk (commit `d1e646c`); toast-duration fix confirmed present on disk (commit `6dda875`); `tutorial-videos/**/*.mp4` confirmed to contain exactly 50 non-empty files (25 es-MX + 25 en-US); `e2e-results-tutorials/raw/**/*.webm` confirmed to contain exactly 50 files; fleet-wide duration confirmed increased from 1226.96s to 1900.48s.
