---
phase: 06-scheduling-reporting-and-trending
plan: 01
subsystem: scheduling
tags: [scheduler, scan-automation, settings, tenant]
requires:
  - control-plane DB tenants table
  - runAuditPipeline (@omzig/audit)
  - existing rbac middleware (Admin role)
provides:
  - in-process scheduler with concurrency control
  - GET/PATCH /api/tenants/:tenantId/schedule
  - ScheduleSettings React component
affects:
  - apps/api/src/index.ts (boot)
  - apps/api/src/app.ts (route registration)
  - tenants table schema (2 new columns)
tech-stack:
  added: []
  patterns:
    - "Synchronous counter increment before async fire-and-forget (concurrency guard)"
    - "Update DB scheduleNextRunAt BEFORE pipeline launch (race guard)"
    - "Server component shell with generateStaticParams for static export compatibility"
key-files:
  created:
    - packages/db/src/control-plane/migrations/0006_add_schedule_columns.sql
    - apps/api/src/services/scheduler.ts
    - apps/api/src/routes/schedule.ts
    - apps/api/src/__tests__/scheduler.test.ts
    - apps/api/src/__tests__/schedule-routes.test.ts
    - apps/web/src/components/tenants/ScheduleSettings.tsx
    - apps/web/src/app/tenants/[id]/page.tsx
    - apps/web/src/app/tenants/[id]/TenantDetailClient.tsx
  modified:
    - packages/db/src/control-plane/schema.ts
    - apps/api/src/app.ts
    - apps/api/src/index.ts
decisions:
  - "Use module-level setInterval polling rather than a separate worker process; revisit when API scales horizontally"
  - "Scheduler stub token resolver returns placeholder; real Key Vault + MSAL flow deferred to a follow-up plan"
  - "Tenant detail page split into TenantDetailClient + server-component page.tsx so generateStaticParams() can satisfy Next.js static export"
metrics:
  duration: ~25 minutes
  completed: 2026-04-14
  tasks_completed: 2
  files_changed: 11
  tests_added: 18
  tests_passing: 144
---

# Phase 6 Plan 01: Scheduled Scans Summary

Add automated scan scheduling so MSPs can configure daily or weekly audit
scans per tenant that execute automatically with concurrency limits and
stagger to protect downstream Graph API rate budgets.

## What was built

### Database schema
- New columns `schedule_frequency VARCHAR(10) NULL` and
  `schedule_next_run_at DATETIME2 NULL` on the `tenants` table
- Migration `0006_add_schedule_columns.sql`
- Drizzle schema updated with `scheduleFrequency` and `scheduleNextRunAt`

### Scheduler service (`apps/api/src/services/scheduler.ts`)
- `computeNextRun(frequency, fromDate)` -- pure helper exported for the
  schedule route
- `pollForDueScans()` -- queries control-plane for tenants where
  `scheduleFrequency IS NOT NULL` AND `scheduleNextRunAt <= NOW()` AND
  `isDeleted = false` AND `status = 'active'` AND `databaseName IS NOT NULL`
- `launchScan(tenant)` -- synchronously increments the running counter
  before any await, ensuring `pollForDueScans`'s `runningCount < MAX_CONCURRENT`
  check sees an accurate count even before the async work begins
- `executeScan(tenant)` -- updates `scheduleNextRunAt` to the next computed
  time **before** calling `runAuditPipeline` (race-condition guard against
  re-pickup), creates an audit run row in the tenant DB with
  `triggeredBy: 'scheduler'`, then runs the pipeline. In `finally` it
  decrements the counter and drains the next queued tenant after a
  `STAGGER_MS` (5 minute) `setTimeout`
- `startScheduler()` / `stopScheduler()` -- idempotent lifecycle, installs
  a 60-second `setInterval` polling timer
- All errors inside the poll loop are caught and logged (PITFALL 2)
- `getSchedulerAccessToken(tenant)` is a stub that logs a warning and
  returns a placeholder; a follow-up plan will integrate with Key Vault
  and MSAL refresh

### Schedule API route (`apps/api/src/routes/schedule.ts`)
- `GET /api/tenants/:tenantId/schedule` -- returns
  `{ frequency, nextRunAt }` for the tenant; org-scoped via
  `resolveOrgId` helper; 404 for unknown tenants
- `PATCH /api/tenants/:tenantId/schedule` -- Admin-only, accepts
  `{ frequency: 'daily' | 'weekly' | 'disabled' }` zod-validated. For
  `daily`/`weekly` sets the column and computes
  `scheduleNextRunAt = computeNextRun(freq, now)`. For `disabled` clears
  both columns

### App wiring
- `createApp()` registers `scheduleRoutes` under `/api` after tenants routes
- `index.ts` calls `startScheduler()` inside the `serve()` callback so the
  scheduler boots once per API instance

### Web UI
- `ScheduleSettings.tsx` -- client component that loads the current schedule
  on mount via `apiClient.get`, renders a `<select>` (Disabled / Daily /
  Weekly) plus Save button, PATCHes on save, displays the formatted next-run
  time when a schedule is active, and shows inline success/error feedback
  in green/red text. Uses Lucide `Clock` icon
- Tenant detail page restored from commit 6b1f5f5. The page is now split
  into `TenantDetailClient.tsx` (client component, all UI logic) and
  `page.tsx` (server component shell that re-exports the client component
  and provides `generateStaticParams() => []` for Next.js static export
  compatibility). The Settings tab now contains the original tenant info
  card plus the new `ScheduleSettings` card

## Test results

### New tests added
- `apps/api/src/__tests__/scheduler.test.ts` -- 9 tests
  - `computeNextRun` daily / weekly arithmetic
  - `pollForDueScans` respects MAX_CONCURRENT=3 with 5 due tenants
  - `pollForDueScans` updates `scheduleNextRunAt` before launching pipeline
  - `pollForDueScans` swallows errors without throwing
  - `startScheduler` / `stopScheduler` install/clear setInterval timer
  - `startScheduler` is idempotent
  - Queue draining: 6 due tenants -> 3 launched, 3 queued
- `apps/api/src/__tests__/schedule-routes.test.ts` -- 9 tests
  - GET returns current frequency/nextRunAt
  - GET returns null fields when no schedule
  - GET 404 for unknown tenant
  - PATCH daily computes ~24h next run
  - PATCH weekly computes ~7d next run
  - PATCH disabled clears both columns
  - PATCH invalid frequency -> 400
  - PATCH 404 for unknown tenant
  - PATCH 403 for Analyst role

### Suite results
- `pnpm --filter @omzig/api test` -- **144/144 passing** (15 files,
  +18 new tests, no regressions)
- `apps/web/src/__tests__/TenantDetail.test.tsx` -- **9/9 passing**
  (the restored page satisfies the existing test fixture)

## Commits

| Hash | Message |
|------|---------|
| `9ca1f15` | feat(06-01): add schedule columns and scheduler service |
| `026c24d` | feat(06-01): schedule API route, settings UI, scheduler boot |

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 - Blocking] Restored deleted tenant detail page**
- **Found during:** Task 2
- **Issue:** The plan's instruction to "wire ScheduleSettings into the
  Settings tab of `apps/web/src/app/tenants/[id]/page.tsx`" presumed the
  page existed, but it had been removed in commit `9113c59` ("Fix audit:
  run evaluators client-side") to support the SWA static-export build.
  Without the page, ScheduleSettings could not be wired in
- **Fix:** Restored the previous page from commit `6b1f5f5` and added the
  ScheduleSettings card to the Settings tab. To satisfy the static-export
  constraint, the implementation file was renamed to
  `TenantDetailClient.tsx` (client component) and a new `page.tsx` server
  component was added that exports `generateStaticParams() => []` and
  re-renders the client component
- **Files modified:** `apps/web/src/app/tenants/[id]/page.tsx`,
  `apps/web/src/app/tenants/[id]/TenantDetailClient.tsx`
- **Commit:** `026c24d`

**2. [Rule 1 - Bug] Synchronous counter increment in scheduler**
- **Found during:** Task 1 (RED -> GREEN cycle)
- **Issue:** Initial scheduler implementation incremented `runningCount`
  inside `executeScan()` after the function had already gone async,
  meaning `pollForDueScans()`'s `if (runningCount < MAX_CONCURRENT)`
  check never saw the updated count and would launch every tenant in the
  due-list in the same tick
- **Fix:** Introduced a `launchScan(tenant)` wrapper that bumps the
  counter synchronously before delegating to `executeScan()`. Tests now
  see the expected 3-launch / 3-queue behavior with 6 due tenants
- **Files modified:** `apps/api/src/services/scheduler.ts`
- **Commit:** `9ca1f15`

## Auth gates / human verification

None encountered. All work completed autonomously.

## Known stubs

1. `getSchedulerAccessToken(tenant)` in `apps/api/src/services/scheduler.ts`
   returns a placeholder string and logs a warning. **Tracked in
   `deferred-items.md`.** A follow-up plan must integrate Key Vault
   refresh-token retrieval + MSAL access-token exchange before the
   scheduler is enabled in production.

## Deferred Issues

See `.planning/phases/06-scheduling-reporting-and-trending/deferred-items.md`:

- Pre-existing `TenantDashboard.test.tsx` failure (missing
  `apps/web/src/app/tenants/page.tsx` listing page)
- Pre-existing `FindingDetail.test.tsx` URL-fragment assertion drift
- Pre-existing TS2556 in `TenantDetail.test.tsx:73` (test-file only,
  runtime tests pass)
- Scheduler open concerns: token refresh, multi-instance coordination,
  static-export incompatibility with dynamic routes

## Self-Check: PASSED

Verified files exist:
- FOUND: `packages/db/src/control-plane/schema.ts` (modified)
- FOUND: `packages/db/src/control-plane/migrations/0006_add_schedule_columns.sql`
- FOUND: `apps/api/src/services/scheduler.ts`
- FOUND: `apps/api/src/routes/schedule.ts`
- FOUND: `apps/api/src/app.ts` (modified)
- FOUND: `apps/api/src/index.ts` (modified)
- FOUND: `apps/api/src/__tests__/scheduler.test.ts`
- FOUND: `apps/api/src/__tests__/schedule-routes.test.ts`
- FOUND: `apps/web/src/components/tenants/ScheduleSettings.tsx`
- FOUND: `apps/web/src/app/tenants/[id]/page.tsx`
- FOUND: `apps/web/src/app/tenants/[id]/TenantDetailClient.tsx`

Verified commits:
- FOUND: `9ca1f15` -- feat(06-01): add schedule columns and scheduler service
- FOUND: `026c24d` -- feat(06-01): schedule API route, settings UI, scheduler boot

Verified tests:
- 9/9 scheduler.test.ts passing
- 9/9 schedule-routes.test.ts passing
- 144/144 full @omzig/api suite passing
- 9/9 TenantDetail.test.tsx (web) passing
