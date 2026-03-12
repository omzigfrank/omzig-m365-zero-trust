---
phase: 04-tenant-onboarding-and-management
plan: 01
subsystem: api
tags: [oauth, gdap, msal-node, tenant-provisioning, elastic-pool, drizzle, mssql, hmac]

# Dependency graph
requires:
  - phase: 01-foundation-and-authentication
    provides: control-plane schema (tenants table), Key Vault service, tenant middleware, connection factory
provides:
  - Extended tenants table with 6 lifecycle columns (status, connectionMethod, primaryDomain, contactEmail, lastAuditAt, lastAuditScore)
  - TenantSummary, TenantStatus, ConnectionMethod, TenantHealth shared types
  - calculateHealth pure function with score-based health thresholds
  - OAuth consent service (buildConsentUrl, verifyStateHmac, exchangeCodeForTokens)
  - GDAP verification service (verifyGdapRelationship via Graph API)
  - Tenant provisioning service (provisionTenant with elastic pool DB creation, deprovisionTenant soft delete)
  - 4 new error codes (OAUTH_ERROR, GDAP_ERROR, PROVISIONING_ERROR, TENANT_ALREADY_EXISTS)
affects: [04-02-PLAN, 04-03-PLAN, 04-04-PLAN]

# Tech tracking
tech-stack:
  added: ["@azure/msal-node"]
  patterns: ["HMAC-signed OAuth state parameter", "MSAL ConfidentialClientApplication singleton", "T-SQL CREATE DATABASE in elastic pool", "Both OAuth and GDAP converge to storeTenantToken()"]

key-files:
  created:
    - packages/db/src/control-plane/migrations/0004_add_tenant_status_columns.sql
    - apps/api/src/services/oauth-consent.ts
    - apps/api/src/services/gdap-verification.ts
    - apps/api/src/services/tenant-provisioning.ts
    - apps/api/src/__tests__/oauth-consent.test.ts
    - apps/api/src/__tests__/gdap-verification.test.ts
    - apps/api/src/__tests__/tenant-provisioning.test.ts
  modified:
    - packages/db/src/control-plane/schema.ts
    - packages/shared/src/types/tenant.ts
    - packages/shared/src/constants/errors.ts
    - packages/shared/src/index.ts
    - apps/api/package.json
    - apps/api/tsconfig.json

key-decisions:
  - "Use authorize endpoint with prompt=admin_consent (not /adminconsent) to combine consent + code exchange in one redirect"
  - "HMAC-SHA256 state signing with 1-hour expiry for OAuth state parameter tamper protection"
  - "databaseName and tokenSecretName nullable on tenants table (null during pending state before provisioning)"
  - "Graph API v1.0 GDAP endpoint for relationship verification (not Partner Center API)"
  - "Replicate buildConfig pattern locally in tenant-provisioning.ts since connection.ts buildConfig is not exported"

patterns-established:
  - "OAuth state parameter: base64(payload)|base64(hmac) with crypto.timingSafeEqual verification"
  - "GDAP verification: status guidance messages per relationship state (approvalPending, expired, etc.)"
  - "Tenant provisioning: CREATE DATABASE in elastic pool then migrateTenantDb then storeTenantToken then update record"

requirements-completed: [TENANT-01, TENANT-02, TENANT-08]

# Metrics
duration: 5min
completed: 2026-03-11
---

# Phase 4 Plan 1: Schema Extensions and Backend Services Summary

**Extended tenants table with lifecycle columns, OAuth consent via MSAL ConfidentialClientApplication with HMAC-signed state, GDAP verification via Graph API, and tenant provisioning with elastic pool DB creation**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-12T01:25:50Z
- **Completed:** 2026-03-12T01:31:00Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- Extended tenants table with 6 new columns for lifecycle management (status, connectionMethod, primaryDomain, contactEmail, lastAuditAt, lastAuditScore) and made databaseName/tokenSecretName nullable
- Built OAuth consent service with admin consent URL generation (HMAC-signed state), state verification, and MSAL token exchange
- Built GDAP verification service that validates relationship status via Graph API with helpful error guidance per status
- Built tenant provisioning service that creates isolated databases in elastic pool, runs migrations, stores tokens, and grants access
- All 33 tests pass across 3 test files with fully mocked dependencies

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend schema and shared types for tenant lifecycle** - `b4b7310` (feat)
2. **Task 2: Build OAuth consent, GDAP verification, and tenant provisioning services** - `3ff6ea1` (feat)

## Files Created/Modified
- `packages/db/src/control-plane/schema.ts` - Added 6 lifecycle columns, made databaseName/tokenSecretName nullable
- `packages/db/src/control-plane/migrations/0004_add_tenant_status_columns.sql` - SQL migration for new columns
- `packages/shared/src/types/tenant.ts` - TenantStatus, ConnectionMethod, TenantHealth, TenantSummary types and calculateHealth function
- `packages/shared/src/constants/errors.ts` - OAUTH_ERROR, GDAP_ERROR, PROVISIONING_ERROR, TENANT_ALREADY_EXISTS codes
- `packages/shared/src/index.ts` - New type exports and calculateHealth export
- `apps/api/src/services/oauth-consent.ts` - Admin consent URL generation, HMAC state signing/verification, MSAL token exchange
- `apps/api/src/services/gdap-verification.ts` - Graph API GDAP relationship verification with status guidance
- `apps/api/src/services/tenant-provisioning.ts` - DB provisioning in elastic pool, migration, token storage, access grants
- `apps/api/src/__tests__/oauth-consent.test.ts` - 15 tests for consent URL, state HMAC, token exchange
- `apps/api/src/__tests__/gdap-verification.test.ts` - 7 tests for GDAP verification, error cases
- `apps/api/src/__tests__/tenant-provisioning.test.ts` - 11 tests for provisioning and deprovisioning
- `apps/api/package.json` - Added @azure/msal-node dependency
- `apps/api/tsconfig.json` - Excluded new service files from tsc (Azure SDK pattern)

## Decisions Made
- Used authorize endpoint with prompt=admin_consent (not /adminconsent) to combine consent + code exchange in one redirect per RESEARCH Pitfall 1
- HMAC-SHA256 state signing with 1-hour expiry and crypto.timingSafeEqual for tamper-proof OAuth state parameter
- Made databaseName and tokenSecretName nullable in schema (null during pending state, set during provisioning)
- Used Graph API v1.0 GDAP endpoint directly (not Partner Center API) -- same auth context, well-documented
- Replicated buildConfig pattern locally since it's not exported from @omzig/db connection.ts

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Schema extended with tenant lifecycle columns -- ready for CRUD routes in Plan 02
- OAuth consent service ready to wire into callback route handler
- GDAP verification service ready to wire into onboarding endpoint
- Tenant provisioning service ready to wire into wizard provisioning step
- TenantSummary type ready for dashboard API response and frontend components

---
*Phase: 04-tenant-onboarding-and-management*
*Completed: 2026-03-11*
