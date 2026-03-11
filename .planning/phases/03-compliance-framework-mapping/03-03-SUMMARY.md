---
phase: 03-compliance-framework-mapping
plan: 03
subsystem: audit
tags: [nist-csf, csf-2.0, evaluators, vitest, typescript]

# Dependency graph
requires:
  - phase: 03-compliance-framework-mapping
    provides: Extended ControlDefinition with nistCsf field, EvaluatorFn pattern, AuditFacts type
provides:
  - 19 NIST CSF 2.0 evaluator functions across 6 CSF functions (PR/DE/ID/RS/GV/RC)
  - NIST_CSF_CONTROLS registry with 19 entries, product='CSF'
  - nistCsfEvaluators Map for control ID lookup
  - Barrel export via evaluators/nist-csf/index.ts
affects: [03-04, audit-runner-pipeline, frontend-compliance-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns: [per-function evaluator file organization, CSF control ID format NIST.CSF.{fn}.{cat}-{num}v1, advisory evaluator for non-Graph-auditable controls]

key-files:
  created:
    - packages/audit/src/evaluators/nist-csf/protect.ts
    - packages/audit/src/evaluators/nist-csf/detect.ts
    - packages/audit/src/evaluators/nist-csf/identify.ts
    - packages/audit/src/evaluators/nist-csf/respond.ts
    - packages/audit/src/evaluators/nist-csf/govern.ts
    - packages/audit/src/evaluators/nist-csf/recover.ts
    - packages/audit/src/evaluators/nist-csf/index.ts
    - packages/audit/src/registry/nist-csf-controls.ts
    - packages/audit/src/__tests__/csf-evaluators.test.ts
  modified: []

key-decisions:
  - "GV.OC-1 and RC.RP-1 return advisory 'warn' because organizational governance and recovery planning are not auditable via Graph API"
  - "CSF control IDs follow NIST.CSF.{function}.{category}-{number}v1 format for consistency with ZTA NIST.ZTA.T{n}.{m}v1 pattern"
  - "Severity mapping: High for PR and DE evaluators, Medium for ID and RS, Low for GV and RC"
  - "Telemetry source count (5 boolean flags on licenses) used for both PR.IR-1 and DE.AE-3 with different thresholds"

patterns-established:
  - "Per-function evaluator file organization: one file per CSF function under evaluators/nist-csf/"
  - "Advisory evaluator pattern: return 'warn' with explanation for controls not auditable via Graph API (GV.OC-1, RC.RP-1)"
  - "CSF severity tiers: High for Protect/Detect (active security), Medium for Identify/Respond (operational), Low for Govern/Recover (advisory)"

requirements-completed: [FRAME-04]

# Metrics
duration: 5min
completed: 2026-03-11
---

# Phase 3 Plan 03: NIST CSF 2.0 Evaluators Summary

**19 independent CSF 2.0 evaluators across 6 functions (Protect/Detect/Identify/Respond/Govern/Recover) with control registry and 65 passing tests**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-11T20:00:14Z
- **Completed:** 2026-03-11T20:05:30Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 9

## Accomplishments
- Created 19 independent NIST CSF 2.0 evaluators with own pass/fail logic (not derived from CISA/ZTA)
- Built NIST_CSF_CONTROLS registry with 19 entries covering all 6 CSF functions
- 65 tests passing covering pass, fail/warn, and unavailable scenarios for every evaluator
- Advisory evaluators for GV and RC functions (not auditable via Graph API)

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing tests for 19 evaluators** - `bdd4ed2` (test)
2. **Task 1 GREEN: 19 evaluators + registry** - `ee231f7` (feat)

## Files Created/Modified
- `packages/audit/src/evaluators/nist-csf/protect.ts` - 7 Protect evaluators (PR.AA-1/3/5, PR.DS-1/2, PR.PS-1, PR.IR-1)
- `packages/audit/src/evaluators/nist-csf/detect.ts` - 5 Detect evaluators (DE.CM-1/3/6, DE.AE-2/3)
- `packages/audit/src/evaluators/nist-csf/identify.ts` - 3 Identify evaluators (ID.AM-1/2, ID.RA-1)
- `packages/audit/src/evaluators/nist-csf/respond.ts` - 2 Respond evaluators (RS.MA-1, RS.AN-1)
- `packages/audit/src/evaluators/nist-csf/govern.ts` - 1 Govern advisory evaluator (GV.OC-1)
- `packages/audit/src/evaluators/nist-csf/recover.ts` - 1 Recover advisory evaluator (RC.RP-1)
- `packages/audit/src/evaluators/nist-csf/index.ts` - Barrel export + nistCsfEvaluators Map
- `packages/audit/src/registry/nist-csf-controls.ts` - 19 CSF control definitions
- `packages/audit/src/__tests__/csf-evaluators.test.ts` - 65 test cases

## Decisions Made
- GV.OC-1 (Organizational Context) and RC.RP-1 (Recovery Planning) return advisory 'warn' because organizational governance and recovery planning are not auditable via Microsoft Graph API
- CSF control IDs use `NIST.CSF.{function}.{category}-{number}v1` format (e.g., `NIST.CSF.PR.AA-1v1`) for consistency with ZTA `NIST.ZTA.T{n}.{m}v1` pattern
- Severity tiers: High for PR and DE (active security controls), Medium for ID and RS (operational), Low for GV and RC (advisory only)
- Telemetry source counting (licenses.hasQualifyingSku/hasP2/hasIntune/hasDefenderO365/hasDefenderEndpt) reused across PR.IR-1 and DE.AE-3 with independent thresholds (5+ pass vs 3-4 warn vs <3 fail for correlation)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- NIST_CSF_CONTROLS ready to be added to ALL_CONTROLS in control-registry.ts (deferred to pipeline integration plan 03-04)
- nistCsfEvaluators Map available for direct control ID lookup
- All 6 CSF functions covered: PR (7), DE (5), ID (3), RS (2), GV (1), RC (1) = 19 total

## Self-Check: PASSED

- 9/9 files FOUND
- 2/2 commits FOUND (bdd4ed2, ee231f7)
- 65/65 tests passing
- TypeScript compiles cleanly (no new errors in CSF files)

---
*Phase: 03-compliance-framework-mapping*
*Completed: 2026-03-11*
