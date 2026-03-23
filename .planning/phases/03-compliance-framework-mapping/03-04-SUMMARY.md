---
phase: 03-compliance-framework-mapping
plan: 04
subsystem: audit
tags: [maturity-scoring, severity-weights, framework-scores, control-registry, audit-pipeline]

# Dependency graph
requires:
  - phase: 03-compliance-framework-mapping (plans 01-03)
    provides: ZTA, 800-53, CSF control registries with evaluators
  - phase: 02-core-audit-engine
    provides: audit pipeline, audit-runner, fact collector, DB schema
provides:
  - Severity-weighted maturity calculator (per-tenet + overall)
  - computeFrameworkScores helper for per-framework compliance scores
  - Unified ALL_CONTROLS registry (101 controls across 4 frameworks)
  - Pipeline maturity snapshot persistence in maturityScores table
  - Cross-reference fields (nistCsf, nist800207Tenet) in audit findings
affects: [phase-04-dashboard, phase-06-trending, api-routes]

# Tech tracking
tech-stack:
  added: []
  patterns: [severity-weighted-scoring, maturity-levels, framework-score-aggregation]

key-files:
  created:
    - packages/audit/src/pipeline/maturity-calculator.ts
    - packages/audit/src/__tests__/maturity-calculator.test.ts
    - packages/audit/src/__tests__/score-computation.test.ts
  modified:
    - packages/audit/src/registry/control-registry.ts
    - packages/audit/src/pipeline/audit-runner.ts
    - packages/audit/src/index.ts
    - packages/audit/src/__tests__/control-registry.test.ts
    - apps/api/src/routes/audits.ts

key-decisions:
  - "Maturity levels: Traditional <40, Initial 40-69, Advanced 70-89, Optimal >=90 (configurable thresholds)"
  - "Severity weights: Critical=4, High=3, Medium=2, Low=1 for weighted pass rate calculation"
  - "warn and na findings excluded from pass/fail maturity counts (only pass/fail are scorable)"
  - "Overall maturity = average of per-tenet weighted pass rates (not global weighted average)"
  - "Framework scores use pass/(pass+fail)*100 (warn/na excluded from denominator)"

patterns-established:
  - "MaturitySnapshot pattern: per-tenet array + overall + weakestTenet identification"
  - "FrameworkScore pattern: total/pass/fail/warn/na/score per product grouping"
  - "getAllControls() as single source of truth for pipeline control count"

requirements-completed: [FRAME-05, FRAME-06]

# Metrics
duration: 8min
completed: 2026-03-11
---

# Phase 3 Plan 4: Maturity Calculator & Unified Registry Summary

**Severity-weighted maturity calculator (C=4/H=3/M=2/L=1) with 101-control unified registry and pipeline maturity persistence**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-11T20:08:52Z
- **Completed:** 2026-03-11T20:17:48Z
- **Tasks:** 2 (Task 1 TDD, Task 2 auto)
- **Files modified:** 8

## Accomplishments
- Maturity calculator with configurable severity-weighted scoring per ZTA tenet (T1-T7)
- computeFrameworkScores helper computing per-framework compliance percentages
- Unified control registry: 29 AAD + 31 ZTA + 22 800-53 + 19 CSF = 101 controls
- Pipeline runs all 101 controls, persists nistCsf/nist800207Tenet cross-references
- Pipeline computes and persists maturity snapshots in maturityScores table after evaluation
- Fixed hardcoded totalChecks: 29 in API audit route to use getAllControls().length

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing tests for maturity calculator** - `ae27fae` (test)
2. **Task 1 GREEN: Maturity calculator implementation** - `5a39b49` (feat)
3. **Task 2: Unified registry + pipeline maturity persistence** - `a46571a` (feat)

## Files Created/Modified
- `packages/audit/src/pipeline/maturity-calculator.ts` - Severity-weighted maturity scoring with per-tenet and overall calculations
- `packages/audit/src/__tests__/maturity-calculator.test.ts` - 24 tests covering boundaries, weighting, edge cases
- `packages/audit/src/__tests__/score-computation.test.ts` - 7 tests for per-framework score computation
- `packages/audit/src/registry/control-registry.ts` - Expanded ALL_CONTROLS to include all 4 frameworks
- `packages/audit/src/pipeline/audit-runner.ts` - Uses getAllControls(), persists cross-refs and maturity
- `packages/audit/src/index.ts` - Exports new registries, maturity types, and functions
- `packages/audit/src/__tests__/control-registry.test.ts` - Updated getAllControls count from 29 to 101
- `apps/api/src/routes/audits.ts` - Uses getAllControls().length instead of hardcoded 29

## Decisions Made
- Maturity levels use configurable thresholds (default: Traditional <40, Initial 40-69, Advanced 70-89, Optimal >=90)
- Severity weights: Critical=4, High=3, Medium=2, Low=1
- warn and na findings excluded from maturity pass/fail counts -- only pass/fail are scorable
- Overall maturity = average of per-tenet weighted pass rates
- Framework scores: score = pass/(pass+fail)*100 per product grouping

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated control-registry test from 29 to 101**
- **Found during:** Task 2 (Unified registry wiring)
- **Issue:** Existing control-registry.test.ts expected getAllControls() to return 29; now returns 101
- **Fix:** Updated test assertion to expect 101 controls
- **Files modified:** packages/audit/src/__tests__/control-registry.test.ts
- **Verification:** All 392 tests pass
- **Committed in:** a46571a (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Necessary test update for correctness after registry expansion. No scope creep.

## Issues Encountered
- Pre-existing TypeScript errors in audit-runner.ts (db.update/insert on { db, pool } return type, closeTenantDb signature mismatch) -- these existed before this plan's changes and are not introduced by this work. Documented as out-of-scope per deviation rules.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 4 framework registries unified in getAllControls() -- ready for dashboard rendering
- Maturity snapshots persisted per audit run -- ready for Phase 6 historical trending
- computeFrameworkScores available for dashboard framework compliance widgets
- Plan 05 (final integration/validation) can proceed

## Self-Check: PASSED

All 8 created/modified files verified present. All 3 task commits (ae27fae, 5a39b49, a46571a) verified in git log. 392 tests pass.

---
*Phase: 03-compliance-framework-mapping*
*Completed: 2026-03-11*
