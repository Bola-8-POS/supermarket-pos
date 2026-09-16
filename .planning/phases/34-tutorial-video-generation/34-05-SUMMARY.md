---
phase: 34-tutorial-video-generation
plan: 05
subsystem: testing
tags: [playwright, e2e, video-recording, i18n, settings, audit]

# Dependency graph
requires:
  - phase: 34-tutorial-video-generation
    provides: "e2e/tutorials/{pacing,i18n-selectors,locale,fixtures}.ts, playwright.tutorial.config.ts, the checkout.spec.ts reference tracer (34-01)"
provides:
  - "e2e/tutorials/settings/settings.spec.ts — real Settings -> Language self-service switch (es-MX -> en-US -> es-MX) and the unsaved-changes Save/Discard guard, both driven through the real UI (no seedStaffLocale shortcut)"
  - "e2e/tutorials/audit/audit.spec.ts — admin reviews the audit log and opens a diff sheet after a real payment.process entry, then narrows results with a date-range filter"
  - "Completes VIDEO-02's full 12-domain tutorial-video coverage (final 2 of 12, alongside 34-02/34-03/34-04)"
affects: [34-06]

# Actuals (#2632)
actuals:
  tokens: 2966
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Real-UI locale switch as tutorial content (settings.spec.ts) vs. the DB-seeded seedStaffLocale() shortcut every other domain uses -- the one deliberate exception in this phase"
    - "beforeEach-produces-its-own-fixture-data pattern for audit: unnarrated cash-sale checkout inside beforeEach to guarantee a real payment.process row exists before the narrated portion clicks into it"

key-files:
  created:
    - e2e/tutorials/settings/settings.spec.ts
    - e2e/tutorials/audit/audit.spec.ts
  modified: []

key-decisions:
  - "settings.spec.ts Test 1 force-establishes a known es-MX baseline via an unnarrated switchOwnLocale() call before the narrated demo -- resetTestState() re-pins the shared admin account to en-US on every reset, so without this the narrated es-MX -> en-US -> es-MX flow would start from a locale-dependent (and misleading) state"
  - "settings.spec.ts Test 2 deliberately skips resetTestState() in its own setup -- that call would re-pin admin back to en-US and undo Test 1's deliberate es-MX end state; playwright.tutorial.config.ts runs this file single-worker/non-parallel so Test 1 always finishes first, making this safe"
  - "audit.spec.ts seeds locale for BOTH the cashier (unnarrated checkout setup) and admin (narrated portion) accounts, since resetTestState() pins both to en-US and this domain follows the standard DB-seeded pattern (unlike settings.spec.ts)"

patterns-established: []

requirements-completed: [VIDEO-02, VIDEO-04, VIDEO-06]

coverage:
  - id: D1
    description: "Settings tutorial: real Settings -> Language self-service switch (es-MX -> en-US -> es-MX) narrated end-to-end, plus the unsaved-changes Save/Discard guard on a dirty tab"
    requirement: "VIDEO-02"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/tutorials/settings --config=playwright.tutorial.config.ts — 2 passed (~25-28s each)"
        status: pass
      - kind: other
        ref: "e2e-results-tutorials/raw/settings/*.webm — 2 non-empty files (1.9MB, 2.0MB)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Audit tutorial: admin reviews the audit log, opens a diff sheet on a real payment.process entry, and narrows results with a date-range filter"
    requirement: "VIDEO-02"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/tutorials/audit --config=playwright.tutorial.config.ts — 2 passed (~27-35s each)"
        status: pass
      - kind: other
        ref: "e2e-results-tutorials/raw/audit/*.webm — 2 non-empty files (2.0MB, 3.0MB)"
        status: pass
    human_judgment: false

duration: 30min
completed: 2026-09-16
status: complete
---

# Phase 34 Plan 05: Settings + Audit Tutorial Videos Summary

**Two final per-domain tutorial recordings completing VIDEO-02's 12-domain set — settings.spec.ts drives the real Settings -> Language self-service switch (the one domain whose content IS the bilingual mechanism itself, not a DB-seeded shortcut), audit.spec.ts follows the standard pattern to record a payment.process audit entry, diff sheet, and date-range filter.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-09-16T13:44:00Z (approx.)
- **Completed:** 2026-09-16T13:49:32-06:00
- **Tasks:** 2
- **Files modified:** 2 (both new)

## Accomplishments
- `e2e/tutorials/settings/settings.spec.ts` — Test 1 demonstrates the real Settings -> Language `<select>`, narrating the heading/tab text re-rendering live in the new language with no page reload, round-tripping es-MX -> en-US -> es-MX; Test 2 demonstrates the unsaved-changes Save/Discard/Cancel confirmation dialog when leaving a dirty settings tab
- `e2e/tutorials/audit/audit.spec.ts` — beforeEach produces a real `payment.process` audit entry via an unnarrated cash-sale checkout, then the narrated portion (as admin) opens the audit log, clicks the entry to open the diff sheet (Before/After panels), and narrows results with a date-range filter that yields "No matches" for a future date
- Both domains verified running together in a single combined Playwright invocation (4/4 passed), confirming no cross-domain state leakage within this plan's specs
- Completes the full 12-domain VIDEO-02 tutorial-video set across Plans 34-01 through 34-05

## Task Commits

Each task was committed atomically:

1. **Task 1: Settings tutorial video (real locale-switch UI, not DB-seeded)** - `46eb836` (feat)
2. **Task 2: Audit tutorial video** - `43805d6` (feat)

## Files Created/Modified
- `e2e/tutorials/settings/settings.spec.ts` - real Settings -> Language switch + unsaved-changes guard, no `../locale` import (deliberate)
- `e2e/tutorials/audit/audit.spec.ts` - audit log review + diff sheet + date-range filter, standard `seedStaffLocale()` pattern

## Decisions Made
- `settings.spec.ts` Test 1 forces a known es-MX baseline (unnarrated) before the narrated demo, since `resetTestState()` always re-pins the shared admin account to en-US — mirrors `e2e/settings/i18n-locale-switch.spec.ts`'s own "force a known baseline" approach.
- `settings.spec.ts` Test 2 intentionally skips its own `resetTestState()` call so it doesn't undo Test 1's es-MX end state; safe because `playwright.tutorial.config.ts` runs the file single-worker/non-parallel, guaranteeing Test 1 completes first.
- `audit.spec.ts` seeds locale for both the cashier (setup) and admin (narrated) accounts, since both are pinned back to en-US by `resetTestState()` and this domain follows the standard DB-seeded pattern from 34-01/34-02/34-03/34-04.
- Locale-safe dual-regex constants for audit-only strings (`Audit Log`/`Registro de auditoría`, `Date from`/`Fecha desde`, `Apply filters`/`Aplicar filtros`, `No matches`/`Sin coincidencias`, `Before`/`Antes`, `After`/`Después`) were looked up directly from `src/shared/lib/i18n/locales/{es-MX,en-US}/{pages,wAdmin,common}.json` rather than guessed, per the plan's LOCALE SAFETY note. The `payment.process` action string itself is a raw, untranslated technical identifier, so it's matched literally in both tests (matching the pre-existing `e2e/audit/audit-logs.spec.ts` pattern).

## Deviations from Plan

None - plan executed exactly as written. Both STOP-AND-ASK thresholds (≤3 debugging attempts) were never approached — all selectors resolved correctly on the first real run once the correct i18n catalog keys were looked up.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. (This worktree's `.env.local` was copied from the main checkout per 34-01-SUMMARY.md's documented gotcha — gitignored, not committed. The local `supabase_edge_runtime_supermarket-pos-selfhosted` Docker container was already running.)

## Next Phase Readiness

- All 12 domains of VIDEO-02's tutorial-video set are now recorded (34-01 through 34-05). Plan 34-06 (per ROADMAP) is expected to cover the full-walkthrough spec and/or final conversion pass.
- No blockers.

---
*Phase: 34-tutorial-video-generation*
*Completed: 2026-09-16*

## Self-Check: PASSED

Both files confirmed present on disk (`e2e/tutorials/settings/settings.spec.ts`, `e2e/tutorials/audit/audit.spec.ts`); both task commits (`46eb836`, `43805d6`) confirmed in `git log`.
