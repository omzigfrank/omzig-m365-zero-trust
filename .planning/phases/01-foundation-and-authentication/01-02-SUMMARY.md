---
phase: 01-foundation-and-authentication
plan: 02
subsystem: auth
tags: [hono, jwt, jwk, mfa, rbac, entra-id, vitest, docker, middleware]

# Dependency graph
requires:
  - phase: 01-01
    provides: "Monorepo structure, @omzig/shared types (Role, ApiResponse, ERROR_CODES, hasPermission), @omzig/db schemas"
provides:
  - "Hono API server with health endpoint (public, no auth)"
  - "JWK auth middleware for Entra ID JWT validation"
  - "MFA enforcement middleware checking amr claim"
  - "RBAC middleware with requireRole() and requirePermission()"
  - "Per-tenant role overrides (upgrade/downgrade) via X-Tenant-Id header"
  - "GET /api/auth/me endpoint returning UserProfile with effective role"
  - "User service with getTenantRoleOverride (in-memory, DB-ready)"
  - "Test helpers for mock JWT injection and RBAC scaffolding"
  - "Dockerfile for Container Apps deployment"
affects: [01-03, 01-04, 02-01, 02-02, all-api-plans]

# Tech tracking
tech-stack:
  added: [hono/jwt, hono/cors, hono/factory]
  patterns: [createApp-factory-for-testability, mock-jwt-injection, per-tenant-rbac-resolution, middleware-chain-ordering]

key-files:
  created:
    - apps/api/src/app.ts
    - apps/api/src/middleware/auth.ts
    - apps/api/src/middleware/mfa.ts
    - apps/api/src/middleware/rbac.ts
    - apps/api/src/middleware/error.ts
    - apps/api/src/routes/health.ts
    - apps/api/src/routes/auth.ts
    - apps/api/src/services/user.ts
    - apps/api/src/__tests__/health.test.ts
    - apps/api/src/__tests__/auth.test.ts
    - apps/api/src/__tests__/mfa.test.ts
    - apps/api/src/__tests__/rbac.test.ts
    - apps/api/src/__tests__/helpers.ts
    - apps/api/vitest.config.ts
    - apps/api/Dockerfile
  modified:
    - apps/api/src/index.ts
    - apps/api/tsconfig.json

key-decisions:
  - "Separated app.ts from index.ts for testability (app exports Hono instance, index starts server)"
  - "Used Hono verifyWithJwks with jwks_uri option for Entra ID JWKS endpoint validation"
  - "Mock JWT injection in tests via createMiddleware instead of real JWKS calls"
  - "Per-tenant role overrides use in-memory Map store (DB wired in Plan 03)"
  - "Excluded pre-existing stub files (tenant.ts, keyvault.ts, tenant-db.ts) from tsconfig build"

patterns-established:
  - "App factory pattern: createApp() returns configured Hono instance, separate from server startup"
  - "Auth middleware chain order: CORS -> health routes -> JWK -> MFA -> RBAC -> route handler"
  - "Test helper pattern: createTestAppWithAuth/Rbac/Permission for isolated middleware testing"
  - "Structured error responses: all errors return ApiResponse with correlationId for tracing"
  - "Role resolution: base role from JWT roles claim, effective role from per-tenant override lookup"

requirements-completed: [INFRA-02, AUTH-01, AUTH-02, AUTH-03]

# Metrics
duration: 9min
completed: 2026-03-10
---

# Phase 1 Plan 02: Hono API + Auth Middleware Summary

**Hono API server with Entra ID JWK validation, MFA enforcement via amr claim, and RBAC middleware supporting per-tenant role overrides (upgrade/downgrade) with 27 passing tests**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-11T03:01:25Z
- **Completed:** 2026-03-11T03:10:13Z
- **Tasks:** 2
- **Files modified:** 17

## Accomplishments
- Built complete Hono API server with health endpoint, CORS, and structured error handling (correlationId tracing)
- Implemented full authentication middleware chain: JWK validation (Entra ID JWKS), MFA enforcement (amr claim), RBAC (4 roles + 11 permissions)
- Per-tenant role overrides working for both upgrade (Read-only -> Analyst) and downgrade (Admin -> Read-only) scenarios
- GET /api/auth/me returns UserProfile with effective role resolution including tenant context
- 27 unit tests covering all auth, MFA, RBAC, and health endpoint behaviors
- Multi-stage Dockerfile ready for Container Apps deployment (node:22-alpine, non-root user)

## Task Commits

Each task was committed atomically:

1. **Task 1: Hono app skeleton with health endpoint and Vitest config** - `d47e92a` (feat)
2. **Task 2: Auth middleware stack (JWK, MFA, RBAC) with full test suite** - `08d071d` (feat)

_Both tasks followed TDD: RED (write failing tests) -> GREEN (implement until passing)_

## Files Created/Modified
- `apps/api/src/app.ts` - Hono app factory with middleware chain and route registration
- `apps/api/src/index.ts` - Server entry point using @hono/node-server
- `apps/api/src/middleware/auth.ts` - JWK auth middleware for Entra ID (verifyWithJwks + JWKS URI)
- `apps/api/src/middleware/mfa.ts` - MFA enforcement checking amr claim in JWT
- `apps/api/src/middleware/rbac.ts` - requireRole() and requirePermission() with per-tenant overrides
- `apps/api/src/middleware/error.ts` - Global error handler and not-found handler with correlationId
- `apps/api/src/routes/health.ts` - Public health endpoint returning HealthResponse
- `apps/api/src/routes/auth.ts` - GET /me returning UserProfile with effective role
- `apps/api/src/services/user.ts` - getUserProfile, resolveEffectiveRole, getTenantRoleOverride stubs
- `apps/api/src/__tests__/health.test.ts` - 5 tests for health and error handling
- `apps/api/src/__tests__/auth.test.ts` - 5 tests for JWT auth flow and /me endpoint
- `apps/api/src/__tests__/mfa.test.ts` - 4 tests for MFA amr claim enforcement
- `apps/api/src/__tests__/rbac.test.ts` - 13 tests for role enforcement, permissions, and overrides
- `apps/api/src/__tests__/helpers.ts` - Test scaffolding with mock JWT injection
- `apps/api/vitest.config.ts` - Vitest configuration (node environment, src/__tests__/)
- `apps/api/Dockerfile` - Multi-stage build, node:22-alpine, non-root user
- `apps/api/tsconfig.json` - Excluded test files and pre-existing stubs from build

## Decisions Made
- **App/server separation:** Created `app.ts` separate from `index.ts` so tests can import the Hono app instance without starting a server. This is a standard pattern for Hono testing.
- **Hono verifyWithJwks:** Used Hono's built-in `verifyWithJwks` with the `jwks_uri` option instead of a custom JWKS fetcher. This handles key rotation, kid matching, and algorithm verification automatically.
- **Mock JWT in tests:** Rather than mocking HTTP calls to the JWKS endpoint, tests inject JWT payloads directly into the Hono context via a mock middleware. This tests the middleware chain behavior without network dependency.
- **In-memory role overrides:** Per-tenant overrides use a Map store for now. The `getTenantRoleOverride` function signature matches what Plan 03 will wire to the database.
- **Pre-existing file exclusion:** Found untracked stub files from a previous session (tenant.ts, keyvault.ts, tenant-db.ts) that reference uninstalled packages. Excluded from tsconfig build rather than deleting (they belong to Plan 03).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Health test 404 assertion conflicted with auth middleware**
- **Found during:** Task 2 (after wiring auth middleware)
- **Issue:** The health test expected GET /api/nonexistent to return 404, but the MFA middleware now intercepts all /api/* routes and returns 401/403 for unauthenticated requests
- **Fix:** Updated test to verify 404 on non-/api/ paths, and verify auth error on /api/* unknown routes
- **Files modified:** apps/api/src/__tests__/health.test.ts
- **Verification:** All 27 tests pass
- **Committed in:** 08d071d

**2. [Rule 3 - Blocking] Pre-existing stub files break TypeScript build**
- **Found during:** Task 2 (build verification)
- **Issue:** Untracked files from a previous session (tenant.ts, keyvault.ts, tenant-db.ts) import drizzle-orm which is not in apps/api dependencies
- **Fix:** Added explicit exclusions to tsconfig.json for these files
- **Files modified:** apps/api/tsconfig.json
- **Verification:** `tsc` build passes cleanly
- **Committed in:** 08d071d

**3. [Rule 1 - Bug] verifyWithJwks signature mismatch**
- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** Initial implementation passed jwksUri as a string argument, but Hono's verifyWithJwks expects an options object with `jwks_uri`, `allowedAlgorithms`, and optional `verification` fields
- **Fix:** Changed to pass options object: `{ jwks_uri, allowedAlgorithms: ['RS256'], verification: { iss, aud } }`
- **Files modified:** apps/api/src/middleware/auth.ts
- **Verification:** TypeScript compilation passes, correct API usage confirmed from source
- **Committed in:** 08d071d

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All fixes necessary for correctness and build success. No scope creep.

## Issues Encountered
- Pre-existing untracked files from a previous coding session (keyvault.test.ts, tenant-middleware.test.ts, tenant.ts, keyvault.ts, tenant-db.ts) caused build and test failures. These belong to Plan 03 and were excluded from the current build scope without modification.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- API server is fully functional with complete auth middleware chain. Plan 01-03 (database + Key Vault) can wire the user service to the control plane database and implement real tenant role override lookups.
- Plan 01-04 (Container Apps deployment) can use the Dockerfile and health endpoint for liveness/readiness probes.
- The auth middleware chain is proven with 27 tests covering all role/permission/override combinations.
- Test helpers are reusable for any future API endpoint tests.

## Self-Check: PASSED

All 17 created/modified files verified present. Both task commits (d47e92a, 08d071d) verified in git log.

---
*Phase: 01-foundation-and-authentication*
*Completed: 2026-03-10*
