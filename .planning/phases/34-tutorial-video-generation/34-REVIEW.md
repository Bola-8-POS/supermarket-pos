---
phase: 34-tutorial-video-generation
reviewed: 2026-09-17T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - playwright.tutorial.config.ts
  - src/features/process-refund/ui/RefundSheet.tsx
  - src/features/export-report/model/useExportReport.ts
findings:
  critical: 0
  warning: 1
  info: 1
  total: 2
status: issues_found
---

# Phase 34: Code Review Report

**Reviewed:** 2026-09-17
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Re-review scoped to gap-closure plan 34-07 only: commit `d1e646c` (adds
`launchOptions.slowMo: 600` to `playwright.tutorial.config.ts`) and commit
`6dda875` (extends the refund and CSV-export success-toast `duration` to
`8000` in `RefundSheet.tsx` / `useExportReport.ts`). Diffs were pulled
directly via `git show` for both commits to confirm exactly what changed.

**`slowMo` scoping — confirmed safe, no issue.** `playwright.tutorial.config.ts`
is only wired to the `tutorial-videos:record` npm script
(`playwright test --config=playwright.tutorial.config.ts`). `npm run test:e2e`
(CI-critical suite) uses `playwright.config.ts`, which has its own
independent `slowMo` (`fastE2e ? 0 : 400`) untouched by this change. There is
no shared import or config inheritance between the two files, so `slowMo: 600`
cannot leak into CI or into the app's production build. The comment added at
lines 46-51 correctly documents why native `slowMo` is needed in addition to
`pacing.ts`'s `resolveHoldMs` (which only paces *between* `narrate()` blocks,
never the raw `.click()`/`.fill()` calls bundled inside one). No functional
issue found in this part of the diff.

**Toast-duration fix — correctly and narrowly scoped, but has an
undocumented production side effect.** Both edits touch exactly the one
`toast.success(...)` call each file's diff hunk shows (`RefundSheet.tsx:174-179`,
`useExportReport.ts:527`); no other toast call in either file was touched,
and the sibling `toast.error(...)` paths (`RefundSheet.tsx:171`,
`useExportReport.ts:532`) correctly remain untouched since the tutorial specs
only exercise the happy path for these two flows. A repo-wide grep confirms
these are the *only two* `toast.success`/`toast.error` call sites in the
entire `src/` tree that pass an explicit `duration` option — see WR-01 below
for why that matters.

## Warnings

### WR-01: Test-pacing fix silently doubles a real-user-facing toast duration, with no comment tying the magic number to its cause

**File:** `src/features/process-refund/ui/RefundSheet.tsx:178`
**File:** `src/features/export-report/model/useExportReport.ts:527`
**Issue:** The fix changes production UX for every real cashier/admin, not
just the tutorial-recording pipeline: the refund-processed and CSV-export
success toasts now stay on screen for 8000ms instead of Sonner's default
~4000ms, for every store using the app, forever — not only during
`tutorial-videos:record`. That's a legitimate way to close the race (the plan
doc/commit message explains it clearly), but the *source files themselves*
carry zero indication of why `duration: 8000` was chosen or that it exists to
satisfy a test-harness timing constraint (`e2e/tutorials/pacing.ts`'s
`resolveHoldMs` 3000ms hold + slowMo-paced narrate-block overhead landing
~4.4s after the toast fires). The only place this reasoning is recorded is
the `6dda875` commit message. A future maintainer editing either toast call
(e.g. localizing copy, adjusting the refund flow) has no signal that
"cleaning up" the seemingly arbitrary `duration: 8000` back to the default
would silently reopen UAT gap G-34-1 the next time tutorial videos are
regenerated — and no test in the default `npm run test`/`npm run test:e2e`
run would catch that regression, since the affected specs live under the
separate, non-CI `e2e/tutorials/` suite. It also makes these two toasts
behave inconsistently with every other toast in the app (confirmed via grep:
no other `toast.success`/`toast.error` call anywhere in `src/` passes a
`duration` override) with no accompanying product decision recorded
(`.planning/decisions/`) that 8s is now the intended UX for financial-impact
confirmations.
**Fix:** Add a one-line comment at each call site tying the literal to its
cause, e.g.:
```ts
// duration: 8000 (default is ~4000) — keeps this toast visible long enough
// to survive tutorial-video slowMo pacing (playwright.tutorial.config.ts);
// see UAT gap G-34-1. Do not revert to the default without re-running
// `npm run tutorial-videos:record`'s refund/export specs.
toast.success(t('processRefund.refundProcessed', { amount: ... }), { duration: 8000 });
```
Optionally hoist the value into a single shared named constant (e.g.
`TOAST_DURATION_TUTORIAL_SAFE_MS` in `@shared/lib`) so both call sites stay
in sync and a grep for the constant name surfaces both usages together.

## Info

### IN-01: `8000` is a duplicated magic number across two files

**File:** `src/features/process-refund/ui/RefundSheet.tsx:178`
**File:** `src/features/export-report/model/useExportReport.ts:527`
**Issue:** The same literal `8000` is repeated in two unrelated feature
folders with no shared constant. Minor duplication; if a third toast ever
needs the same treatment (or these two values ever need to move together,
e.g. if a future `slowMo` bump in `playwright.tutorial.config.ts` requires a
larger margin again), there's nothing enforcing they stay equal.
**Fix:** Same remedy as WR-01 — a shared exported constant removes the
duplication and gives both call sites a single point of change.

---

_Reviewed: 2026-09-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
