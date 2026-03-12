---
phase: 04-tenant-onboarding-and-management
plan: 02
subsystem: api
tags: [hono, tenant-crud, oauth-callback, wizard-state, zod, rbac, optimistic-locking, drizzle]

# Dependency graph
requires:
  - phase: 04-tenant-onboarding-and-management
    provides: OAuth consent service, GDAP verification service, tenant provisioning service, extended tenants schema, TenantSummary types
provides:
  - 7 tenant CRUD and onboarding endpoints replacing 501 stubs
  - OAuth callback handler for Entra ID consent redirect
  - Wizard-state GET/PATCH/DELETE endpoints for setupWizardState table
  - Route registration order enforcing public vs protected routes
affects: [04-03-PLAN, 04-04-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Public OAuth callback route registered before auth middleware", "Wizard-state upsert with optimistic locking via updatedAt", "resolveOrgId helper for user-to-org resolution from JWT", "toTenantSummary mapper using calculateHealth for health indicators"]

key-files:
  created:
    - apps/api/src/routes/oauth-callback.ts
    - apps/api/src/routes/wizard-state.ts
    - apps/api/src/__tests__/tenant-routes.test.ts
    - apps/api/src/__tests__/setup.ts
  modified:
    - apps/api/src/routes/tenants.ts
    - apps/api/src/app.ts
    - apps/api/vitest.config.ts

key-decisions:
  - "OAuth callback route registered before auth middleware (Entra redirect has no JWT)"
  - "Wizard-state PATCH uses upsert pattern (INSERT if no row, UPDATE with optimistic locking if exists)"
  - "Vitest setup file mocks mssql globally to prevent transitive import failures in tests that use createApp()"
  - "GET /api/tenants uses cached lastAuditScore for health calculation (no per-tenant DB queries for dashboard MVP)"
  - "resolveOrgId extracted as shared helper for both tenant and wizard-state routes"

patterns-established:
  - "Route registration order in app.ts: health -> oauth callback -> auth middleware -> protected routes"
  - "Tenant route RBAC: Admin+ for mutations, all authenticated for reads (org-filtered)"
  - "Wizard-state optimistic locking: UPDATE WHERE id=existing.id, check rowsAffected, return 409 if 0"
  - "Vitest setup.ts for global module mocks (mssql) across all test files"

requirements-completed: [TENANT-01, TENANT-02, TENANT-03, TENANT-07, TENANT-08]

# Metrics
duration: 10min
completed: 2026-03-12
---

# Phase 4 Plan 2: Tenant CRUD Routes, OAuth Callback, and Wizard-State API Summary

**Full tenant management API with 7 CRUD/onboarding endpoints, OAuth callback handler, and wizard-state persistence with optimistic locking**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-12T01:35:46Z
- **Completed:** 2026-03-12T01:46:41Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Replaced all 4 tenant route stubs (501) with 7 working endpoints: list, create, detail, oauth-onboard, gdap-onboard, provision, soft-delete
- Created wizard-state CRUD endpoints (GET/PATCH/DELETE) with optimistic locking for the setupWizardState table
- Built OAuth callback route that handles Entra ID consent redirect with code exchange, state verification, and error routing
- Registered routes in correct order in app.ts: public routes (health, oauth callback) before auth middleware, protected routes after
- All 17 route tests pass with mocked DB and services; 104 total non-audit tests green

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace tenant route stubs with full CRUD, onboarding, and wizard-state routes** - `54c3d6b` (feat)
2. **Task 2: Create OAuth callback route and register all new routes in app.ts** - `f377505` (feat)

## Files Created/Modified
- `apps/api/src/routes/tenants.ts` - Full tenant CRUD (list, create, detail) and onboarding endpoints (oauth, gdap, provision, delete)
- `apps/api/src/routes/wizard-state.ts` - Wizard state GET/PATCH/DELETE with optimistic locking via updatedAt
- `apps/api/src/routes/oauth-callback.ts` - OAuth callback handling Entra ID consent redirect with code exchange
- `apps/api/src/app.ts` - Route registration order: health + oauth callback (public) -> auth middleware -> protected routes
- `apps/api/src/__tests__/tenant-routes.test.ts` - 17 tests covering all tenant and wizard-state route handlers
- `apps/api/src/__tests__/setup.ts` - Vitest global setup mocking mssql for transitive import resolution
- `apps/api/vitest.config.ts` - Added setupFiles reference for global mocks

## Decisions Made
- OAuth callback route registered as public before auth middleware because Entra ID redirect contains no JWT token
- Wizard-state PATCH uses upsert pattern: INSERT on first call, UPDATE with optimistic locking on subsequent calls
- GET /api/tenants returns cached lastAuditScore for health calculation (no expensive per-tenant DB queries for dashboard MVP)
- Vitest setup file mocks mssql globally to prevent transitive import failures when test files import createApp() which now imports all routes
- resolveOrgId helper extracted as shared function in both tenant and wizard-state routes (resolves user's orgId from JWT oid via users table)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added vitest setup file for mssql mock**
- **Found during:** Task 2 (OAuth callback route and app.ts registration)
- **Issue:** Tests that use createApp() (auth.test.ts, health.test.ts) failed because app.ts now transitively imports mssql via tenant-provisioning.ts. The mssql package is not resolvable in the vitest environment.
- **Fix:** Created `apps/api/src/__tests__/setup.ts` that globally mocks mssql, and added `setupFiles` to vitest.config.ts
- **Files modified:** apps/api/src/__tests__/setup.ts, apps/api/vitest.config.ts
- **Verification:** All 104 non-audit tests pass (auth.test.ts and health.test.ts no longer fail)
- **Committed in:** f377505 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for test suite to remain green. No scope creep.

## Issues Encountered
- Pre-existing 4 audit-routes test failures (confirmed present before this plan's changes) -- not related to this plan's scope

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All tenant CRUD endpoints ready for frontend consumption in Plans 03 (dashboard) and 04 (wizard)
- OAuth callback route ready to receive Entra ID consent redirects
- Wizard-state endpoints ready for wizard step tracking and resume
- Route registration order established for any future public/protected route additions

## Self-Check: PASSED

All 7 created/modified files verified present. Both task commits (54c3d6b, f377505) verified in git log.

---
*Phase: 04-tenant-onboarding-and-management*
*Completed: 2026-03-12*
