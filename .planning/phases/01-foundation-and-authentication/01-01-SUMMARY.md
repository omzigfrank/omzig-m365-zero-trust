---
phase: 01-foundation-and-authentication
plan: 01
subsystem: infra
tags: [turborepo, pnpm, monorepo, typescript, drizzle-orm, mssql, hono, nextjs]

# Dependency graph
requires: []
provides:
  - Turborepo + pnpm monorepo structure with workspace resolution
  - "@omzig/shared package with Role, ApiResponse, OrgConfig, TenantRef type contracts"
  - "@omzig/db package with control plane schema (6 tables) and tenant schema stub"
  - "@omzig/tsconfig package with base, node, and nextjs TypeScript configs"
  - "apps/api and apps/web workspace stubs with workspace dependencies"
  - ".env.example with required environment variables"
affects: [01-02, 01-03, 01-04, all-future-plans]

# Tech tracking
tech-stack:
  added: [turborepo@2.x, pnpm@9.0.0, drizzle-orm@beta, mssql@11, hono@4, zod@3, vitest@2, tsx@4]
  patterns: [pnpm-workspaces, turborepo-task-graph, drizzle-mssql-schema, azure-ad-msi-db-auth]

key-files:
  created:
    - turbo.json
    - pnpm-workspace.yaml
    - package.json
    - .env.example
    - packages/tsconfig/base.json
    - packages/tsconfig/node.json
    - packages/tsconfig/nextjs.json
    - packages/shared/src/types/roles.ts
    - packages/shared/src/types/api.ts
    - packages/shared/src/types/org.ts
    - packages/shared/src/types/tenant.ts
    - packages/shared/src/constants/roles.ts
    - packages/shared/src/constants/errors.ts
    - packages/shared/src/index.ts
    - packages/db/src/control-plane/schema.ts
    - packages/db/src/tenant/schema.ts
    - packages/db/src/connection.ts
    - packages/db/src/index.ts
    - apps/api/package.json
    - apps/api/tsconfig.json
    - apps/api/src/index.ts
  modified:
    - .gitignore
    - apps/web/package.json
    - apps/web/tsconfig.json
    - apps/web/next.config.mjs

key-decisions:
  - "Used drizzle-orm@beta (not stable) because mssql-core only exists in beta"
  - "Used varchar(36) for UUID columns since drizzle mssql-core has no uniqueIdentifier type"
  - "Used sql`GETDATE()` for datetime2 defaults since mssql-core has no defaultNow()"
  - "Moved web/ to apps/web/ with git mv to preserve history"
  - "Switched Next.js output from export to standalone for server-side rendering support"

patterns-established:
  - "Workspace structure: apps/* for deployable apps, packages/* for shared libraries"
  - "TypeScript extends pattern: all packages extend @omzig/tsconfig/{base|node|nextjs}.json"
  - "Database connection pattern: singleton control plane, on-demand per-tenant with explicit close"
  - "RBAC constants: ROLE_HIERARCHY, ROLE_PERMISSIONS, hasPermission() as shared contract"
  - "Schema naming: snake_case SQL columns, camelCase TypeScript properties via drizzle mapping"

requirements-completed: [INFRA-07, INFRA-03]

# Metrics
duration: 16min
completed: 2026-03-10
---

# Phase 1 Plan 01: Monorepo Foundation Summary

**Turborepo + pnpm monorepo with @omzig/shared type contracts (Role, RBAC, API responses) and @omzig/db MSSQL schemas (6 control plane tables, tenant stub) using drizzle-orm beta**

## Performance

- **Duration:** 16 min
- **Started:** 2026-03-11T02:41:17Z
- **Completed:** 2026-03-11T02:57:00Z
- **Tasks:** 2
- **Files modified:** 52 (including git mv renames)

## Accomplishments
- Established Turborepo + pnpm monorepo with 6 workspace packages that all build successfully
- Created complete RBAC type system (4 roles, 11 permissions, hierarchy, hasPermission helper)
- Defined all control plane database tables (organizations, users, tenants, tenantUserAccess, auditLog, setupWizardState)
- Moved existing Next.js web app to apps/web/ preserving git history and switching to standalone output
- Created database connection factory with Azure AD MSI authentication for production and SQL auth fallback

## Task Commits

Each task was committed atomically:

1. **Task 1: Create monorepo structure with Turborepo + pnpm workspaces** - `54ab520` (feat)
2. **Task 2: Create @omzig/shared and @omzig/db packages with type contracts and database schemas** - `6f15a70` (feat)

## Files Created/Modified
- `turbo.json` - Turborepo task configuration (build, dev, test, lint, db:generate, db:migrate)
- `pnpm-workspace.yaml` - Workspace definition (apps/*, packages/*)
- `package.json` - Root package with turbo scripts and packageManager field
- `.env.example` - Required environment variables template
- `packages/tsconfig/base.json` - Strict TypeScript base config (ES2022, Node16)
- `packages/tsconfig/node.json` - Node.js TypeScript config
- `packages/tsconfig/nextjs.json` - Next.js TypeScript config (bundler resolution, jsx preserve)
- `packages/shared/src/types/roles.ts` - Role type, UserProfile, TenantRoleOverride, EffectiveRole
- `packages/shared/src/types/api.ts` - ApiResponse, ApiError, PaginatedResponse, HealthResponse
- `packages/shared/src/types/org.ts` - Organization, OrgConfig, SetupWizardState
- `packages/shared/src/types/tenant.ts` - TenantRef, TenantAccess
- `packages/shared/src/constants/roles.ts` - ROLES, ROLE_HIERARCHY, ROLE_PERMISSIONS, hasPermission
- `packages/shared/src/constants/errors.ts` - ERROR_CODES for auth, tenant, org, system errors
- `packages/shared/src/index.ts` - Barrel export for all types and constants
- `packages/db/src/control-plane/schema.ts` - 6 MSSQL tables via drizzle-orm
- `packages/db/src/tenant/schema.ts` - auditRuns stub table for per-tenant DB isolation
- `packages/db/src/connection.ts` - getControlPlaneDb, getTenantDb, closeTenantDb, closeControlPlaneDb
- `packages/db/src/index.ts` - Barrel export for schemas and connection functions
- `apps/api/package.json` - API app with Hono, workspace deps
- `apps/api/src/index.ts` - Placeholder entry point
- `apps/web/next.config.mjs` - Changed output from "export" to "standalone"
- `.gitignore` - Updated for monorepo structure (apps/web/.next, dist/, .turbo/)

## Decisions Made
- **drizzle-orm@beta required:** The stable 0.44.x has no mssql-core module. Beta (1.0.0-beta.16) includes full MSSQL support with mssqlTable, varchar, nvarchar, int, bit, datetime2 column types.
- **varchar(36) for UUIDs:** drizzle-orm mssql-core does not expose a uniqueIdentifier type, so all UUID columns use varchar with length 36.
- **sql`GETDATE()` for timestamps:** The MsSqlDateTime2Builder has no defaultNow() method (unlike PostgreSQL). Used raw SQL default instead.
- **Next.js standalone output:** Changed from "export" (static HTML) to "standalone" to support future server-side rendering and API routes via Node.js server.
- **@omzig/tsconfig as explicit devDep:** pnpm strict module isolation requires tsconfig package to be an explicit devDependency in apps/web for Next.js to resolve it during build.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] drizzle-orm stable lacks mssql-core**
- **Found during:** Task 2 (schema creation)
- **Issue:** Plan specified `drizzle-orm@beta` in package.json but initial version `^0.44.0` was used. The mssql-core module only exists in beta versions (1.0.0-beta.x).
- **Fix:** Changed dependency to `drizzle-orm: "beta"` to install 1.0.0-beta.16 which includes mssql-core
- **Files modified:** packages/db/package.json
- **Verification:** `pnpm build` compiles all schema files
- **Committed in:** 6f15a70

**2. [Rule 1 - Bug] defaultNow() does not exist on MsSqlDateTime2Builder**
- **Found during:** Task 2 (schema compilation)
- **Issue:** Used `.defaultNow()` on datetime2 columns but drizzle mssql-core doesn't support it
- **Fix:** Replaced with `.default(sql\`GETDATE()\`)` using raw SQL
- **Files modified:** packages/db/src/control-plane/schema.ts, packages/db/src/tenant/schema.ts
- **Verification:** TypeScript compilation passes, correct SQL default generated
- **Committed in:** 6f15a70

**3. [Rule 1 - Bug] MSSQL authentication type missing options property**
- **Found during:** Task 2 (connection.ts compilation)
- **Issue:** `azure-active-directory-msi-app-service` auth type requires `options` object with `clientId`
- **Fix:** Added `options: { clientId: process.env.AZURE_CLIENT_ID }` to auth config
- **Files modified:** packages/db/src/connection.ts
- **Verification:** TypeScript compilation passes
- **Committed in:** 6f15a70

**4. [Rule 3 - Blocking] @omzig/tsconfig not resolvable by Next.js**
- **Found during:** Task 2 (full build verification)
- **Issue:** pnpm strict isolation prevented Next.js from resolving @omzig/tsconfig/nextjs.json since it wasn't an explicit dependency of apps/web
- **Fix:** Added `"@omzig/tsconfig": "workspace:*"` to apps/web devDependencies
- **Files modified:** apps/web/package.json
- **Verification:** `pnpm build --filter=@omzig/web` succeeds
- **Committed in:** 6f15a70

---

**Total deviations:** 4 auto-fixed (2 bugs, 2 blocking)
**Impact on plan:** All fixes were necessary to make the code compile. The plan's intent was fully preserved. No scope creep.

## Issues Encountered
- Windows path length warning during Next.js standalone build (IO error for long symlink paths in node_modules/.pnpm). Non-blocking, build succeeds.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Monorepo foundation is complete and building. Plan 01-02 (Hono API + Entra auth) can build on apps/api/ and import from @omzig/shared and @omzig/db.
- Plan 01-03 (database + Key Vault) can use the schemas defined in @omzig/db and the connection factory.
- All type contracts are defined and exported, providing clear interfaces for downstream plans.

## Self-Check: PASSED

All 21 created files verified present. Both task commits (54ab520, 6f15a70) verified in git log.

---
*Phase: 01-foundation-and-authentication*
*Completed: 2026-03-10*
