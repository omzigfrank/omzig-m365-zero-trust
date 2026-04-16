---
phase: 08-drift-detection
plan: 01
subsystem: drift-detection-backend
tags: [drift, polling, graph-api, signalr, db-schema]
dependency_graph:
  requires: [phase-07-remediation, phase-06-scheduler, phase-02-audit-engine]
  provides: [drift-core-modules, drift-poller-service, drift-api-routes, drift-signalr-push]
  affects: [packages/audit, packages/db, packages/shared, apps/api]
tech_stack:
  added: []
  patterns: [in-process-poller, array-item-matching, audit-log-polling]
key_files:
  created:
    - packages/audit/src/drift/types.ts
    - packages/audit/src/drift/audit-log-parser.ts
    - packages/audit/src/drift/diff-engine.ts
    - packages/audit/src/drift/severity-classifier.ts
    - packages/audit/src/drift/area-recollector.ts
    - packages/audit/src/drift/__tests__/audit-log-parser.test.ts
    - packages/audit/src/drift/__tests__/diff-engine.test.ts
    - packages/audit/src/drift/__tests__/severity-classifier.test.ts
    - packages/audit/src/drift/__tests__/area-recollector.test.ts
    - packages/db/src/tenant/migrations/0002_add_drift_detection.sql
    - packages/db/src/control-plane/migrations/0008_add_drift_poll_columns.sql
    - apps/api/src/services/drift-poller.ts
    - apps/api/src/routes/drift.ts
    - apps/api/src/__tests__/drift-poller.test.ts
    - apps/api/src/__tests__/drift-routes.test.ts
  modified:
    - packages/audit/src/index.ts
    - packages/audit/src/pipeline/audit-runner.ts
    - packages/db/src/tenant/schema.ts
    - packages/db/src/control-plane/schema.ts
    - packages/db/src/index.ts
    - packages/shared/src/types/action-queue.ts
    - apps/api/src/services/signalr.ts
    - apps/api/src/app.ts
    - apps/api/src/index.ts
decisions:
  - "ACTIVITY_TO_AREA has 19 entries (not 18 as noted in CONTEXT) because Device no longer compliant was counted separately"
  - "collectSingleArea uses direct GET calls (not batch-of-1) per research recommendation"
  - "diffFactArea array-level matching covers conditionalAccess.policies and namedLocations.locations; other areas use scalar computeDrift delegation"
  - "Drift poller fires checkTenantDrift as fire-and-forget (mirrors scheduler pattern); test helper _drainInFlightForTests added for test determinism"
metrics:
  duration: 17min
  completed: 2026-04-16
  tasks: 2
  files: 24
---

# Phase 8 Plan 01: Backend Drift Detection Engine Summary

Complete backend drift detection engine with baseline snapshot storage, audit log parser, per-area re-collector, diff engine with array-level item matching, severity classifier, drift alert DB table, in-process drift poller service, drift API routes, and SignalR push for real-time alerts.

## Task 1: Drift Core Modules + DB Schemas

**Commit:** `efd0b86`

Created the foundational drift detection modules in `packages/audit/src/drift/`:

- **types.ts**: DirectoryAuditEvent, DriftEvent, AreaDiffResult, DriftSeverity, DriftAlertMessage, GraphThrottledError, AreaRecollectionNotSupported
- **audit-log-parser.ts**: ACTIVITY_TO_AREA maps 19 Graph directoryAudit activity types to 10 AuditFacts areas. parseAuditLogEvents filters (success-only, mapped-only), deduplicates by area, extracts actor UPN.
- **diff-engine.ts**: diffFactArea does array-level item matching by `id` for conditionalAccess.policies and namedLocations.locations; delegates to computeDrift for scalar areas (securityDefaults, authorizationPolicy, etc.). Generates human-readable summary strings.
- **severity-classifier.ts**: classifySeverity returns highest severity across events (Critical for CA deletes/security defaults changes, High for role changes/auth methods, Medium for password/PIM, Low for apps/locations/devices).
- **area-recollector.ts**: collectSingleArea uses direct GET calls for 10 monitored areas. Handles two-call areas (adminRoles needs roles + GA members). Throws AreaRecollectionNotSupported for non-monitored areas. Catches 429 as GraphThrottledError.

DB changes:
- Added `factsSnapshot NVARCHAR(MAX)` column to `auditRuns` table (migration 0002)
- Created `drift_alerts` tenant-scoped table with before/after snapshots, severity, indexes (migration 0002)
- Added `lastDriftPollAt` and `driftCheckIntervalMinutes` to control-plane `tenants` table (migration 0008)
- Wired `factsSnapshot: JSON.stringify(facts)` into audit-runner.ts mark-complete update
- Extended ActionQueueItem type with `'drift_detected'`
- Exported all drift modules from @omzig/audit index

**Tests:** 35 new tests across 4 test files (audit-log-parser: 12, diff-engine: 7, severity-classifier: 10, area-recollector: 6)

## Task 2: Drift Poller + API Routes + SignalR

**Commit:** `22f8ce0`

- **drift-poller.ts**: In-process poller mirroring scheduler.ts + remediation-worker.ts patterns. 60s poll interval, MAX_CONCURRENT=3, 30s stagger between queued launches. Updates lastDriftPollAt BEFORE processing (PITFALL 5). Graceful drain with 30s cap on SIGTERM. Full two-phase detection: poll audit log -> filter/deduplicate by area -> load baseline factsSnapshot -> re-collect affected area -> diff -> insert drift_alerts -> push via SignalR to all tenant watchers.
- **signalr.ts**: Added pushDriftAlert() following exact pattern of pushAuditProgress/pushRemediationProgress with 'driftAlert' target.
- **drift.ts routes**: 5 endpoints -- GET /drift-alerts (paginated, severity/area/status filters), GET /drift-alerts/:id (full detail with snapshots), POST /drift-alerts/:id/dismiss (Analyst+), GET /drift-config, PATCH /drift-config (Admin only, validates interval 15-60).
- **app.ts**: Registered driftRoutes in protected routes section after remediations.
- **index.ts**: startDriftPoller() in serve callback, stopDriftPoller() in SIGTERM handler (drained before remediation worker).

**Tests:** 18 new tests across 2 test files (drift-poller: 8, drift-routes: 10)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ACTIVITY_TO_AREA count is 19, not 18**
- **Found during:** Task 1
- **Issue:** The CONTEXT.md table shows 18 activity types, but the research section lists 19 (includes both "Update device" and "Device no longer compliant" for the devices area)
- **Fix:** Used the research list (19 entries), updated test assertion from 18 to 19
- **Files modified:** audit-log-parser.test.ts
- **Commit:** efd0b86

**2. [Rule 3 - Blocking] Fire-and-forget pattern required test drain helper**
- **Found during:** Task 2
- **Issue:** Poller launches checkTenantDrift as fire-and-forget (matching scheduler.ts pattern), but tests need to await completion to verify side effects
- **Fix:** Added `_drainInFlightForTests()` helper to drift-poller.ts; all tests that expect drift detection outcomes call it after `_pollForDueDriftChecks()`
- **Files modified:** drift-poller.ts, drift-poller.test.ts
- **Commit:** 22f8ce0

## Test Results

| Package | Before | After | Delta | Pre-existing Failures |
|---------|--------|-------|-------|-----------------------|
| packages/audit | 511 (510p/1f) | 546 (545p/1f) | +35 | T6.1 zta-evaluators (unchanged) |
| apps/api | 265 (265p) | 283 (283p) | +18 | None |
| apps/web | 165 (not run) | - | 0 | - |

## Known Stubs

- `getDriftAccessToken()` in drift-poller.ts returns a placeholder token (same pattern as scheduler.ts's `getSchedulerAccessToken()`). Will be replaced by real Key Vault + MSAL flow before production.

## Self-Check: PASSED

All created files exist. Both commits verified in git log.
