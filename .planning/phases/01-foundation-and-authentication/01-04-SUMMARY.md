---
phase: 01-foundation-and-authentication
plan: 04
subsystem: infra
tags: [msal, next.js, bicep, container-apps, sql-elastic-pool, keyvault, signalr, vnet, docker, hono]

# Dependency graph
requires:
  - phase: 01-foundation-and-authentication/01-02
    provides: "Hono API with JWK auth, MFA, RBAC middleware and auth/health routes"
  - phase: 01-foundation-and-authentication/01-03
    provides: "Database connection factory, Key Vault service, tenant provisioning, tenant middleware"
provides:
  - "MSAL frontend auth with tenant-specific authority and API scopes"
  - "Authenticated API client with Bearer token and tenant header support"
  - "Role-aware useAuth hook with MFA status and role hierarchy resolution"
  - "AuthGuard with requiredRole and requiredPermission props"
  - "Multi-stage Dockerfiles for both Next.js (standalone) and Hono API"
  - "7 Bicep platform modules: VNet, ACR, Container Apps, SQL Elastic Pool, Key Vault, SignalR, orchestrator"
  - "SQL Server with private endpoint only (AUTH-07)"
  - "SignalR in serverless mode (INFRA-05)"
  - "Container Apps with managed identity for Key Vault and SQL access (AUTH-05)"
  - "Stub tenants route at /api/tenants returning 501 (placeholder for Phase 4)"
affects: [02-01, 04-01, 04-02, 05-01]

# Tech tracking
tech-stack:
  added: ["@azure/msal-browser@3.x", "@azure/msal-react@2.x"]
  patterns: [msal-tenant-authority, api-client-bearer-token, authguard-role-props, bicep-module-composition, standalone-nextjs-docker]

key-files:
  created:
    - apps/web/src/lib/api-client.ts
    - apps/web/src/hooks/useApi.ts
    - apps/web/Dockerfile
    - bicep/platform/vnet.bicep
    - bicep/platform/acr.bicep
    - bicep/platform/container-apps.bicep
    - bicep/platform/sql-elastic-pool.bicep
    - bicep/platform/keyvault.bicep
    - bicep/platform/signalr.bicep
    - bicep/platform/main-platform.bicep
    - apps/api/src/routes/tenants.ts
  modified:
    - apps/web/src/lib/msal.ts
    - apps/web/src/hooks/useAuth.ts
    - apps/web/src/components/layout/AuthGuard.tsx
    - apps/web/src/app/page.tsx
    - apps/web/src/app/layout.tsx
    - apps/api/src/app.ts

key-decisions:
  - "Tenant-specific MSAL authority (not /common) for single-org app registration"
  - "Container Apps subnet sized at /23 (minimum for Container Apps Environment)"
  - "SQL Server public network access disabled with private endpoint in VNet (AUTH-07)"
  - "Key Vault uses RBAC authorization mode (not access policies)"
  - "SignalR Free_F1 for dev, Standard_S1 for prod"
  - "Stub tenants route returns 501 Not Implemented (full implementation in Phase 4)"

patterns-established:
  - "Bicep module composition: main-platform.bicep composes sub-modules with dependency chain via outputs"
  - "MSAL token acquisition: acquireTokenSilent with redirect fallback"
  - "API client pattern: authenticated fetch wrapper with Bearer token and X-Tenant-Id header"
  - "AuthGuard role checking: requiredRole prop compared against ROLE_HIERARCHY from @omzig/shared"

requirements-completed: [INFRA-01, INFRA-05, AUTH-05, AUTH-07]

# Metrics
duration: 3min
completed: 2026-03-10
---

# Phase 1 Plan 04: Frontend Auth, Bicep Infrastructure, and End-to-End Integration Summary

**MSAL frontend auth with role-aware UI, 7 Bicep platform modules (VNet, Container Apps, SQL Elastic Pool, Key Vault, SignalR), Dockerfiles for both apps, and stub tenants route**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-11T03:21:07Z
- **Completed:** 2026-03-11T03:23:55Z
- **Tasks:** 3 (2 auto + 1 human-verify)
- **Files modified:** 17 (11 created, 6 modified)

## Accomplishments
- Frontend MSAL auth with tenant-specific authority, role-aware hooks, and authenticated API client with Bearer tokens
- 7 Bicep platform modules composing full Azure infrastructure with private endpoints, managed identity, and serverless SignalR
- Multi-stage Dockerfiles for both Next.js standalone and Hono API apps
- Stub tenants route wired at /api/tenants returning 501 (Phase 4 placeholder)
- All 49 tests pass, all packages build, Bicep validates

## Task Commits

Each task was committed atomically:

1. **Task 1: Frontend auth update + API client + Dockerfiles** - `140c9d7` (feat)
2. **Task 2: Bicep platform infrastructure modules and stub tenants route** - `199c8cd` (feat)
3. **Task 3: Verify end-to-end auth flow and infrastructure** - Human checkpoint approved

## Files Created/Modified
- `apps/web/src/lib/msal.ts` - Updated with tenant-specific authority and API scopes
- `apps/web/src/lib/api-client.ts` - Authenticated fetch wrapper with Bearer token
- `apps/web/src/hooks/useAuth.ts` - Role-aware auth hook with MFA status
- `apps/web/src/hooks/useApi.ts` - React hook wrapping api-client for components
- `apps/web/src/components/layout/AuthGuard.tsx` - Extended with requiredRole and requiredPermission props
- `apps/web/src/app/page.tsx` - Omzig-branded landing page with authenticated profile display
- `apps/web/src/app/layout.tsx` - Enterprise light theme
- `apps/web/Dockerfile` - Multi-stage Next.js standalone build
- `bicep/platform/vnet.bicep` - VNet with container-apps (/23) and private-endpoints (/24) subnets
- `bicep/platform/acr.bicep` - Azure Container Registry (Basic/Standard per environment)
- `bicep/platform/container-apps.bicep` - Container Apps Environment with API and Web apps, managed identity
- `bicep/platform/sql-elastic-pool.bicep` - SQL Server + Elastic Pool + control plane DB + private endpoint
- `bicep/platform/keyvault.bicep` - Key Vault with RBAC authorization and managed identity roles
- `bicep/platform/signalr.bicep` - SignalR Service in serverless mode
- `bicep/platform/main-platform.bicep` - Orchestrator composing all modules with dependency chain
- `apps/api/src/routes/tenants.ts` - Stub tenants route returning 501 for all CRUD endpoints
- `apps/api/src/app.ts` - Wired tenants route at /api/tenants

## Decisions Made
- Used tenant-specific MSAL authority (`/organizations/{tenantId}`) instead of `/common` for single-org app registration
- Container Apps subnet at /23 (minimum for Container Apps Environment, larger than the /24 in plan)
- Key Vault uses RBAC authorization mode (not legacy access policies) for cleaner managed identity integration
- SignalR uses Free_F1 SKU for dev, Standard_S1 for prod
- Stub tenants route returns structured ApiResponse with NOT_IMPLEMENTED error code

## Deviations from Plan
None - plan executed as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. Azure deployment is infrastructure-as-code only.

## Self-Check: PASSED

All 11 created files verified present. Both task commits (140c9d7, 199c8cd) verified in git log. Human verification checkpoint approved.

---
*Phase: 01-foundation-and-authentication*
*Completed: 2026-03-10*
