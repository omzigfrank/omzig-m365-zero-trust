---
phase: 03-compliance-framework-mapping
plan: 01
subsystem: audit
tags: [nist-800-207, zero-trust, evaluators, drizzle, vitest, typescript]

# Dependency graph
requires:
  - phase: 02-core-audit-engine
    provides: AuditFacts type (15 areas), EvaluatorFn pattern, ControlDefinition type, control registry, auditFindings table
provides:
  - Extended ControlDefinition with nistCsf and nist800207Tenet optional fields
  - Extended auditFindings table with nist_csf and nist_800_207_tenet columns
  - New maturityScores table for per-tenet maturity snapshot persistence
  - 31 NIST 800-207 ZTA evaluator functions covering all 7 tenets
  - NIST_ZTA_CONTROLS registry (31 entries, product='ZTA')
  - ztaEvaluators Map for control ID lookup
affects: [03-02, 03-03, 03-04, audit-runner-pipeline, frontend-compliance-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns: [per-tenet evaluator file organization, ZTA control ID format NIST.ZTA.T{n}.{m}v1, advisory evaluator for unavailable facts]

key-files:
  created:
    - packages/audit/src/evaluators/nist-zta/tenet-1-resources.ts
    - packages/audit/src/evaluators/nist-zta/tenet-2-communication.ts
    - packages/audit/src/evaluators/nist-zta/tenet-3-per-session.ts
    - packages/audit/src/evaluators/nist-zta/tenet-4-dynamic-policy.ts
    - packages/audit/src/evaluators/nist-zta/tenet-5-monitoring.ts
    - packages/audit/src/evaluators/nist-zta/tenet-6-authentication.ts
    - packages/audit/src/evaluators/nist-zta/tenet-7-improvement.ts
    - packages/audit/src/evaluators/nist-zta/index.ts
    - packages/audit/src/registry/nist-zta-controls.ts
    - packages/audit/src/__tests__/zta-evaluators.test.ts
  modified:
    - packages/audit/src/types.ts
    - packages/db/src/tenant/schema.ts
    - packages/db/src/index.ts

key-decisions:
  - "T6.3 emergency access returns advisory 'warn' because break-glass group data is not available in AuditFacts"
  - "T4.4 uses type assertion (conditions as Record) for untyped applications field on CA policy conditions"
  - "ZTA control IDs follow NIST.ZTA.T{tenet}.{check}v1 format for consistency with existing MS.AAD.{family}.{check}v1 pattern"
  - "New auditFindings columns (nist_csf, nist_800_207_tenet) are nullable to preserve existing rows"

patterns-established:
  - "Per-tenet evaluator file organization: one file per NIST 800-207 tenet under evaluators/nist-zta/"
  - "Advisory evaluator pattern: return 'warn' with explanation when required facts are structurally unavailable"
  - "ZTA control severity mapping: Critical for risk-based/MFA/legacy-auth, High for T1.x/T4.x/T6.x, Medium for T2.x/T3.x/T5.x/T7.x"

requirements-completed: [FRAME-02]

# Metrics
duration: 10min
completed: 2026-03-11
---

# Phase 3 Plan 01: NIST 800-207 ZTA Evaluators Summary

**31 ZTA evaluators ported from PowerShell covering all 7 NIST 800-207 tenets with extended ControlDefinition type, new maturityScores DB table, and 104 passing tests**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-11T19:45:34Z
- **Completed:** 2026-03-11T19:55:38Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Extended ControlDefinition with optional nistCsf and nist800207Tenet fields for multi-framework cross-referencing
- Created maturityScores DB table for persisting severity-weighted maturity snapshots per audit run
- Ported all 31 NIST 800-207 ZTA checks from PowerShell NistEvaluatorRegistry.ps1 to TypeScript pure functions
- Created NIST_ZTA_CONTROLS registry with 31 entries covering all 7 tenets (T1-T7)
- 104 tests passing covering pass, fail/warn, and unavailable cases for every evaluator

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend types and DB schema** - `ce0a58f` (feat)
2. **Task 2 RED: Failing tests** - `210747a` (test)
3. **Task 2 GREEN: Evaluators + registry** - `e6c7d1a` (feat)

## Files Created/Modified
- `packages/audit/src/types.ts` - Added nistCsf? and nist800207Tenet? to ControlDefinition
- `packages/db/src/tenant/schema.ts` - Added nist_csf, nist_800_207_tenet columns + maturityScores table
- `packages/db/src/index.ts` - Export maturityScores from package
- `packages/audit/src/evaluators/nist-zta/tenet-1-resources.ts` - T1.1-T1.4 (device, app, data, domain inventory)
- `packages/audit/src/evaluators/nist-zta/tenet-2-communication.ts` - T2.1-T2.4 (legacy auth, security baseline, trust, modern auth)
- `packages/audit/src/evaluators/nist-zta/tenet-3-per-session.ts` - T3.1-T3.2 (per-session eval, session controls)
- `packages/audit/src/evaluators/nist-zta/tenet-4-dynamic-policy.ts` - T4.1-T4.6 (risk, compliance, location, app-specific, MFA, admin)
- `packages/audit/src/evaluators/nist-zta/tenet-5-monitoring.ts` - T5.1-T5.4 (audit logging, endpoint, email, telemetry)
- `packages/audit/src/evaluators/nist-zta/tenet-6-authentication.ts` - T6.1-T6.7 (MFA, admin count, break-glass, auth methods, PIM, consent)
- `packages/audit/src/evaluators/nist-zta/tenet-7-improvement.ts` - T7.1-T7.4 (P2 licensing, guest, app reg, password policy)
- `packages/audit/src/evaluators/nist-zta/index.ts` - Barrel export + ztaEvaluators Map
- `packages/audit/src/registry/nist-zta-controls.ts` - 31 ZTA control definitions
- `packages/audit/src/__tests__/zta-evaluators.test.ts` - 104 test cases

## Decisions Made
- T6.3 (Emergency Access) returns advisory 'warn' because AuditFacts does not include break-glass group data -- per PITFALL 5 from research
- T4.4 (Application-Specific Policies) uses `(conditions as Record<string, unknown>)` type assertion because the CA policy conditions type does not include the `applications` field that Graph API returns
- ZTA control IDs use `NIST.ZTA.T{tenet}.{check}v1` format for consistency with existing CISA `MS.AAD.{family}.{check}v1` convention
- All new auditFindings columns are nullable by default (drizzle varchar without .notNull()) to avoid breaking existing rows

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- ControlDefinition extended and ready for Plans 02 (NIST 800-53) and 03 (NIST CSF 2.0) to add their own evaluators
- maturityScores table ready for maturity calculator to persist snapshots
- NIST_ZTA_CONTROLS ready to be added to ALL_CONTROLS in control-registry.ts (deferred to pipeline integration plan)
- auditFindings schema extended for cross-framework columns

## Self-Check: PASSED

- 13/13 files FOUND
- 3/3 commits FOUND (ce0a58f, 210747a, e6c7d1a)
- 104/104 tests passing
- TypeScript compiles cleanly (no new errors)

---
*Phase: 03-compliance-framework-mapping*
*Completed: 2026-03-11*
