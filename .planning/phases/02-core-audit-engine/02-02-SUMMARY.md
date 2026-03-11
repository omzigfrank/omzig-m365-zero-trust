---
phase: 02-core-audit-engine
plan: 02
subsystem: api
tags: [signalr, drizzle, hono, audit, jwt, mssql, vitest]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "Hono API with auth middleware, tenant DB schema, RBAC, per-tenant DB isolation"
provides:
  - "auditFindings table definition for per-tenant finding storage (16 columns, denormalized)"
  - "SignalR REST API push service (pushAuditProgress, negotiateSignalR) with JWT signing"
  - "Audit API routes: trigger (POST 202), list (GET), detail with findings (GET), retry (POST 202)"
  - "SignalR negotiate endpoint returning hub URL and user-scoped access token"
affects: [02-core-audit-engine, 05-dashboard-and-findings-ux, 04-tenant-onboarding]

# Tech tracking
tech-stack:
  added: [jsonwebtoken, "@types/jsonwebtoken"]
  patterns: [azure-signalr-rest-api-push, hono-typed-env, async-audit-trigger-202]

key-files:
  created:
    - "packages/db/src/tenant/schema.ts (auditFindings table)"
    - "apps/api/src/services/signalr.ts"
    - "apps/api/src/routes/audits.ts"
    - "apps/api/src/__tests__/signalr.test.ts"
    - "apps/api/src/__tests__/audit-routes.test.ts"
  modified:
    - "packages/db/src/index.ts (added auditFindings export)"
    - "apps/api/src/app.ts (registered audit routes)"
    - "apps/api/package.json (added jsonwebtoken)"

key-decisions:
  - "Used Hono typed environment (AuditEnv) to properly type tenantDb/tenantMeta/jwtPayload on route context instead of adding to tsconfig exclude"
  - "Hub name 'audit' for SignalR -- matches the serverless mode pattern for push and negotiate"
  - "JWT HS256 with 5min expiry for push, 1hr expiry for negotiate -- security vs usability balance"
  - "auditFindings denormalizes all control metadata (16 columns) for historical accuracy"

patterns-established:
  - "SignalR serverless push: sign JWT with access key, POST to /api/v1/hubs/{hub}/users/{userId}"
  - "Hono typed env for tenant-scoped routes: declare Variables type with tenantDb, tenantMeta, jwtPayload"
  - "Async audit trigger pattern: POST returns 202 immediately, pipeline runs in background with its own DB connection"
  - "Audit route RBAC: Analyst+ for trigger/retry, all authenticated for list/detail"

requirements-completed: [AUDIT-01, AUDIT-05]

# Metrics
duration: 9min
completed: 2026-03-11
---

# Phase 2 Plan 02: Audit API Routes and SignalR Summary

**auditFindings schema with 16 denormalized columns, SignalR push/negotiate with JWT signing, and five audit API routes (trigger 202, list, detail, retry, negotiate)**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-11T14:17:20Z
- **Completed:** 2026-03-11T14:26:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Extended tenant DB schema with auditFindings table (16 columns) for denormalized finding storage per audit run
- Created SignalR REST API push service with JWT HS256 signing for real-time audit progress
- Built complete audit API surface: trigger (POST 202), list, detail with findings, individual check retry, SignalR negotiate
- All 64 API tests pass (21 new: 11 SignalR + 10 audit routes) with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend tenant schema + SignalR service** - `4623a54` (feat)
2. **Task 2: Audit API routes (trigger, list, detail, retry)** - `8acdfb1` (feat)

_Note: TDD tasks had RED (tests written first, verified failing) then GREEN (implementation, verified passing) phases._

## Files Created/Modified
- `packages/db/src/tenant/schema.ts` - Added auditFindings table with 16 columns for denormalized finding data
- `packages/db/src/index.ts` - Added auditFindings export
- `apps/api/src/services/signalr.ts` - SignalR REST API client (pushAuditProgress, negotiateSignalR) with JWT signing
- `apps/api/src/routes/audits.ts` - Five audit API routes with Hono typed environment
- `apps/api/src/app.ts` - Registered audit routes after existing protected routes
- `apps/api/package.json` - Added jsonwebtoken dependency
- `apps/api/src/__tests__/signalr.test.ts` - 11 tests: JWT params, push format, negotiate, env var validation, schema
- `apps/api/src/__tests__/audit-routes.test.ts` - 10 tests: all routes, RBAC enforcement, 404, response formats

## Decisions Made
- Used Hono typed environment (`AuditEnv`) with Variables type to properly type tenantDb/tenantMeta/jwtPayload on route context -- avoids tsconfig excludes and maintains type safety
- Hub name 'audit' for SignalR -- clean namespace for the audit progress channel
- JWT HS256 with 5min expiry for push operations, 1hr expiry for negotiate -- balances security with usability
- RBAC on audit routes: Analyst+ required for trigger/retry (write operations), all authenticated users can list/detail (read operations)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- auditFindings schema and audit routes are ready for Plan 03 to wire the actual evaluator pipeline
- The trigger route creates a placeholder audit run -- Plan 03 adds `runAuditPipeline` as fire-and-forget
- The retry route is a placeholder -- Plan 03 wires actual single-check retry logic
- SignalR push service is ready for the pipeline to call `pushAuditProgress` during evaluation

## Self-Check: PASSED

- All 7 key files verified present on disk
- Commit `4623a54` (Task 1) verified in git log
- Commit `8acdfb1` (Task 2) verified in git log
- 64 tests pass across 8 test files (21 new, 43 existing)
- packages/db and apps/api both build cleanly

---
*Phase: 02-core-audit-engine*
*Completed: 2026-03-11*
