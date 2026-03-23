---
phase: 05-dashboard-and-findings-ux
plan: 03
subsystem: ui, api
tags: [action-queue, hono, react, vitest, cross-tenant, dismiss, severity]

# Dependency graph
requires:
  - phase: 05-dashboard-and-findings-ux
    provides: actionQueueDismissals schema table, criticalFindingsCount column on tenants
provides:
  - ActionQueueItem shared type exported from @omzig/shared
  - GET /api/action-queue endpoint computing items from tenant data
  - POST /api/action-queue/:itemId/dismiss idempotent dismiss endpoint
  - ActionQueue collapsible panel component with severity indicators
  - useActionQueue hook with optimistic dismiss
  - action-queue-api.ts fetch/dismiss client functions
  - ActionQueue integrated into /tenants dashboard page
affects: [05-dashboard-and-findings-ux]

# Tech tracking
tech-stack:
  added: []
  patterns: [computed-action-items-from-control-plane, optimistic-dismiss, severity-sorted-queue]

key-files:
  created:
    - packages/shared/src/types/action-queue.ts
    - apps/api/src/routes/action-queue.ts
    - apps/api/src/__tests__/action-queue.test.ts
    - apps/web/src/lib/action-queue-api.ts
    - apps/web/src/hooks/useActionQueue.ts
    - apps/web/src/components/tenants/ActionQueue.tsx
    - apps/web/src/__tests__/ActionQueue.test.tsx
  modified:
    - packages/shared/src/index.ts
    - packages/db/src/index.ts
    - apps/api/src/app.ts
    - apps/api/src/routes/tenants.ts
    - apps/web/src/app/tenants/page.tsx

key-decisions:
  - "Action items computed in-memory from control plane tenants table (no per-tenant DB queries)"
  - "Severity sort order: critical (findings) > high (needs_reauth) > warning (stale_audit)"
  - "Stale audit threshold: 7 days or null lastAuditAt for active tenants"
  - "Dismiss is idempotent (no error on re-dismiss)"

patterns-established:
  - "Computed action items: derive queue items from tenant metadata without separate queue table"
  - "Dismiss overlay: query dismissals table, overlay on computed items, filter unless includeDismissed=true"
  - "Optimistic dismiss: remove from local state immediately, revert on API failure"

requirements-completed: [DASH-10]

# Metrics
duration: 7min
completed: 2026-03-12
---

# Phase 5 Plan 3: Action Queue Summary

**Cross-tenant action queue with severity-sorted items, idempotent dismiss, and collapsible dashboard panel**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-12T15:31:46Z
- **Completed:** 2026-03-12T15:39:00Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- ActionQueueItem type and GET/POST API endpoints computing items from tenant data with dismiss persistence
- ActionQueue collapsible panel with red/orange/yellow severity indicators, top-5 default with View All
- Full TDD test coverage: 12 API tests + 14 frontend component tests, 101 total web tests green

## Task Commits

Each task was committed atomically:

1. **Task 1: Action queue shared types, API endpoints, and backend tests** - `32eb122` (feat)
2. **Task 2: ActionQueue frontend component, hook, and tenant dashboard integration** - `dd38175` (feat)

## Files Created/Modified
- `packages/shared/src/types/action-queue.ts` - ActionQueueItem interface with computed ID, type, severity, dismiss
- `packages/shared/src/index.ts` - Re-export ActionQueueItem type
- `packages/db/src/index.ts` - Export actionQueueDismissals table
- `apps/api/src/routes/action-queue.ts` - GET /api/action-queue + POST dismiss endpoints
- `apps/api/src/app.ts` - Register action-queue routes in protected section
- `apps/api/src/routes/tenants.ts` - Wire criticalFindingsCount from DB column
- `apps/api/src/__tests__/action-queue.test.ts` - 12 Vitest tests for API routes
- `apps/web/src/lib/action-queue-api.ts` - fetchActionQueue and dismissActionQueueItem client functions
- `apps/web/src/hooks/useActionQueue.ts` - Hook with optimistic dismiss and rollback
- `apps/web/src/components/tenants/ActionQueue.tsx` - Collapsible panel with severity indicators
- `apps/web/src/app/tenants/page.tsx` - Integrated ActionQueue above tenant grid
- `apps/web/src/__tests__/ActionQueue.test.tsx` - 14 Vitest component tests

## Decisions Made
- Action items computed in-memory from control plane tenants table (PITFALL 5 from RESEARCH.md: no per-tenant DB queries)
- Severity sort: critical > high > warning, then by createdAt descending
- Stale audit threshold: 7 days or null lastAuditAt for active tenants
- Dismiss is idempotent (returns 200 on re-dismiss without inserting duplicate row)
- resolveUser helper extracts both orgId and userId from JWT for dismiss tracking

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Action queue fully functional with API backing and dashboard integration
- Phase 5 now complete (Plans 01, 02, 03 all done)
- Ready for Phase 6 (remediation and drift detection)

## Self-Check: PASSED

All 13 files verified present. Both task commits (32eb122, dd38175) verified in git log.

---
*Phase: 05-dashboard-and-findings-ux*
*Completed: 2026-03-12*
