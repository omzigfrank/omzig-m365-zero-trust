---
phase: 02-core-audit-engine
plan: 01
subsystem: audit
tags: [graph-api, cisa-scuba, microsoft-graph-client, vitest, typescript, batch-api]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: monorepo skeleton, @omzig/tsconfig, pnpm workspace
provides:
  - AuditFacts type covering 15 Graph API data areas
  - 29 CISA SCuBA Entra ID control definitions with metadata
  - Graph API fact collector with $batch optimization
  - Graph client factory with delegated token auth
  - Batch helper with per-request error handling
  - 12 area parser functions for Graph API responses
affects: [02-02 audit routes, 02-03 evaluators and runner, 03-compliance-framework]

# Tech tracking
tech-stack:
  added: ["@microsoft/microsoft-graph-client ^3.0.7", "@microsoft/microsoft-graph-types", "@microsoft/microsoft-graph-types-beta"]
  patterns: ["collect-then-evaluate pipeline", "area parser pattern (parseX(data) -> typed facts)", "batch error isolation ($batch outer 200, per-request status check)"]

key-files:
  created:
    - packages/audit/src/types.ts
    - packages/audit/src/registry/entra-id-controls.ts
    - packages/audit/src/registry/control-registry.ts
    - packages/audit/src/collectors/graph-client.ts
    - packages/audit/src/collectors/batch-helper.ts
    - packages/audit/src/collectors/fact-collector.ts
    - packages/audit/src/collectors/areas/organization.ts
    - packages/audit/src/collectors/areas/conditional-access.ts
    - packages/audit/src/collectors/areas/authentication-methods.ts
    - packages/audit/src/collectors/areas/authorization-policy.ts
    - packages/audit/src/collectors/areas/directory-roles.ts
    - packages/audit/src/collectors/areas/security-defaults.ts
    - packages/audit/src/collectors/areas/devices.ts
    - packages/audit/src/collectors/areas/licenses.ts
    - packages/audit/src/collectors/areas/domains.ts
    - packages/audit/src/collectors/areas/pim-roles.ts
    - packages/audit/src/collectors/areas/app-registrations.ts
    - packages/audit/src/collectors/areas/sensitivity-labels.ts
  modified: []

key-decisions:
  - "Area parser pattern: each Graph API data area has a standalone parse function that accepts raw response and returns typed facts with available/error flags"
  - "Batch error isolation: isBatchError() helper checks per-request status within $batch responses, preventing individual failures from crashing the pipeline"
  - "Placeholder evaluators: all 29 controls have placeholder evaluator functions returning 'na' rating -- real evaluators wired in Plan 03"
  - "MFA registration collected as standalone paginated call outside batch (PITFALL 7: pagination unreliable in $batch)"
  - "Sensitivity labels collected via standalone beta call (PITFALL 3: cannot mix v1.0 and beta in same $batch)"
  - "PIM endpoints wrapped in try/catch for P2 licensing requirement (PITFALL 2: 403 on non-P2 tenants)"

patterns-established:
  - "Area parser pattern: parseX(data: unknown) -> TypedFacts with available/error handling"
  - "Batch grouping: independent endpoints in batch 1 (12 requests), dependent in batch 2"
  - "Graceful degradation: each area sets available=false with error message on Graph API failure"
  - "SKU detection: Set-based lookup for license feature flags (P2, Intune, Defender)"

requirements-completed: [AUDIT-02, AUDIT-03, AUDIT-04, AUDIT-06, FRAME-01, AUTH-06]

# Metrics
duration: 10min
completed: 2026-03-11
---

# Phase 2 Plan 01: Audit Package Foundation Summary

**@omzig/audit package with 29 CISA SCuBA Entra ID control definitions, 15-area Graph API fact collector using $batch optimization, and 12 area parser functions with graceful degradation**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-11T14:17:21Z
- **Completed:** 2026-03-11T14:27:25Z
- **Tasks:** 3
- **Files created:** 27

## Accomplishments
- Created @omzig/audit workspace package with complete AuditFacts type covering 15 Graph API data areas (ported from TenantFactCollector.ps1)
- Defined all 29 CISA SCuBA Entra ID controls with id, severity, requirement level, NIST 800-53 cross-reference, and required Graph permissions
- Built collect-then-evaluate pipeline foundation: batch 1 (12 independent endpoints), batch 2 (dependent calls), standalone calls (MFA/PIM/labels)
- 48 unit tests passing covering control registry, area parsers, and fact collector

## Task Commits

Each task was committed atomically:

1. **Task 1: Create audit package with types, control registry, and graph client** - `710ce7e` (feat)
2. **Task 2a: Implement core area collectors** - `5f3ec67` (feat)
3. **Task 2b: Implement extended area collectors and fact collector** - `29c615b` (feat)

_TDD pattern followed: RED (failing tests) -> GREEN (implementation) -> commit for each task_

## Files Created/Modified

### Package Configuration
- `packages/audit/package.json` - @omzig/audit package with Graph SDK dependencies
- `packages/audit/tsconfig.json` - TypeScript config extending @omzig/tsconfig/node.json
- `packages/audit/vitest.config.ts` - Test runner configuration

### Core Types
- `packages/audit/src/types.ts` - AuditFacts (15 areas), EvaluatorResult, EvaluatorFn, ControlDefinition, AuditProgressMessage, createEmptyFacts()
- `packages/audit/src/index.ts` - Public API exports

### Control Registry
- `packages/audit/src/registry/entra-id-controls.ts` - 29 CISA SCuBA Entra ID control definitions
- `packages/audit/src/registry/control-registry.ts` - getControlById, getControlsByProduct, getAllControls

### Graph Client & Batch
- `packages/audit/src/collectors/graph-client.ts` - createGraphClient factory with delegated token auth
- `packages/audit/src/collectors/batch-helper.ts` - executeBatch with per-request error handling, isBatchError helper

### Area Collectors (12 files)
- `packages/audit/src/collectors/areas/organization.ts` - Tenant info from /organization
- `packages/audit/src/collectors/areas/conditional-access.ts` - CA policies with state counting
- `packages/audit/src/collectors/areas/authentication-methods.ts` - Auth methods + MFA registration
- `packages/audit/src/collectors/areas/authorization-policy.ts` - User defaults, guest settings, admin consent
- `packages/audit/src/collectors/areas/directory-roles.ts` - Global admin role ID + member count
- `packages/audit/src/collectors/areas/security-defaults.ts` - Security defaults enforcement state
- `packages/audit/src/collectors/areas/devices.ts` - Managed devices compliance counting
- `packages/audit/src/collectors/areas/licenses.ts` - SKU detection with feature flags
- `packages/audit/src/collectors/areas/domains.ts` - Domains + password policy extraction
- `packages/audit/src/collectors/areas/pim-roles.ts` - PIM eligible/active assignments (P2 guarded)
- `packages/audit/src/collectors/areas/app-registrations.ts` - Application count via $count
- `packages/audit/src/collectors/areas/sensitivity-labels.ts` - Beta endpoint labels

### Fact Collector
- `packages/audit/src/collectors/fact-collector.ts` - Orchestrates batch 1 -> batch 2 -> standalone calls

### Tests
- `packages/audit/src/__tests__/control-registry.test.ts` - 14 tests for 29 control definitions and registry helpers
- `packages/audit/src/__tests__/area-collectors.test.ts` - 17 tests for 6 core area parsers
- `packages/audit/src/__tests__/extended-area-collectors.test.ts` - 12 tests for 6 extended area parsers
- `packages/audit/src/__tests__/fact-collector.test.ts` - 5 tests for orchestrated fact collection
- `packages/audit/src/__tests__/fixtures/graph-responses.ts` - Mock Graph API responses

## Decisions Made

1. **Area parser pattern:** Each Graph API data area has a standalone parse function (`parseOrganization`, `parseConditionalAccess`, etc.) that accepts raw response data and returns typed facts with `available` boolean and optional `error` string. This separation makes each area independently testable and composable.

2. **Batch error isolation:** The `isBatchError()` helper checks per-request status codes within `$batch` responses, following PITFALL 1 (outer response always 200). Individual failures set `{ error: true, status }` rather than crashing the pipeline.

3. **Placeholder evaluators:** All 29 controls have placeholder evaluator functions that return `{ rating: 'na', message: 'Evaluator not yet implemented' }`. Real evaluator logic will be wired in Plan 03, separating registry structure from evaluation logic.

4. **Three-phase collection strategy:** Batch 1 (12 independent v1.0 endpoints), Batch 2 (1 dependent call needing GA role ID from batch 1), then standalone calls for MFA registration (PITFALL 7: paginated), PIM (PITFALL 2: beta/P2-required), and sensitivity labels (PITFALL 3: beta endpoint).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- AuditFacts type and area parsers ready for evaluators (Plan 03 will wire real evaluator logic into control definitions)
- collectFacts function ready for audit runner integration (Plan 02 will add API routes and DB schema)
- Graph client factory ready for real tenant token integration
- All 48 tests green, TypeScript compilation clean

## Self-Check: PASSED

- All 24 source files confirmed present via glob
- All 4 test files confirmed present
- Commits: 710ce7e (Task 1), 5f3ec67 (Task 2a), 29c615b (Task 2b)
- 48/48 tests passing
- TypeScript compilation clean (tsc --noEmit: no errors)

---
*Phase: 02-core-audit-engine*
*Completed: 2026-03-11*
