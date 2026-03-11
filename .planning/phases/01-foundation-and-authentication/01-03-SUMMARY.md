---
phase: 01-foundation-and-authentication
plan: 03
subsystem: database
tags: [mssql, drizzle-orm, azure-keyvault, tenant-isolation, elastic-pool, envelope-encryption, hono-middleware]

# Dependency graph
requires:
  - phase: 01-foundation-and-authentication/01-01
    provides: "Monorepo structure, @omzig/db schemas and connection stubs, @omzig/shared type contracts"
provides:
  - "Database connection factory with singleton control plane and on-demand per-tenant patterns"
  - "Migration runner for control plane and tenant databases (migrateControlPlane, migrateTenantDb)"
  - "Key Vault service with secret storage, tenant token management, and RSA-OAEP envelope encryption"
  - "Tenant database provisioning service (create UUID-named DB, run migrations, store metadata)"
  - "Tenant database deprovisioning with 30-day soft-delete retention"
  - "Per-request tenant context middleware (withTenantDb) with access verification and connection cleanup"
  - "Drizzle Kit configuration for MSSQL schema generation"
affects: [01-04, 02-01, 04-01, 04-02]

# Tech tracking
tech-stack:
  added: ["@azure/keyvault-keys@4.x", "@azure/keyvault-secrets@4.x", "drizzle-orm/node-mssql/migrator"]
  patterns: [keyvault-envelope-encryption, on-demand-tenant-connections, tenant-middleware-pattern, uuid-opaque-db-names, tdd-red-green]

key-files:
  created:
    - packages/db/src/migrate.ts
    - packages/db/drizzle.config.ts
    - packages/db/vitest.config.ts
    - packages/db/src/__tests__/tenant-isolation.test.ts
    - apps/api/src/services/keyvault.ts
    - apps/api/src/services/tenant-db.ts
    - apps/api/src/middleware/tenant.ts
    - apps/api/src/__tests__/keyvault.test.ts
    - apps/api/src/__tests__/tenant-middleware.test.ts
  modified:
    - packages/db/src/connection.ts
    - packages/db/src/index.ts
    - packages/db/package.json
    - packages/db/tsconfig.json
    - apps/api/package.json

key-decisions:
  - "Key Vault envelope encryption (RSA-OAEP) substitutes Always Encrypted -- Node.js tedious driver has no Always Encrypted support"
  - "azure-active-directory-default auth type for production SQL connections (supports managed identity on Container Apps)"
  - "drizzle-orm added as direct dependency of @omzig/api for eq/and operator imports in tenant middleware"
  - "Test files excluded from tsc build via tsconfig exclude patterns"
  - "__dirname used instead of import.meta.url in migrate.ts to avoid CJS/ESM conflict with Node16 module resolution"

patterns-established:
  - "Service module pattern: singleton client initialization with lazy loading (keyvault.ts)"
  - "Tenant middleware pattern: validate header -> lookup tenant -> verify access -> open connection -> next() -> close in finally"
  - "TDD flow: RED commit (failing tests) -> GREEN commit (implementation passes all tests)"
  - "Mock pattern for Azure SDK: vi.mock @azure/keyvault-secrets, @azure/keyvault-keys, @azure/identity"
  - "Mock pattern for @omzig/db: chain-able select().from().where() mock with mockResolvedValueOnce"

requirements-completed: [INFRA-04, INFRA-06, AUTH-04, AUTH-05]

# Metrics
duration: 9min
completed: 2026-03-10
---

# Phase 1 Plan 03: Database & Tenant Isolation Summary

**MSSQL connection factory with per-tenant isolation, Key Vault envelope encryption (RSA-OAEP), tenant provisioning with UUID-named databases, and Hono middleware for per-request tenant context with access verification**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-11T03:01:31Z
- **Completed:** 2026-03-11T03:10:48Z
- **Tasks:** 2
- **Files modified:** 14 (9 created, 5 modified)

## Accomplishments
- Database connection factory fully implemented with azure-active-directory-default auth for production and SQL auth for dev
- Key Vault service provides secret storage, tenant token management, and RSA-OAEP envelope encryption for sensitive DB columns
- Tenant provisioning creates UUID-named databases (opaque -- no PII in infrastructure), runs migrations, stores tokens in Key Vault
- Per-request tenant middleware verifies X-Tenant-Id header, checks user access via tenantUserAccess table, injects DB connection, and closes in finally block
- 49 total tests pass (6 db + 43 api) with integration tests gracefully skipping without SQL_TEST_SERVER

## Task Commits

Each task was committed atomically with TDD (RED then GREEN):

1. **Task 1: Database connection factory and migration runner**
   - `fa60b93` (test) - Failing tests for connection exports and migration module
   - `a5093fa` (feat) - Connection factory, migrate.ts, drizzle.config.ts, index.ts exports
2. **Task 2: Key Vault integration and tenant database provisioning**
   - `42aeb50` (test) - Failing tests for keyvault, tenant-db, and tenant middleware
   - `cb0db15` (feat) - KeyVault service, tenant provisioning, tenant middleware

## Files Created/Modified
- `packages/db/src/connection.ts` - Updated with azure-active-directory-default auth, SQL_SERVER_PORT, SQL_USERNAME, safe closeTenantDb
- `packages/db/src/migrate.ts` - Migration runner for control plane and tenant databases using drizzle-orm migrator
- `packages/db/drizzle.config.ts` - Drizzle Kit configuration for MSSQL dialect
- `packages/db/vitest.config.ts` - Vitest configuration for db package tests
- `packages/db/src/__tests__/tenant-isolation.test.ts` - Integration tests for tenant isolation (skip without SQL_TEST_SERVER)
- `packages/db/src/index.ts` - Added migrate function exports
- `packages/db/package.json` - Added vitest devDep and test script
- `packages/db/tsconfig.json` - Excluded test files from build
- `apps/api/src/services/keyvault.ts` - Key Vault client: getSecret, setSecret, getTenantToken, storeTenantToken, encryptValue, decryptValue
- `apps/api/src/services/tenant-db.ts` - Tenant provisioning: provisionTenantDatabase, deprovisionTenantDatabase (30-day soft delete)
- `apps/api/src/middleware/tenant.ts` - withTenantDb middleware: header validation, tenant lookup, access check, connection injection, cleanup
- `apps/api/src/__tests__/keyvault.test.ts` - 10 tests for Key Vault service and tenant provisioning exports
- `apps/api/src/__tests__/tenant-middleware.test.ts` - 6 tests for tenant middleware behavior
- `apps/api/package.json` - Added drizzle-orm and @azure/keyvault-keys dependencies

## Decisions Made
- **Key Vault envelope encryption via RSA-OAEP** instead of Always Encrypted: Node.js tedious driver has no Always Encrypted support (per research pitfall #2). Key Vault CryptographyClient used directly for encrypt/decrypt operations. Confirmed acceptable per CONTEXT.md.
- **azure-active-directory-default auth type**: Changed from `azure-active-directory-msi-app-service` to `azure-active-directory-default` which works across Container Apps, App Service, and local dev with Azure CLI credentials.
- **drizzle-orm as direct API dependency**: The tenant middleware needs `eq` and `and` operators from drizzle-orm. pnpm strict isolation requires explicit dependency declaration -- can't rely on transitive dependency through @omzig/db.
- **__dirname over import.meta.url**: migrate.ts uses `__dirname` (available in CJS output) rather than `import.meta.url` because the Node16 tsconfig compiles to CommonJS.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] import.meta.url not allowed in CJS output**
- **Found during:** Task 1 (migration runner build)
- **Issue:** `import.meta.url` used for `__dirname` calculation but tsconfig Node16 module outputs CJS where `import.meta` is not available
- **Fix:** Replaced with `__dirname` which is available in CJS modules
- **Files modified:** packages/db/src/migrate.ts
- **Verification:** `pnpm --filter @omzig/db build` passes
- **Committed in:** a5093fa

**2. [Rule 1 - Bug] Test files failing tsc build due to drizzle-orm type conflicts**
- **Found during:** Task 1 (db package build)
- **Issue:** Test files importing `eq` from drizzle-orm caused CJS/ESM dual-package type conflicts during tsc build
- **Fix:** Added `src/__tests__` and `src/**/*.test.ts` to tsconfig exclude
- **Files modified:** packages/db/tsconfig.json
- **Verification:** Build passes, tests still run via vitest
- **Committed in:** a5093fa

**3. [Rule 3 - Blocking] drizzle-orm not resolvable in API package**
- **Found during:** Task 2 (tenant middleware tests)
- **Issue:** Vitest couldn't resolve `drizzle-orm` import in tenant.ts because pnpm strict isolation doesn't hoist transitive deps
- **Fix:** Added `drizzle-orm` as direct dependency of @omzig/api; added `vi.mock('drizzle-orm')` in tests
- **Files modified:** apps/api/package.json, apps/api/src/__tests__/tenant-middleware.test.ts
- **Verification:** All 43 API tests pass
- **Committed in:** cb0db15

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All fixes were necessary for compilation and test execution. No scope creep. Plan intent fully preserved.

## Issues Encountered
- None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required. Key Vault and SQL Server are mocked in tests.

## Next Phase Readiness
- Database connection factory, migration runner, and Key Vault service are complete and tested
- Tenant provisioning and middleware are ready for integration with tenant onboarding routes (Phase 4)
- Plan 01-04 (Frontend auth flow, Bicep infrastructure, end-to-end integration) can proceed
- Integration tests require a SQL Server instance (local Docker or Azure) via SQL_TEST_SERVER env var
- Key Vault integration requires Azure Key Vault instance with encryption key via KEY_VAULT_URL and KEY_VAULT_KEY_NAME env vars

## Self-Check: PASSED

All 10 created files verified present. All 4 task commits (fa60b93, a5093fa, 42aeb50, cb0db15) verified in git log.

---
*Phase: 01-foundation-and-authentication*
*Completed: 2026-03-10*
