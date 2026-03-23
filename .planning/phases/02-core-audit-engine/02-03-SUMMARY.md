---
phase: 02-core-audit-engine
plan: 03
subsystem: audit, api, web
tags: [cisa-scuba, evaluators, audit-runner, signalr, pipeline, vitest]

# Dependency graph
requires:
  - phase: 02-core-audit-engine
    plan: 01
    provides: AuditFacts types, 29 control definitions, fact collector, Graph client
  - phase: 02-core-audit-engine
    plan: 02
    provides: audit API routes, SignalR service, auditFindings schema
provides:
  - 29 CISA SCuBA Entra ID evaluators as pure functions
  - Collect-then-evaluate audit runner pipeline
  - Fire-and-forget pipeline wiring in POST /audits route
  - Async frontend hook with SignalR progress and polling fallback
affects: [03-compliance-framework, 04-onboarding-wizard]

# Tech tracking
tech-stack:
  added: ["@microsoft/signalr ^8.0.0"]
  patterns: ["pure evaluator functions (facts => result)", "rate limiter with threshold delay", "SignalR negotiate + HubConnectionBuilder", "polling fallback on SignalR failure"]

key-files:
  created:
    - packages/audit/src/evaluators/entra-id/aad-1-legacy-auth.ts
    - packages/audit/src/evaluators/entra-id/aad-2-risk-policies.ts
    - packages/audit/src/evaluators/entra-id/aad-3-mfa.ts
    - packages/audit/src/evaluators/entra-id/aad-4-logging.ts
    - packages/audit/src/evaluators/entra-id/aad-5-applications.ts
    - packages/audit/src/evaluators/entra-id/aad-6-passwords.ts
    - packages/audit/src/evaluators/entra-id/aad-7-privileged-roles.ts
    - packages/audit/src/evaluators/entra-id/aad-8-guest-access.ts
    - packages/audit/src/evaluators/entra-id/index.ts
    - packages/audit/src/pipeline/audit-runner.ts
    - packages/audit/src/pipeline/rate-limiter.ts
    - packages/audit/src/pipeline/token-manager.ts
    - packages/audit/src/pipeline/progress-emitter.ts
    - packages/audit/src/__tests__/evaluators.test.ts
    - packages/audit/src/__tests__/audit-runner.test.ts
    - apps/web/src/hooks/__tests__/useAudit.test.ts
    - apps/web/vitest.config.ts
  modified:
    - packages/audit/src/registry/entra-id-controls.ts
    - packages/audit/src/index.ts
    - packages/audit/package.json
    - apps/api/src/routes/audits.ts
    - apps/api/src/services/signalr.ts
    - apps/api/src/__tests__/audit-routes.test.ts
    - apps/api/package.json
    - apps/web/src/hooks/useAudit.ts
    - apps/web/src/lib/types.ts
    - apps/web/src/lib/audit-api.ts
    - apps/web/package.json

key-decisions:
  - "Pure evaluator functions: (facts: AuditFacts) => EvaluatorResult with no Graph API calls inside evaluators"
  - "Advisory evaluators (4.1, 7.3, 7.4, 7.6, 7.8, 7.9) return 'warn' since Graph API cannot verify these settings"
  - "P2-dependent evaluators (2.1, 2.3, 7.2, 7.5, 7.7) return 'na' when facts.licenses.hasP2 is false"
  - "Guest role GUIDs hardcoded as well-known constants (2af84b1e... restricted, 10dae51f... limited)"
  - "Pipeline opens own DB connection via getTenantDb (PITFALL 4: middleware connection closes after 202)"
  - "SignalR progress is best-effort (ProgressEmitter silently catches errors)"
  - "Frontend falls back to polling every 3s when SignalR connection fails"
  - "Unified AuditProgressMessage type: @omzig/audit is single source, API imports from it"

patterns-established:
  - "Evaluator per file: aad-{N}-{topic}.ts exports evaluateAAD_{N}_{M} functions"
  - "entraIdEvaluators Map<string, EvaluatorFn> for lookup by control ID"
  - "Rate limiter threshold pattern: delay at 80% of rate limit"
  - "Token manager placeholder for Phase 4 refresh logic"

requirements-completed: [AUDIT-01, AUDIT-02, AUDIT-03, AUDIT-04, AUDIT-06, FRAME-01, AUTH-06]

# Metrics
duration: 15min
completed: 2026-03-11
---

# Phase 2 Plan 03: 29 Evaluators, Pipeline, Frontend SignalR Summary

**All 29 CISA SCuBA Entra ID evaluators, audit runner pipeline with rate limiting and progress push, API wiring, and async frontend hook with SignalR progress**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-11T16:45:00Z
- **Completed:** 2026-03-11T17:07:00Z
- **Tasks:** 3
- **Files created:** 17
- **Files modified:** 11
- **Total tests:** 189 (117 audit + 64 API + 8 web)

## Accomplishments

### Task 1: 29 Evaluators
- Implemented all 29 CISA SCuBA Entra ID evaluators as pure functions across 8 files
- Ported 16 evaluators from CisaEvaluatorRegistry.ps1, wrote 13 new evaluators
- 59 evaluator-specific tests covering pass/fail/warn/na scenarios
- All evaluators populate settingName, currentValue, expectedValue
- Replaced all placeholder evaluators in ENTRA_ID_CONTROLS registry

### Task 2: Audit Runner Pipeline
- Built 4 pipeline components: RateLimiter, TokenManager, ProgressEmitter, audit-runner
- Pipeline executes: open DB → collect facts → evaluate all 29 → persist findings → push progress → close DB
- Each finding persisted with denormalized control metadata (description, severity, requirement level, NIST)
- Wired runAuditPipeline into POST /audits as fire-and-forget
- Unified AuditProgressMessage type (API imports from @omzig/audit)
- Fixed API test: added vi.mock('@omzig/audit') to audit-routes.test.ts

### Task 3: Frontend Async Audit + SignalR
- Rewrote useAudit hook for async POST trigger (202) + SignalR real-time progress
- Added @microsoft/signalr dependency with HubConnectionBuilder integration
- Polling fallback (3s interval) when SignalR unavailable
- Added AuditFinding, AuditRunDetail, AuditProgressUpdate types
- Rewrote audit-api.ts to use apiClient (triggerAudit, fetchAuditDetail, negotiateSignalR, retryCheck)
- 8 web tests covering API functions and type contracts

## Task Commits

1. **Task 1: 29 evaluators** - `e0a1142` (feat)
2. **Task 2: Pipeline + API wiring** - `b95b210` (feat)
3. **Task 3: Frontend async + SignalR** - `3744ca2` (feat)

## Decisions Made

1. **Pure evaluator functions:** Each evaluator takes AuditFacts and returns EvaluatorResult with no side effects. Graph API calls happen only during fact collection, never during evaluation.

2. **Advisory evaluators:** Controls that cannot be verified via Graph API (logging config 4.1, PIM policies 7.3/7.6/7.8/7.9, monthly reviews 7.4) return 'warn' with actionable guidance.

3. **PITFALL 4 compliance:** Pipeline opens its own DB connection via getTenantDb(databaseName) and closes in finally block. The middleware-provided tenantDb closes after the 202 response returns.

4. **SignalR with polling fallback:** Frontend tries SignalR first for real-time progress. On connection failure (SignalR unavailable, network issues), falls back to polling GET every 3 seconds until audit completes.

5. **Web test approach:** Used Node environment tests (not jsdom) to avoid pnpm strict hoisting issues with @testing-library/react. Tests cover audit-api functions and type contracts.

## Deviations from Plan

- Used Node environment for web tests instead of jsdom due to pnpm dependency resolution issues with @testing-library/react
- Tests cover audit-api module functions and type contracts rather than React hook rendering

## Issues Encountered

1. **gsd-executor subagent Bash permissions:** Subagent couldn't run Bash commands. Resolved by executing Tasks 1-3 directly in the main session.
2. **API test failure after pipeline wiring:** audit-routes.test.ts returned 500 because it didn't mock @omzig/audit. Fixed by adding vi.mock('@omzig/audit').
3. **PostCSS/picocolors missing in web tests:** Broken symlink in pnpm store. Fixed by disabling PostCSS in vitest.config.ts.

## Self-Check: PASSED

- All 29 evaluators implemented and tested
- Pipeline wired into POST /audits route
- Frontend hook updated for async + SignalR
- 189/189 tests passing across 3 packages
- Commits: e0a1142, b95b210, 3744ca2

---
*Phase: 02-core-audit-engine*
*Completed: 2026-03-11*
