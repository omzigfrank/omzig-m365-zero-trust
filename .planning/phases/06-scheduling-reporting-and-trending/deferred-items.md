# Deferred Items - Phase 06

Items discovered during plan execution that are out of scope for the current
plan and should be tracked separately.

## From Plan 06-01: Scheduled Scans

### Pre-existing test failures (unrelated to scheduler/schedule routes)

1. **`apps/web/src/__tests__/TenantDashboard.test.tsx`** - Imports
   `@/app/tenants/page` which was removed in commit 9113c59 (static export
   refactor). The tenants list page needs to be restored as a separate
   plan. Out of scope for Plan 06-01.

2. **`apps/web/src/__tests__/FindingDetail.test.tsx`** - Two failing
   assertions about Conditional Access admin portal URL fragments. Pre-existing,
   unrelated to scheduling. Likely a registry URL update that drifted from
   the test fixture.

3. **`apps/web/src/__tests__/TenantDetail.test.tsx` line 73** - TypeScript
   `TS2556: A spread argument must either have a tuple type or be passed to
   a rest parameter` from a `vi.fn()` mock signature. Pre-existing test-only
   issue; runtime tests still pass.

### Scheduler open concerns (TODO for future plans)

1. **Token retrieval (`getSchedulerAccessToken` stub).** The scheduler
   currently logs a warning and returns a placeholder token. Production must:
   - Read the refresh token from Key Vault using `tenant.tokenSecretName`
   - Exchange it for an access token via MSAL confidential client
   - Hand off to `runAuditPipeline` so the pipeline's TokenManager can refresh
     it during the run

2. **Multi-instance coordination.** The current scheduler runs in-process with
   `setInterval` and uses a module-level `runningCount`. If the API is scaled
   to multiple instances on Container Apps, two instances could both pick
   the same tenant before the `scheduleNextRunAt` UPDATE commits. Production
   fixes:
   - Use a SQL `WITH (XLOCK, READPAST)` row hint on the SELECT
   - OR move scheduling to a Service Bus + Functions triggered model
   - OR pin the scheduler instance with a leader-election lock

3. **Static export incompatibility.** The web app uses `output: "export"` for
   SWA, but `apps/web/src/app/tenants/[id]/page.tsx` is a dynamic route. We
   added `generateStaticParams` returning `[]` so the build does not fail,
   but the page is not actually emitted as static HTML. Production deployment
   will need either:
   - Switch to SSR (drop `output: "export"`)
   - OR move tenant detail to a query-param style URL: `/tenants?id=...`
