# Codebase Concerns

**Analysis Date:** 2026-03-23

## Tech Debt

**User profile lookup always returns null:**
- Issue: `getUserProfile()` is a stub that unconditionally returns `null`. The in-memory `tenantOverrides` Map is used for role overrides in production code paths, which resets on every API restart.
- Files: `apps/api/src/services/user.ts` (line 27)
- Impact: Per-tenant role overrides are lost on API restart. User profile data is never populated from the database.
- Fix approach: Wire `getUserProfile` and `getTenantRoleOverride` to the control plane `users` and `tenantUserAccess` tables (both schema and queries already exist in `packages/db/src/control-plane/schema.ts`).

**`frameworkScores` always null in tenant summaries:**
- Issue: `toTenantSummary()` hardcodes `frameworkScores: null` with a comment "Populated when lastAuditScore is wired per plan note."
- Files: `apps/api/src/routes/tenants.ts` (line 78)
- Impact: Dashboard tenant cards cannot display per-framework scores; the field exists in the API contract but never carries data.
- Fix approach: After each audit completes, back-fill `lastAuditScore` and per-framework scores onto the control plane `tenants` row. The audit runner already has the data; it just never writes it back to the control plane.

**`lastAuditScore` and `criticalFindingsCount` never updated by audit pipeline:**
- Issue: The audit runner (`packages/audit/src/pipeline/audit-runner.ts`) writes all findings and maturity scores to the tenant DB but never updates the control plane `tenants.lastAuditScore` or `tenants.criticalFindingsCount` columns.
- Files: `packages/audit/src/pipeline/audit-runner.ts` (lines 180–208), `packages/db/src/control-plane/schema.ts` (lines 57–59)
- Impact: Action queue "critical findings" items (computed from `criticalFindingsCount`) are always 0. The `lastAuditAt` column is also never updated; all active tenants will always appear as "stale audit" in the action queue.
- Fix approach: At pipeline completion, execute a cross-database update on the control plane to write the final score, critical count, and `lastAuditAt` timestamp.

**Token manager `refreshIfNeeded()` is a no-op stub:**
- Issue: `TokenManager.refreshIfNeeded()` returns the original access token unconditionally. Comment says "Phase 4: add auto-refresh."
- Files: `packages/audit/src/pipeline/token-manager.ts` (line 23)
- Impact: Long-running audits (~101 controls + Graph API calls) may fail with token expiry mid-run. The token passed at audit start may expire before the pipeline finishes.
- Fix approach: Implement MSAL silent token refresh using the stored refresh token from Key Vault. The Key Vault infrastructure for storing tokens already exists in `apps/api/src/services/keyvault.ts`.

**Audit check retry endpoint is a placeholder:**
- Issue: `POST /tenants/:tenantId/audits/:auditId/checks/:controlId/retry` returns 202 with `status: 'retrying'` but performs no actual retry logic.
- Files: `apps/api/src/routes/audits.ts` (lines 239–264)
- Impact: The UI allows users to initiate a retry; the operation silently does nothing. Tests pass because they only verify the 202 response, not that work occurred.
- Fix approach: Wire the retry to re-run the single evaluator for the given `controlId` against the current tenant facts and persist the updated finding.

**Two overlapping tenant provisioning services:**
- Issue: Both `apps/api/src/services/tenant-db.ts` and `apps/api/src/services/tenant-provisioning.ts` implement similar tenant provisioning logic (create DB, migrate schema, store token, insert record). The route handler uses `tenant-provisioning.ts`; `tenant-db.ts` appears to be a superseded earlier implementation.
- Files: `apps/api/src/services/tenant-db.ts`, `apps/api/src/services/tenant-provisioning.ts`
- Impact: Maintenance burden — two copies of database creation logic with slight differences (naming prefix `t_` vs `tenant_`, different raw SQL patterns). Risk of divergence.
- Fix approach: Determine which is canonical (route handler uses `tenant-provisioning.ts`), remove `tenant-db.ts`, and update any references.

**`setupWizardState.stepsCompleted` stored as JSON string in NVARCHAR:**
- Issue: The `stepsCompleted` column is typed `nvarchar(500)` and stores a JSON-serialized array. The route manually `JSON.parse`/`JSON.stringify`s this value. Column length of 500 characters may be too short if step metadata grows.
- Files: `packages/db/src/control-plane/schema.ts` (line 89), `apps/api/src/routes/wizard-state.ts`
- Impact: JSON parse errors or silent truncation if step data exceeds 500 characters. No type safety on the stored structure.
- Fix approach: Expand the column to `nvarchar(max)` or introduce a separate `wizard_steps` junction table. Validate the stored size in tests.

**Dismissed action queue items never expire:**
- Issue: `actionQueueDismissals` table has no expiry or TTL column. A dismissal for `critical-{tenantId}` persists indefinitely even if new critical findings appear after a subsequent audit.
- Files: `packages/db/src/control-plane/schema.ts` (lines 96–103), `apps/api/src/routes/action-queue.ts` (lines 159–176)
- Impact: After an audit resolves a critical finding and then new critical findings appear, the action queue item remains dismissed because the `itemKey` is the same (`critical-{tenantId}`).
- Fix approach: Add `dismissedAt`/`expiresAt` to dismissals, or make item keys include the `lastAuditAt` timestamp so they auto-expire when a new audit runs.

**`drizzle-orm` pinned to `"beta"` tag across all packages:**
- Issue: Three packages (`apps/api`, `packages/db`, `packages/audit`) specify `"drizzle-orm": "beta"` — a floating pre-release tag, not a pinned version.
- Files: `apps/api/package.json` (line 20), `packages/db/package.json` (line 15), `packages/audit/package.json` (line 26)
- Impact: A new beta release could silently break the build or runtime behavior. The `pnpm-lock.yaml` freezes the version at install time, but any fresh `pnpm install` after a new beta ships will pick up the new version.
- Fix approach: Run `pnpm ls drizzle-orm --json` to identify the currently resolved version, then pin to that exact version string (e.g., `"0.38.0-beta.1"`).

**`@microsoft/microsoft-graph-types-beta` pinned to `"*"` (any version):**
- Issue: `packages/audit/package.json` specifies `"@microsoft/microsoft-graph-types-beta": "*"`, accepting any version.
- Files: `packages/audit/package.json` (line 24)
- Impact: Microsoft regularly updates the beta types package. A breaking type change in the beta types could fail the build without notice.
- Fix approach: Pin to the currently resolved version from `pnpm-lock.yaml`.

**Deprecated UI components kept in source:**
- Issue: Three UI files are marked `@deprecated` but remain in the source tree: `FrameworkSelector.tsx`, `FrameworkFilter.tsx`, and the `FrameworkSelection` / `AuditRunDetail` types in `lib/types.ts`.
- Files: `apps/web/src/components/audit/FrameworkSelector.tsx`, `apps/web/src/components/audit/FrameworkFilter.tsx`, `apps/web/src/lib/types.ts` (lines 12, 53)
- Impact: Increases bundle size and creates confusion about which component to use. New contributors may reference deprecated components.
- Fix approach: Verify no non-deprecated code imports these, then delete them.

## Known Bugs

**GDAP onboarding uses user JWT `access_token` claim as Graph token:**
- Symptoms: GDAP verification silently falls back to the literal string `'platform-token'` as the Graph API access token when the JWT payload does not carry an `access_token` claim (which it normally does not in a standard Entra ID JWT).
- Files: `apps/api/src/routes/tenants.ts` (line 451)
- Trigger: Any GDAP verification request in production.
- Workaround: None — the fallback value `'platform-token'` will cause the Graph API call to fail with 401. The error is caught and returned as a GDAP_ERROR.

**OAuth callback DB update failure is silently swallowed:**
- Symptoms: If the database update in the OAuth callback fails (e.g., DB unavailable), the callback redirects the user to the success URL anyway. The tenant record keeps its empty `m365TenantId`.
- Files: `apps/api/src/routes/oauth-callback.ts` (lines 72–84)
- Trigger: Any transient database error during OAuth callback processing.
- Workaround: The provisioning step will attempt to set `m365TenantId` again, but only if the user manually proceeds through the wizard.

**Audit pipeline failures are not observable from the control plane:**
- Symptoms: If `runAuditPipeline` throws before updating the audit run to `failed`, the run record stays in `running` status indefinitely. The fire-and-forget `catch` in `audits.ts` only logs to `console.error`.
- Files: `apps/api/src/routes/audits.ts` (line 91), `packages/audit/src/pipeline/audit-runner.ts` (lines 192–203)
- Trigger: DB connection failure at pipeline start (before the `try` block opens the tenant DB successfully), or failure within the outer catch handler itself.
- Workaround: Manual SQL update to fix stuck `running` status.

**`warn` and `na` findings counted as `errorChecks`:**
- Symptoms: The audit runner counts `warn` and `na` findings together with actual errors in the `errorChecks` field. This inflates the `errorChecks` count shown on the audit run record and displayed in the UI.
- Files: `packages/audit/src/pipeline/audit-runner.ts` (line 83)
- Trigger: Any audit run where controls produce `warn` or `na` results.
- Workaround: None currently.

## Security Considerations

**SignalR access key used with symmetric JWT signing:**
- Risk: The `SIGNALR_ACCESS_KEY` environment variable is used as a symmetric HS256 signing key for both server-to-SignalR push tokens and client negotiate tokens. If this key is compromised, an attacker can forge tokens to impersonate any user via the SignalR hub.
- Files: `apps/api/src/services/signalr.ts` (lines 48, 92)
- Current mitigation: Key is stored in environment variables; not committed to source.
- Recommendations: Rotate `SIGNALR_ACCESS_KEY` periodically. Consider using Azure SignalR's managed identity support to eliminate the symmetric key entirely.

**OAuth client secret used as HMAC signing key for state parameter:**
- Risk: The `OAUTH_CLIENT_SECRET` doubles as the HMAC-SHA256 key for OAuth state signing. If the client secret needs rotation (e.g., expiry or compromise), it simultaneously invalidates any in-flight consent flows.
- Files: `apps/api/src/services/oauth-consent.ts` (lines 85–97, 110–118)
- Current mitigation: State parameter has a 1-hour expiry. Timing-safe comparison prevents timing attacks.
- Recommendations: Use a dedicated state-signing secret separate from the OAuth client secret.

**No rate limiting on authentication and tenant provisioning endpoints:**
- Risk: `POST /api/tenants/:id/provision` and `POST /api/tenants/:id/onboard/gdap` trigger Key Vault writes and Azure SQL database creation with no rate limiting. An authenticated attacker (with Admin role) could spam provisioning to exhaust elastic pool capacity or Key Vault write quotas.
- Files: `apps/api/src/routes/tenants.ts` (lines 504–640), `apps/api/src/app.ts`
- Current mitigation: RBAC middleware requires Owner or Admin role.
- Recommendations: Add per-org rate limiting on provisioning endpoints (e.g., max 10 provisions per hour per org).

**`tenant-db.ts` uses raw string interpolation in SQL CREATE DATABASE:**
- Risk: The database name is generated as a UUID-based string but is interpolated directly into a T-SQL statement using a template literal: `` `IF NOT EXISTS ... CREATE DATABASE [${databaseName}]` ``. If the database name generation ever changes to include user-supplied data, this becomes a SQL injection vector.
- Files: `apps/api/src/services/tenant-db.ts` (lines 63–65)
- Current mitigation: Database names are UUID-derived (`tenant_` + 16 hex chars). No user input reaches this code path currently.
- Recommendations: Validate the database name matches the expected UUID-hex pattern before interpolation. Use parameterized DDL where the driver supports it.

**`.env.example` does not document all required secrets:**
- Risk: `.env.example` only lists 9 variables but the application requires additional secrets at runtime (`OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `OAUTH_REDIRECT_URI`, `ELASTIC_POOL_NAME`, `SQL_USERNAME`, `SQL_PASSWORD`, `KEY_VAULT_KEY_NAME`, `SIGNALR_ENDPOINT`, `SIGNALR_ACCESS_KEY`). A developer relying on `.env.example` as the canonical list will have an incomplete local setup.
- Files: `.env.example`
- Current mitigation: Variables are documented individually in service files via error messages.
- Recommendations: Update `.env.example` to list all required and optional variables with comments.

## Performance Bottlenecks

**Audit pipeline persists one finding per DB round-trip (~101 inserts):**
- Problem: The pipeline evaluates 101 controls in a serial loop and calls `db.insert(auditFindings)` individually for each result. No bulk insert is used.
- Files: `packages/audit/src/pipeline/audit-runner.ts` (lines 94–112, 116–130)
- Cause: Simple sequential design; drizzle-orm supports bulk inserts via `.values([...])` with an array.
- Improvement path: Collect all finding rows into an array and execute a single `db.insert(auditFindings).values(findingsBatch)` call after the evaluation loop.

**Per-request tenant DB connection with no connection pooling:**
- Problem: Each API request to a tenant-scoped endpoint creates a new `mssql.ConnectionPool`, connects, executes queries, and closes the pool. At scale with many concurrent requests across many tenants, this creates significant connection overhead.
- Files: `packages/db/src/connection.ts` (lines 108–121), `apps/api/src/middleware/tenant.ts` (implied by architecture)
- Cause: Intentional design for isolation ("bursty workloads, many tenants"), but the comment acknowledges no caching.
- Improvement path: Implement a short-lived tenant connection cache (e.g., LRU with 5-minute TTL) or use Azure SQL connection pooling at the infrastructure level.

**Audit list endpoint has no pagination:**
- Problem: `GET /tenants/:tenantId/audits` returns all audit runs for a tenant with no limit, offset, or cursor parameter.
- Files: `apps/api/src/routes/audits.ts` (lines 114–131)
- Cause: Current implementation is a simple `SELECT * ... ORDER BY createdAt DESC` with no page controls.
- Improvement path: Add `?limit=` and `?cursor=` (keyset pagination on `createdAt`) to the endpoint.

**RateLimiter tracks cumulative requests but inserts only 1-second delays:**
- Problem: `RateLimiter.checkThreshold()` introduces a flat 1-second delay per evaluation once 80% of a 10,000-request limit is reached. This does not implement true exponential backoff or respect the Graph API `Retry-After` header.
- Files: `packages/audit/src/pipeline/rate-limiter.ts` (lines 21–24)
- Cause: Simplified implementation that ignores 429 response headers.
- Improvement path: Catch 429 responses from the Graph client and respect the `Retry-After` header value before retrying.

## Fragile Areas

**Fire-and-forget audit pipeline with no recovery mechanism:**
- Files: `apps/api/src/routes/audits.ts` (line 91), `packages/audit/src/pipeline/audit-runner.ts`
- Why fragile: If the API server restarts while an audit is running, the pipeline is killed. The audit run stays in `running` status with no way to restart it or surface the failure to the user. The SignalR push will silently fail.
- Safe modification: Do not add more async side-effects inside the same fire-and-forget pattern. Any new background work should use a proper job queue (e.g., Azure Queue Storage or Service Bus).
- Test coverage: No test for mid-run server crash recovery.

**Optimistic locking in wizard-state relies on client-supplied `updatedAt`:**
- Files: `apps/api/src/routes/wizard-state.ts`
- Why fragile: The 409 conflict detection compares the DB row's `updatedAt` against a client-provided timestamp. If the client sends a stale or fabricated `updatedAt`, the conflict check can be bypassed.
- Safe modification: Fetch `updatedAt` server-side from the DB row and compare before the update rather than trusting the client value.
- Test coverage: Concurrent modification test exists but does not test with a fabricated timestamp.

**`resolveOrgId` called on every request with no caching:**
- Files: `apps/api/src/routes/tenants.ts` (line 50), `apps/api/src/routes/action-queue.ts` (line 34), `apps/api/src/routes/wizard-state.ts` (line 33)
- Why fragile: Every authenticated route handler calls `resolveOrgId` which issues a `SELECT` against the control plane `users` table. This is duplicated across three route files with identical implementations. A DB slowdown causes all route handlers to stall.
- Safe modification: Extract `resolveOrgId` to middleware that attaches `orgId` to the request context once per request. Cache the result per JWT `oid` claim.
- Test coverage: Mocked in tests; no performance test.

**Control plane DB singleton does not handle reconnection:**
- Files: `packages/db/src/connection.ts` (lines 71–98)
- Why fragile: `getControlPlaneDb()` is a singleton. If the connection pool is dropped (Azure SQL idle timeout, transient network failure), subsequent requests will fail because the cached `controlPlaneDb` instance holds a dead pool reference.
- Safe modification: Add a pool health check before returning the singleton, or implement a reconnect wrapper.
- Test coverage: Not tested.

## Scaling Limits

**Azure SQL elastic pool — no documented capacity limits:**
- Current capacity: One elastic pool; each tenant gets its own database.
- Limit: Azure SQL elastic pools support a maximum of 500 databases per pool on most tiers. With no database cleanup for soft-deleted tenants (30-day retention), deleted tenants continue consuming a database slot.
- Scaling path: Add a scheduled purge job for databases where `deletedAt` is older than 30 days, or migrate to a second elastic pool when approaching the 500-database limit.

**SignalR push does not queue or retry failed pushes:**
- Current capacity: One push attempt per audit progress event.
- Limit: If the Azure SignalR REST API returns a non-200, the error is thrown and silently caught by the fire-and-forget `catch`. Progress events are lost.
- Scaling path: Wrap `pushAuditProgress` with a retry loop (max 3 attempts, exponential backoff) or use Azure SignalR's native message queue feature.

## Dependencies at Risk

**`drizzle-orm` at `"beta"` tag (MSSQL support):**
- Risk: Drizzle ORM's Node.js MSSQL adapter (`drizzle-orm/node-mssql`) is less battle-tested than the PostgreSQL adapters. The beta tag means breaking changes between releases are expected.
- Impact: Any `pnpm install` after a new beta release can break DB queries across `packages/db`, `apps/api`, and `packages/audit`.
- Migration plan: Pin to an exact version. Monitor the drizzle-orm GitHub for MSSQL-specific issues. Consider evaluating Prisma or direct `mssql` queries as a fallback if the beta quality is problematic.

**`@azure/msal-node` at `^5.0.6`:**
- Risk: MSAL Node is actively developed. The `^` range allows minor and patch updates which Microsoft has used to introduce breaking changes (e.g., the v2-to-v3 token cache format change).
- Impact: `apps/api/src/services/oauth-consent.ts` token exchange may break on silent MSAL update.
- Migration plan: Pin MSAL to an exact version and test upgrades explicitly.

## Missing Critical Features

**No database migration for `actionQueueDismissals` in the control plane:**
- Problem: The `actionQueueDismissals` table is defined in schema but only one migration file exists (`0004_add_tenant_status_columns.sql`). If new deployments run migrations from scratch, this table may be missing unless the initial schema creation includes all tables.
- Blocks: Action queue dismiss functionality in production deployments bootstrapped from migrations.

**Phase 7 and Phase 8 functions are entirely absent (not stubbed):**
- Problem: The Azure Functions for `Deploy-Users`, `Deploy-Exchange`, `Deploy-Autopilot`, `Deploy-Collaboration`, `Deploy-Lighthouse`, and `Generate-Documentation` are listed in `CLAUDE.md` as "Planned (0%)" but do not exist in the repository at all. The `Deploy-Data` and `Deploy-Security` functions exist but mark their core operations as `status = "Planned"` without executing them.
- Blocks: The product cannot fulfill its stated purpose (complete operational M365 setup) until these are implemented.

**No soft-delete purge job exists:**
- Problem: `deprovisionTenant` sets `isDeleted=true` with a "30-day retention policy" comment, but no scheduled function or job exists to actually drop the database and delete the Key Vault secret after 30 days.
- Blocks: Deleted tenant databases accumulate indefinitely, consuming elastic pool slots and Key Vault secret quota.

**`Deploy` and `Reports` UI pages are "Coming Soon" stubs:**
- Problem: `apps/web/src/app/deploy/page.tsx` and `apps/web/src/app/reports/page.tsx` render placeholder text with no functionality.
- Blocks: Policy deployment workflow and compliance reporting are not accessible through the UI.

## Test Coverage Gaps

**No integration tests for GDAP token acquisition:**
- What's not tested: The `access_token` claim fallback to `'platform-token'` in `POST /api/tenants/:id/onboard/gdap` is not tested as a failure scenario. Tests mock `verifyGdapRelationship` entirely.
- Files: `apps/api/src/__tests__/tenant-routes.test.ts`
- Risk: The production GDAP code path (where `jwtPayload.access_token` is undefined) will always fail silently.
- Priority: High

**No tests for audit pipeline mid-run failure recovery:**
- What's not tested: What happens when `runAuditPipeline` fails after inserting some findings but before completing. The audit run is left in an inconsistent state.
- Files: `packages/audit/src/__tests__/audit-runner.test.ts`
- Risk: Partial audit runs with mixed `running`/stale data appear as completed in the UI.
- Priority: High

**No tests for PowerShell functions Deploy-Exchange, Deploy-Users, Deploy-Autopilot, Deploy-Collaboration:**
- What's not tested: These functions do not exist yet; no Pester tests are planned until Phase 7.
- Files: `functions/Tests/` (only Deploy-Identity, Deploy-Devices, Deploy-Baselines covered)
- Risk: When implemented, these functions will deploy irreversible M365 configuration changes with no test coverage.
- Priority: High (when implementation begins)

**No tests for control plane DB connection failure:**
- What's not tested: `getControlPlaneDb()` singleton behavior when the connection pool drops mid-operation.
- Files: `packages/db/src/connection.ts`
- Risk: Silent failures or hanging requests in production if Azure SQL becomes transiently unavailable.
- Priority: Medium

---

*Concerns audit: 2026-03-23*
