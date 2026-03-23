---
phase: 04-tenant-onboarding-and-management
plan: 03
subsystem: ui
tags: [next.js, react, tailwind, tenant-dashboard, card-grid, table-view, health-dot, vitest, tenant-detail, compliance-reuse]

# Dependency graph
requires:
  - phase: 04-tenant-onboarding-and-management
    provides: Tenant CRUD API routes (GET /api/tenants, GET /api/tenants/:id, DELETE /api/tenants/:id)
  - phase: 03-compliance-framework-mapping
    provides: ScoreOverview, ZtaMaturityRadar, FrameworkBreakdown, AuditResults, FrameworkFilter components
provides:
  - Multi-tenant dashboard at /tenants with card grid and table toggle views
  - Tenant detail page at /tenants/:id wrapping Phase 3 compliance dashboard
  - HealthDot component with 5-state color coding (green/yellow/red/gray/orange)
  - TenantCard with scores, framework mini scores, relative time, critical findings
  - RemoveTenantModal with name-typing confirmation
  - useTenants hook with optimistic removal
  - tenant-api.ts client with fetchTenants, fetchTenantDetail, deleteTenant
affects: [04-04-PLAN, 05-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Card grid + table toggle view pattern for collection pages", "Optimistic removal with API call revert on failure", "Tenant detail page reusing Phase 3 audit components via useAudit(tenantId)", "HealthDot 5-state color mapping from TenantHealth enum"]

key-files:
  created:
    - apps/web/src/app/tenants/page.tsx
    - apps/web/src/app/tenants/[id]/page.tsx
    - apps/web/src/components/tenants/TenantCard.tsx
    - apps/web/src/components/tenants/TenantGrid.tsx
    - apps/web/src/components/tenants/TenantTable.tsx
    - apps/web/src/components/tenants/HealthDot.tsx
    - apps/web/src/components/tenants/RemoveTenantModal.tsx
    - apps/web/src/hooks/useTenants.ts
    - apps/web/src/lib/tenant-api.ts
    - apps/web/src/__tests__/TenantDashboard.test.tsx
    - apps/web/src/__tests__/TenantDetail.test.tsx
  modified:
    - apps/web/src/lib/types.ts
    - apps/web/src/lib/api-client.ts

key-decisions:
  - "TenantCard uses router.push for navigation (not Link) to support click handler on entire card div"
  - "TenantTable client-side sorting by column header click (default by displayName ascending)"
  - "Tenant detail page reuses Phase 3 components (ScoreOverview, ZtaMaturityRadar, FrameworkBreakdown, AuditResults) via useAudit(tenantId) rather than duplicating"
  - "Tab navigation is client-side state (no URL routing) for simplicity within tenant detail"
  - "apiClient.patch added to api-client.ts for wizard-state PATCH support (linter-added, retained for completeness)"

patterns-established:
  - "Collection page pattern: card grid default with table toggle, Add button, loading/error/empty states"
  - "Detail page pattern: breadcrumb > header > tabs > tab content, with component reuse from Phase 3"
  - "HealthDot as reusable health indicator across card and table views"
  - "RemoveTenantModal name-typing confirmation pattern for destructive actions"

requirements-completed: [TENANT-03, TENANT-04, TENANT-07]

# Metrics
duration: 10min
completed: 2026-03-12
---

# Phase 4 Plan 3: Multi-Tenant Dashboard and Tenant Detail Page Summary

**Card grid + table toggle tenant dashboard at /tenants with tenant detail page at /tenants/:id reusing Phase 3 compliance components (ScoreOverview, ZtaMaturityRadar, AuditResults)**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-12T01:51:03Z
- **Completed:** 2026-03-12T02:01:03Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Built /tenants dashboard with hybrid card grid and data table views, view toggle, loading/error/empty states, and tenant count badge
- Built /tenants/:id detail page with breadcrumb navigation, tenant header (health dot, domain, status, connection method), 4-tab layout (Overview, Findings, Audit History, Settings), reusing all Phase 3 compliance components
- Created HealthDot with 5 health states mapping to Tailwind color classes with accessibility aria-labels
- Created RemoveTenantModal with case-sensitive name-typing confirmation for destructive deletion
- Created useTenants hook with optimistic removal (removes from local state immediately, reverts on API failure)
- 33 tests passing across both test suites (24 dashboard + 9 detail)

## Task Commits

Each task was committed atomically:

1. **Task 1: Multi-tenant dashboard with card grid, table toggle, and API client** - `147fb04` (feat)
2. **Task 2: Tenant detail page wrapping Phase 3 compliance dashboard** - `6b1f5f5` (feat)

## Files Created/Modified
- `apps/web/src/app/tenants/page.tsx` - Multi-tenant dashboard with card grid/table toggle, loading/error/empty states
- `apps/web/src/app/tenants/[id]/page.tsx` - Tenant detail page with breadcrumb, header, tabs, Phase 3 component reuse
- `apps/web/src/components/tenants/TenantCard.tsx` - Individual tenant card with scores, health dot, framework mini scores
- `apps/web/src/components/tenants/TenantGrid.tsx` - CSS grid layout with Add Tenant card and tenant cards
- `apps/web/src/components/tenants/TenantTable.tsx` - Sortable data table with health dots and action column
- `apps/web/src/components/tenants/HealthDot.tsx` - 12px circle health indicator with 5 color states
- `apps/web/src/components/tenants/RemoveTenantModal.tsx` - Confirmation modal requiring exact name typing
- `apps/web/src/hooks/useTenants.ts` - Hook for fetching tenant list with optimistic removal
- `apps/web/src/lib/tenant-api.ts` - API client (fetchTenants, fetchTenantDetail, deleteTenant + wizard-state functions)
- `apps/web/src/lib/types.ts` - Re-exported TenantSummary/TenantStatus/TenantHealth from @omzig/shared
- `apps/web/src/lib/api-client.ts` - Added apiPatch method for PATCH requests
- `apps/web/src/__tests__/TenantDashboard.test.tsx` - 24 tests for dashboard page, card grid, table, modal, health dot
- `apps/web/src/__tests__/TenantDetail.test.tsx` - 9 tests for detail page, tabs, breadcrumb, audit integration

## Decisions Made
- TenantCard uses router.push for navigation rather than wrapping in Link, enabling click handler on entire card div with stopPropagation on remove button
- TenantTable uses client-side sorting by column header click (no server-side sort) since tenant count is small for MVP
- Tenant detail page reuses Phase 3 audit dashboard components directly (ScoreOverview, ZtaMaturityRadar, FrameworkBreakdown, AuditResults) via useAudit(tenantId) -- no duplication
- Tab navigation on detail page is client-side state rather than URL routing for simplicity

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed broken apiPatch reference in linter-generated wizard-state code**
- **Found during:** Task 1 (TypeScript compilation check)
- **Issue:** Linter auto-generated wizard-state API functions in tenant-api.ts referencing non-existent `apiPatch` import
- **Fix:** Changed `apiPatch` calls to `apiClient.put` (for methods existing on apiClient), and added `apiPatch`/`patch` method to api-client.ts
- **Files modified:** apps/web/src/lib/tenant-api.ts, apps/web/src/lib/api-client.ts
- **Verification:** TypeScript compiles with only pre-existing errors (OnboardingWizard from Plan 04-04)
- **Committed in:** 147fb04 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Linter-generated code for Plan 04-04 created a build error. Fix was minimal and necessary for TypeScript compilation. No scope creep.

## Issues Encountered
- Pre-existing OnboardingWizard.test.tsx and useOnboarding.ts files (from Plan 04-04 linter auto-generation) reference components that don't exist yet. These cause TypeScript errors but are out of scope for this plan.
- Pre-existing 4 audit-routes test failures (confirmed present before this plan) -- unrelated to this plan's scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- /tenants dashboard ready for MSP use: card grid, table toggle, health indicators, navigation to detail page
- /tenants/:id ready for drill-down: reuses all Phase 3 compliance components with tenant context
- RemoveTenantModal confirmation pattern ready for use in Plan 04-04 wizard
- Tenant API client (tenant-api.ts) has all functions needed for Plan 04-04 onboarding wizard

## Self-Check: PASSED

All 12 created/modified files verified present. Both task commits (147fb04, 6b1f5f5) verified in git log.

---
*Phase: 04-tenant-onboarding-and-management*
*Completed: 2026-03-12*
