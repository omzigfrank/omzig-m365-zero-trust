---
phase: 03-compliance-framework-mapping
plan: 02
subsystem: audit
tags: [nist-800-53, evaluators, access-control, audit, risk-assessment, vitest, typescript]

# Dependency graph
requires:
  - phase: 02-core-audit-engine
    provides: AuditFacts type (15 areas), EvaluatorFn pattern, ControlDefinition type
  - phase: 03-compliance-framework-mapping
    provides: Extended ControlDefinition with nistCsf and nist800207Tenet optional fields
provides:
  - 22 independent NIST 800-53 evaluator functions across 7 control families
  - NIST_80053_CONTROLS registry (22 entries, product='80053')
  - nist80053Evaluators Map for control ID lookup
affects: [03-03, 03-04, audit-runner-pipeline, frontend-compliance-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns: [per-family evaluator file organization, 800-53 control ID format NIST.80053.XX-Nv1, independent evaluator logic per control]

key-files:
  created:
    - packages/audit/src/evaluators/nist-80053/ac-access-control.ts
    - packages/audit/src/evaluators/nist-80053/ia-identification.ts
    - packages/audit/src/evaluators/nist-80053/sc-system-comms.ts
    - packages/audit/src/evaluators/nist-80053/au-audit.ts
    - packages/audit/src/evaluators/nist-80053/cm-configuration.ts
    - packages/audit/src/evaluators/nist-80053/si-system-integrity.ts
    - packages/audit/src/evaluators/nist-80053/ra-risk-assessment.ts
    - packages/audit/src/evaluators/nist-80053/index.ts
    - packages/audit/src/registry/nist-80053-controls.ts
    - packages/audit/src/__tests__/nist-80053-evaluators.test.ts
  modified: []

key-decisions:
  - "800-53 evaluators are fully independent from CISA SCuBA evaluators per user locked decision"
  - "AU-12 counts 15 AuditFacts areas as telemetry sources for audit generation coverage"
  - "Control IDs follow NIST.80053.{family}-{number}v1 format (e.g., NIST.80053.AC-2v1)"
  - "nistCsf cross-reference: AC/IA/SC/CM map to PR (Protect), AU/SI map to DE (Detect), CM-8/RA map to ID (Identify)"

patterns-established:
  - "Per-family evaluator file organization: one file per 800-53 control family under evaluators/nist-80053/"
  - "Severity mapping: Critical for AC-7/AC-17/IA-2 (risk-based/MFA controls), High for AC-2/AC-3/AC-6/AU-2/CM-7/SC-7, Medium for the rest"
  - "800-53 evaluators use the same EvaluatorFn signature and return settingName for every result"

requirements-completed: [FRAME-03]

# Metrics
duration: 6min
completed: 2026-03-11
---

# Phase 3 Plan 02: NIST 800-53 Evaluators Summary

**22 independent 800-53 evaluators across 7 control families (AC, IA, SC, AU, CM, SI, RA) with control registry and 75 passing unit tests**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-11T20:00:03Z
- **Completed:** 2026-03-11T20:06:10Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 10

## Accomplishments
- Created 22 NIST 800-53 evaluators with independent pass/fail logic (not derived from CISA results)
- Built NIST_80053_CONTROLS registry with 22 entries covering 7 families, all with product='80053'
- Created nist80053Evaluators Map for efficient control ID lookup
- 75 unit tests passing covering pass, fail/warn, and unavailable (na) scenarios for all evaluators

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing tests for 22 evaluators** - `83d0daa` (test)
2. **Task 1 GREEN: 22 evaluators, registry, and barrel export** - `22cd607` (feat)

## Files Created/Modified
- `packages/audit/src/evaluators/nist-80053/ac-access-control.ts` - AC-2, AC-3, AC-6, AC-7, AC-11, AC-17
- `packages/audit/src/evaluators/nist-80053/ia-identification.ts` - IA-2, IA-5, IA-8
- `packages/audit/src/evaluators/nist-80053/sc-system-comms.ts` - SC-7, SC-8, SC-13
- `packages/audit/src/evaluators/nist-80053/au-audit.ts` - AU-2, AU-6, AU-12
- `packages/audit/src/evaluators/nist-80053/cm-configuration.ts` - CM-6, CM-7, CM-8
- `packages/audit/src/evaluators/nist-80053/si-system-integrity.ts` - SI-2, SI-3, SI-4
- `packages/audit/src/evaluators/nist-80053/ra-risk-assessment.ts` - RA-5
- `packages/audit/src/evaluators/nist-80053/index.ts` - Barrel export + nist80053Evaluators Map
- `packages/audit/src/registry/nist-80053-controls.ts` - 22 control definitions
- `packages/audit/src/__tests__/nist-80053-evaluators.test.ts` - 75 test cases

## Decisions Made
- All 800-53 evaluators are fully independent from CISA SCuBA evaluators per user locked decision -- each evaluator inspects AuditFacts directly with its own thresholds
- AU-12 (Audit Generation) counts 15 AuditFacts areas as distinct telemetry sources; pass at >= 5, warn at 3-4, fail at < 3
- Control IDs follow `NIST.80053.{family}-{number}v1` format consistent with existing `NIST.ZTA.T{n}.{m}v1` and `MS.AAD.{family}.{check}v1` conventions
- nistCsf cross-references: AC/IA/SC/CM -> PR (Protect); AU/SI -> DE (Detect); CM-8/RA -> ID (Identify)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed AU-12 test to use specialized facts for low-telemetry scenario**
- **Found during:** Task 1 GREEN (test verification)
- **Issue:** `createFailingFacts()` sets all 15 areas `.available = true` so AU-12 always counted 15 sources, never triggering fail
- **Fix:** AU-12 fail test uses `createEmptyFacts()` with only 2 sources set available; added warn test with 3 sources
- **Files modified:** `packages/audit/src/__tests__/nist-80053-evaluators.test.ts`
- **Verification:** All 75 tests pass including fail and warn scenarios for AU-12
- **Committed in:** 22cd607

---

**Total deviations:** 1 auto-fixed (1 bug in test data)
**Impact on plan:** Test data fix necessary for correctness. No scope creep.

## Issues Encountered

None beyond the AU-12 test data issue documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- NIST_80053_CONTROLS ready to be added to ALL_CONTROLS in control-registry.ts (deferred to pipeline integration plan)
- nist80053Evaluators Map available for audit runner to execute 800-53 checks
- Pattern established for Plan 03 (NIST CSF 2.0) to follow same per-family structure
- All 7 control families covered: AC (6), IA (3), SC (3), AU (3), CM (3), SI (3), RA (1)

## Self-Check: PASSED

- 10/10 files FOUND
- 2/2 commits FOUND (83d0daa, 22cd607)
- 75/75 tests passing
- TypeScript compiles cleanly (no new errors)

---
*Phase: 03-compliance-framework-mapping*
*Completed: 2026-03-11*
