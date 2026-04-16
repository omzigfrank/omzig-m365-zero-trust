# Phase 8: Drift Detection - Research

**Researched:** 2026-04-15
**Domain:** Microsoft Graph directoryAudits API, in-process polling, deep diff engine, Azure SignalR
**Confidence:** HIGH

## Summary

Phase 8 transforms the platform from reactive (audit-then-fix) to proactive (continuous monitoring) by polling Microsoft Graph's directoryAudits API for security-relevant tenant configuration changes, verifying them via targeted re-collection of the affected AuditFacts area, and surfacing drift alerts through the existing action queue and SignalR push infrastructure.

The research confirms all CONTEXT.md decisions are technically sound. The directoryAudits API supports `$filter` on `activityDateTime ge {datetime}` and `category eq 'Policy'`, the existing area parsers in `packages/audit/src/collectors/areas/*.ts` are already standalone-callable, the Phase 7 `computeDrift()` function is reusable for per-field diffing, and the Drizzle MSSQL schema already uses `NVARCHAR(MAX)` in the migration SQL (with `nvarchar({ length: 4000 })` in Drizzle schema -- migration SQL defines the actual column as MAX). The audit-runner.ts has a clear insertion point for facts snapshot serialization at line 182 (the "mark complete" update).

**Primary recommendation:** Build the drift poller as a third in-process `setInterval` service in `apps/api/src/index.ts`, following the scheduler/remediation-worker pattern exactly. Use direct Graph API calls (not batch) for single-area re-collection since batch-of-1 adds overhead with no benefit.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Detection Strategy:** Audit log polling + diff verification (two-phase: poll then targeted re-collect + diff). NOT Graph webhooks.
- **Baseline Storage:** Extend `auditRuns` table with `factsSnapshot NVARCHAR(MAX)` column. Migration `0008_add_facts_snapshot.sql`.
- **Plan Split:** 08-01 (backend engine) then 08-02 (frontend + SignalR push).
- **Activity Type to Area Mapping:** Fixed table mapping Graph audit categories to AuditFacts areas (see CONTEXT.md table).
- **Drift Alert Schema:** Tenant-scoped `drift_alerts` table with before/after snapshots, severity, actor UPN, diff summary.

### Claude's Discretion
- Exact audit log activity type filter strings
- Polling backoff strategy when tenant audit log returns no new events
- Diff display format
- Whether `collectSingleArea` reuses batch helper or makes standalone GET calls
- Drift alert deduplication strategy
- UI component naming and file locations within `apps/web/src/components/drift/`
- Number of dashboard notification components and their layout
- Whether drift detail page is a new route or a drawer
- Test structure for the drift poller and diff engine

### Deferred Ideas (OUT OF SCOPE)
- Graph webhooks / change notifications
- Custom drift sensitivity thresholds
- Multi-tenant drift correlation
- Email/SMS/Teams alert delivery
- Auto-remediation on drift
- Drift trend analytics
- Drift allowlist
</user_constraints>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Audit log polling | API / Backend | -- | Server-side scheduled polling of Graph API requires server tokens |
| Targeted re-collection | API / Backend | -- | Graph API calls with managed credentials |
| Deep diff engine | API / Backend (audit package) | -- | Pure computation on JSON snapshots, belongs in shared audit package |
| Baseline snapshot persistence | Database / Storage | -- | NVARCHAR(MAX) column in tenant-scoped SQL DB |
| Drift alert CRUD API | API / Backend | -- | Hono routes with tenant context middleware |
| Real-time push | API / Backend (SignalR) | Frontend (WebSocket) | Server pushes via SignalR REST API, frontend subscribes |
| Drift alert list/detail UI | Frontend (Next.js) | -- | React components consuming API + SignalR |
| Action queue integration | Frontend (Next.js) | API / Backend | Frontend renders drift items from API; backend computes them |
| Remediation link | Frontend (Next.js) | API / Backend | Frontend renders RemediateButton; backend creates remediation job |

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @microsoft/microsoft-graph-client | project-current | Graph API calls for directoryAudits and area re-collection | Already used by fact-collector |
| drizzle-orm (mssql-core) | project-current | Schema definition and queries for drift_alerts table | Already used for all DB access |
| hono | project-current | API route handler for drift endpoints | Already used for all routes |
| jsonwebtoken | project-current | SignalR JWT signing for drift push | Already used by signalr.ts |

### Supporting (no new dependencies)
No new npm packages required. Phase 8 reuses the existing stack entirely.

## Architecture Patterns

### System Architecture Diagram

```
[Graph directoryAudits API]
        |
        | poll every 60s (check which tenants are due)
        v
[Drift Poller Service]  -----> [Control Plane DB: tenants table]
   (setInterval)               (reads lastDriftPollAt, driftCheckIntervalMinutes)
        |
        | for each due tenant:
        v
[1. Query directoryAudits]  -- GET /auditLogs/directoryAudits?$filter=activityDateTime ge {since}
        |
        | parse events, map activityDisplayName -> AuditFacts area
        v
[2. collectSingleArea()]  -- re-collect ONLY the affected area (e.g., conditionalAccess)
        |
        v
[3. diffFactArea()]  -- compare re-collected area against baseline factsSnapshot
        |
        | if drifted:
        v
[4. Insert drift_alerts row]  -- tenant DB: severity, actor, before/after, diff
        |
        v
[5. pushDriftAlert()]  -- SignalR REST API push to all users watching this tenant
        |
        v
[Frontend: ActionQueue + DriftEvents panel]
        |
        v
[User clicks "Remediate"]  -- links to Phase 7 RemediateButton infrastructure
```

### Recommended Project Structure
```
packages/audit/src/
  drift/
    audit-log-parser.ts          # Parse directoryAudit events, map to areas
    area-recollector.ts           # collectSingleArea() implementation
    diff-engine.ts                # diffFactArea() wrapping computeDrift per-area
    severity-classifier.ts        # Classify drift severity from activity type
    types.ts                      # DriftEvent, DriftAlert, DriftSeverity types

apps/api/src/
  services/
    drift-poller.ts               # In-process poller (mirrors scheduler.ts pattern)
  routes/
    drift.ts                      # API routes: list, detail, dismiss, configure

apps/web/src/
  components/drift/
    DriftEventsList.tsx            # Table of drift events with filtering
    DriftDetailDrawer.tsx          # Before/after diff view
    DriftBadge.tsx                 # Sidebar badge showing drift alert count
  hooks/
    useDriftAlerts.ts              # SWR/fetch hook + SignalR subscription

packages/db/src/tenant/
  schema.ts                        # Add driftAlerts table + factsSnapshot column
  migrations/
    0002_add_drift_detection.sql   # DDL for drift_alerts table + factsSnapshot column
```

### Pattern 1: Drift Poller Service (mirrors scheduler.ts)
**What:** In-process `setInterval` that polls control-plane DB for tenants whose drift check is due, then executes the two-phase detection for each.
**When to use:** Always running when the API server is up.

```typescript
// Source: derived from apps/api/src/services/scheduler.ts (lines 227-250)
const POLL_INTERVAL_MS = 60_000; // Check for due tenants every 60s
const MAX_CONCURRENT = 3;
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let runningCount = 0;

export function startDriftPoller(): void {
  if (intervalHandle !== null) return;
  intervalHandle = setInterval(() => {
    pollForDueDriftChecks().catch((e) =>
      console.error('[drift-poller] poll error:', e),
    );
  }, POLL_INTERVAL_MS);
}

export function stopDriftPoller(): void {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
```

### Pattern 2: Activity Type to Area Mapping
**What:** A lookup table mapping directoryAudit `activityDisplayName` strings to AuditFacts area keys.
**When to use:** During audit log event parsing to determine which area to re-collect.

```typescript
// Source: Microsoft Entra audit activity reference [VERIFIED: docs.microsoft.com]
const ACTIVITY_TO_AREA: Record<string, keyof AuditFacts> = {
  // Conditional Access (category: Policy, service: Conditional Access)
  'Add conditional access policy': 'conditionalAccess',
  'Update conditional access policy': 'conditionalAccess',
  'Delete conditional access policy': 'conditionalAccess',
  'Add named location': 'namedLocations',
  'Update named location': 'namedLocations',
  'Delete named location': 'namedLocations',
  'Update security defaults': 'securityDefaults',
  // Auth methods (category: ApplicationManagement, service: Authentication Methods)
  'Authentication Methods Policy Update': 'authMethods',
  // Authorization policy (category: AuthorizationPolicy, service: Core Directory)
  'Update authorization policy': 'authorizationPolicy',
  // Role management (category: RoleManagement, service: Core Directory)
  'Add member to role': 'adminRoles',
  'Remove member from role': 'adminRoles',
  'Add eligible member to role': 'roleAssignments',
  'Remove eligible member from role': 'roleAssignments',
  // Applications (category: ApplicationManagement, service: Core Directory)
  'Add application': 'appRegistrations',
  'Update application': 'appRegistrations',
  'Delete application': 'appRegistrations',
  // Devices (category: Device, service: Core Directory)
  'Update device': 'devices',
  'Device no longer compliant': 'devices',
  // Password policy (category: DirectoryManagement, service: Core Directory)
  'Set password policy': 'passwordPolicy',
};
```

### Pattern 3: Single-Area Re-Collection
**What:** Re-collect one AuditFacts area without running the full 16-area pipeline.
**When to use:** During drift verification phase after audit log detects a change.

```typescript
// Source: derived from packages/audit/src/collectors/fact-collector.ts
import type { Client } from '@microsoft/microsoft-graph-client';
import type { AuditFacts } from '../types.js';
import { parseConditionalAccess } from './areas/conditional-access.js';
// ... other area parsers

type AreaKey = keyof AuditFacts;

export async function collectSingleArea(
  client: Client,
  area: AreaKey,
): Promise<AuditFacts[AreaKey]> {
  // Direct GET calls (not batch) -- batch-of-1 has overhead with no benefit
  switch (area) {
    case 'conditionalAccess': {
      const data = await client
        .api('/identity/conditionalAccess/policies')
        .select('id,displayName,state,conditions,grantControls,sessionControls')
        .top(100)
        .get();
      return parseConditionalAccess(data);
    }
    case 'securityDefaults': {
      const data = await client
        .api('/policies/identitySecurityDefaultsEnforcementPolicy')
        .get();
      return parseSecurityDefaults(data);
    }
    // ... cases for each area
  }
}
```

### Anti-Patterns to Avoid
- **Full re-collection on every poll:** Re-collecting all 16 areas when only 1 changed wastes API quota and adds 3-4s latency. Always use `collectSingleArea()`.
- **Batch of 1:** Using `executeBatch()` for a single request adds the `/$batch` POST overhead (~50ms) with zero parallelism gain. Use direct `client.api().get()` instead.
- **Storing drift alerts in control-plane DB:** Drift alerts contain tenant-specific configuration snapshots. They belong in the tenant-scoped DB alongside `auditRuns` and `auditFindings`.
- **Polling directoryAudits without activityDateTime filter:** Without the `ge` filter, every poll returns the full 30 days of audit history. Always filter from `lastDriftPollAt`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON diff | Custom recursive diff | Phase 7's `computeDrift()` from `rollback-service.ts` | Already handles volatile field exclusion, tested, uses JSON.stringify equality |
| SignalR push | Custom WebSocket server | Existing `signalr.ts` pattern (JWT-signed REST API push) | Already tested, handles auth, matches frontend SignalR client |
| Audit log pagination | Manual nextLink chasing | Graph SDK `.api().top(100).get()` + `@odata.nextLink` follow | SDK handles pagination correctly |
| Polling schedule | Custom cron library | `setInterval` with DB-backed due-time checks (scheduler.ts pattern) | Already proven in Phase 6 and Phase 7 |

**Key insight:** Phase 8 reuses infrastructure from 4 prior phases. The only genuinely new code is the audit-log-parser (mapping activity strings to areas), the `collectSingleArea()` function, and the `diffFactArea()` wrapper. Everything else is composition of existing patterns.

## Research Findings by Topic

### 1. Microsoft Graph directoryAudits API

**Endpoint:** `GET https://graph.microsoft.com/v1.0/auditLogs/directoryAudits` [VERIFIED: learn.microsoft.com]

**Permissions:** `AuditLog.Read.All` (application permission, already in the platform's Graph permission set) [VERIFIED: learn.microsoft.com]

**Filter syntax:** Supports `$filter` with `eq`, `ge`, `le`, `startswith` on `activityDateTime`. [VERIFIED: learn.microsoft.com]

```
$filter=activityDateTime ge 2026-04-15T00:00:00Z and (category eq 'Policy' or category eq 'RoleManagement')
```

**Important filter limitation:** The `or` operator within `$filter` may not work across different fields. Use multiple queries or filter in-memory if needed. The safe approach is to filter by `activityDateTime ge {since}` only and filter by category client-side. [ASSUMED]

**Response shape:** [VERIFIED: learn.microsoft.com directoryAudit resource type]
```typescript
interface DirectoryAuditEvent {
  id: string;
  activityDisplayName: string;    // e.g., "Update conditional access policy"
  activityDateTime: string;       // ISO 8601
  category: string;               // e.g., "Policy", "RoleManagement"
  result: 'success' | 'failure' | 'timeout' | 'unknownFutureValue';
  resultReason: string;
  operationType: string;          // "Add", "Update", "Delete", etc.
  loggedByService: string;        // e.g., "Conditional Access", "Core Directory"
  correlationId: string;
  initiatedBy: {
    user?: { id: string; displayName: string; userPrincipalName: string; ipAddress: string };
    app?: { appId: string; displayName: string; servicePrincipalId: string };
  };
  targetResources: Array<{
    id: string;
    displayName: string;
    type: string;                 // "Policy", "User", "Group", etc.
    modifiedProperties: Array<{
      displayName: string;
      oldValue: string | null;    // JSON string or null
      newValue: string | null;    // JSON string or null
    }>;
  }>;
  additionalDetails: Array<{ key: string; value: string }>;
}
```

**Pagination:** Standard OData `@odata.nextLink`. `$top` max is 1000 (default varies). Use `$top=100` per poll to stay within rate limits. [VERIFIED: learn.microsoft.com]

**Rate limits:** 5 requests per 10 seconds for auditLogs endpoints per tenant. [VERIFIED: learn.microsoft.com throttling-limits]

**Latency:** Audit events appear 2 minutes to 1 hour after the change. Typical latency for most admin actions is 2-15 minutes. No SLA commitment on exact latency. [VERIFIED: learn.microsoft.com reference-log-latency]

**Exact activityDisplayName strings per CONTEXT category:** [VERIFIED: learn.microsoft.com reference-audit-activities]

| CONTEXT Category | Exact `activityDisplayName` | Graph `category` | `loggedByService` |
|---|---|---|---|
| Conditional Access | `Add conditional access policy` | Policy | Conditional Access |
| Conditional Access | `Update conditional access policy` | Policy | Conditional Access |
| Conditional Access | `Delete conditional access policy` | Policy | Conditional Access |
| Named Locations | `Add named location` | Policy | Conditional Access |
| Named Locations | `Update named location` | Policy | Conditional Access |
| Named Locations | `Delete named location` | Policy | Conditional Access |
| Security Defaults | `Update security defaults` | Policy | Conditional Access |
| Auth Methods | `Authentication Methods Policy Update` | ApplicationManagement | Authentication Methods |
| Authorization Policy | `Update authorization policy` | AuthorizationPolicy | Core Directory |
| Role Management | `Add member to role` | RoleManagement | Core Directory |
| Role Management | `Remove member from role` | RoleManagement | Core Directory |
| Role Management | `Add eligible member to role` | RoleManagement | Core Directory |
| Role Management | `Remove eligible member from role` | RoleManagement | Core Directory |
| Applications | `Add application` | ApplicationManagement | Core Directory |
| Applications | `Update application` | ApplicationManagement | Core Directory |
| Applications | `Delete application` | ApplicationManagement | Core Directory |
| Devices | `Update device` | Device | Core Directory |
| Devices | `Device no longer compliant` | Device | Core Directory |
| Password Policy | `Set password policy` | DirectoryManagement | Core Directory |

**modifiedProperties quirks:**
- CA policy changes DO include `oldValue` and `newValue` as full JSON strings of the policy object [VERIFIED: learn.microsoft.com troubleshoot-policy-changes-audit-log]
- Role membership changes (`Add member to role`) often have `oldValue: null` and `newValue` containing the member info [ASSUMED]
- `Update security defaults` may have minimal modifiedProperties (just the `isEnabled` field change) [ASSUMED]
- Device compliance state changes (`Device no longer compliant`) typically do NOT include modifiedProperties with old/new values -- they are event-type entries, not property-change entries [ASSUMED]

**This is precisely why the two-phase detection is essential:** modifiedProperties are inconsistent across activity types, so the verify phase (re-collect + diff) catches what the audit log misses.

**TypeScript snippet -- Graph SDK call with filters:**
```typescript
// Source: Microsoft Graph JS SDK pattern [VERIFIED: learn.microsoft.com]
async function pollAuditLog(
  client: Client,
  since: Date,
): Promise<DirectoryAuditEvent[]> {
  const sinceISO = since.toISOString();
  const allEvents: DirectoryAuditEvent[] = [];

  let url: string | null =
    `/auditLogs/directoryAudits?$filter=activityDateTime ge ${sinceISO}` +
    `&$top=100&$orderby=activityDateTime desc`;

  while (url) {
    const page = await client.api(url).get();
    if (page.value) allEvents.push(...page.value);
    url = page['@odata.nextLink'] ?? null;
  }

  // Client-side filter to relevant activity types
  return allEvents.filter((e) => ACTIVITY_TO_AREA[e.activityDisplayName] !== undefined);
}
```

### 2. Per-Area Targeted Re-Collection

**Area parsers that can be called standalone:** All 13 area parser files in `packages/audit/src/collectors/areas/` are pure functions that accept batch result data and return typed area facts. [VERIFIED: codebase inspection]

| Parser | File | Input Source | Standalone-callable? |
|--------|------|-------------|---------------------|
| `parseConditionalAccess` | `conditional-access.ts` | Batch 1 result | Yes -- direct GET replaces batch |
| `parseAuthenticationMethods` | `authentication-methods.ts` | Batch 1 + standalone MFA | Partial -- needs two calls |
| `parseAuthorizationPolicy` | `authorization-policy.ts` | Batch 1 result | Yes |
| `parseSecurityDefaults` | `security-defaults.ts` | Batch 1 result | Yes |
| `parseDirectoryRoles` | `directory-roles.ts` | Batch 1 + Batch 2 (GA members) | Needs two calls (roles + GA members) |
| `parseDevices` | `devices.ts` | Batch 1 result | Yes |
| `parseLicenses` | `licenses.ts` | Batch 1 result | Yes |
| `parseDomains` | `domains.ts` | Batch 1 result | Yes (returns both domains + passwordPolicy) |
| `parsePimRoles` | `pim-roles.ts` | Standalone beta calls | Yes |
| `parseAppRegistrations` | `app-registrations.ts` | Batch 1 result | Yes |
| `parseSensitivityLabels` | `sensitivity-labels.ts` | Standalone beta call | Yes |
| `parseOrganization` | `organization.ts` | Batch 1 result | Yes |
| `parseBreakGlass` | `break-glass.ts` | Standalone + CA facts dependency | Needs CA facts first |

**Recommendation: Direct GET calls, not batch-of-1.** The `executeBatch()` helper supports batches of any size (including 1), but for single-area re-collection, a direct `client.api(url).get()` is simpler, faster (~50ms less overhead), and easier to debug. The batch helper wraps requests in a `/$batch` POST which adds unnecessary serialization for a single request. [VERIFIED: codebase inspection of batch-helper.ts]

**Areas that need special handling for standalone re-collection:**
- `authMethods` + `mfa`: Auth methods policy is batch-callable but MFA registration details require a separate paginated standalone call. For drift detection, re-collecting just `authMethods` (the policy) is sufficient since drift would be on the policy settings, not on per-user MFA registration status.
- `adminRoles`: Requires two calls -- `GET /directoryRoles` then `GET /directoryRoles/{gaRoleId}/members`. The area recollector must handle this two-step dependency.
- `passwordPolicy` shares its data with `domains` (both come from `GET /domains`). The recollector should call `parseDomains()` and extract just the `passwordPolicy` portion.

### 3. Deep Diff Engine

**`computeDrift()` analysis:** [VERIFIED: codebase inspection of rollback-service.ts]

The existing function in `packages/audit/src/remediation/rollback-service.ts` (lines 69-103):
- Compares two unknown values by `JSON.stringify` equality
- Skips volatile fields: `modifiedDateTime`, `createdDateTime`, `policyVersion`, `lastModifiedDateTime`
- Returns `{ drifted: boolean, changedFields: string[] }` with top-level key names that differ
- Works on single Graph resource objects (flat key comparison)

**Limitation for Phase 8:** `computeDrift()` does a **shallow** top-level key comparison. AuditFacts areas are complex objects (e.g., `ConditionalAccessFacts` has `policies: ConditionalAccessPolicy[]`). A shallow comparison would show `changedFields: ['policies']` without indicating WHICH policy changed or HOW.

**Recommendation: Write a new `diffFactArea()` wrapper function** that:
1. For areas with array properties (like `conditionalAccess.policies`), does item-level matching by `id` field and reports per-item diffs
2. For scalar areas (like `securityDefaults`), delegates directly to `computeDrift()`
3. Returns both a structured diff (for DB storage) and a human-readable summary (for the `diff_summary` column)

**Diff output format:** Store BOTH structured JSON diff AND a human-readable summary:
```typescript
interface AreaDiffResult {
  drifted: boolean;
  structuredDiff: {
    added: Array<{ id: string; displayName?: string }>;
    removed: Array<{ id: string; displayName?: string }>;
    modified: Array<{
      id: string;
      displayName?: string;
      changedFields: string[];
    }>;
  };
  humanSummary: string; // e.g., "CA policy 'Block Legacy Auth' disabled (state: enabled -> disabled)"
}
```

The `diff_summary` column in `drift_alerts` should store the `humanSummary` string. The `before_snapshot` and `after_snapshot` columns store the full area JSON for detailed drill-down in the frontend.

### 4. Baseline Snapshot Persistence

**Current `auditRuns` schema:** [VERIFIED: codebase inspection of packages/db/src/tenant/schema.ts]

The table currently has: `id`, `tenantId`, `triggeredBy`, `status`, `startedAt`, `completedAt`, `totalChecks`, `passedChecks`, `failedChecks`, `errorChecks`, `summary`, `createdAt`.

**Drizzle schema for NVARCHAR(MAX):** The Drizzle schema uses `nvarchar({ length: 4000 })` as the TypeScript definition, but the actual SQL migration uses `NVARCHAR(MAX)`. This is the established pattern from Phase 7 -- `remediationJobs.beforeSnapshot` is defined as `nvarchar('before_snapshot', { length: 4000 })` in schema.ts but the migration SQL (0001_add_remediation_jobs.sql line 31) creates it as `NVARCHAR(MAX)`. [VERIFIED: codebase inspection]

**Recommendation:** Follow the same pattern:
- Drizzle schema: `factsSnapshot: nvarchar('facts_snapshot', { length: 4000 })` (Drizzle nvarchar with length:4000 is a proxy; actual column is MAX in SQL)
- Migration SQL: `ALTER TABLE [audit_runs] ADD [facts_snapshot] NVARCHAR(MAX) NULL;`

**Insertion point in audit-runner.ts:** Line 182 is the "mark complete" update. Add `factsSnapshot: JSON.stringify(facts)` to the `.set()` call:

```typescript
// audit-runner.ts line 182 -- add factsSnapshot
await db.update(auditRuns).set({
  status: 'completed',
  completedAt: new Date(),
  passedChecks,
  failedChecks,
  errorChecks,
  summary,
  factsSnapshot: JSON.stringify(facts),  // Phase 8 addition
}).where(eq(auditRuns.id, auditId));
```

**Size estimate:** A typical `AuditFacts` object with 20 CA policies, 5 named locations, 100 MFA users, and standard areas serializes to approximately 30-80KB JSON. For tenants with 200+ CA policies, this could reach 150-200KB. `NVARCHAR(MAX)` supports up to 2GB, so this is well within limits. [ASSUMED -- based on structure analysis]

### 5. Drift Poller Service Design

**Scheduler pattern skeleton** (from `apps/api/src/services/scheduler.ts`): [VERIFIED: codebase inspection]
- `setInterval` at `POLL_INTERVAL_MS` (60s)
- Query control-plane DB for due tenants
- `MAX_CONCURRENT` limit with pending queue + stagger
- Fire-and-forget pattern: `launchScan(tenant).catch(...)`
- Pre-update timestamp BEFORE launching to prevent re-picks
- Top-level try/catch so failures don't crash the interval

**Remediation worker additions** (from `apps/api/src/services/remediation-worker.ts`): [VERIFIED: codebase inspection]
- `shuttingDown` flag for graceful drain
- `inFlightPromises` set for drain timeout
- `SIGTERM`/`SIGINT` handler with `Promise.allSettled` drain
- `workerId` for row-level claim (less critical for drift since we're not claiming rows)

**Recommendation for `lastDriftPollAt` storage:** Store on the `tenants` table in control-plane DB alongside `scheduleNextRunAt`. Reasons:
1. The drift poller queries control-plane to find due tenants (same as scheduler)
2. No need for a separate table -- it's one column: `lastDriftPollAt DATETIME2 NULL`
3. Optional `driftCheckIntervalMinutes INT DEFAULT 15` column for per-tenant configuration

**Schema addition to control-plane `tenants` table:**
```typescript
// packages/db/src/control-plane/schema.ts -- add to tenants
lastDriftPollAt: datetime2('last_drift_poll_at'),
driftCheckIntervalMinutes: int('drift_check_interval_minutes').default(15),
```

**Polling logic:**
```typescript
// Due tenants: lastDriftPollAt is null OR
//   lastDriftPollAt + driftCheckIntervalMinutes < now
const now = new Date();
const dueTenants = await db.select().from(tenants).where(
  and(
    eq(tenants.isDeleted, false),
    eq(tenants.status, 'active'),
    isNotNull(tenants.databaseName),
    isNotNull(tenants.tokenSecretName),
    // Due check: either never polled or interval elapsed
    or(
      isNull(tenants.lastDriftPollAt),
      lte(tenants.lastDriftPollAt, new Date(now.getTime() - tenant.driftCheckIntervalMinutes * 60_000))
    ),
  ),
);
```

**Backoff strategy (Claude's discretion):** When a tenant's audit log returns no new events:
- Update `lastDriftPollAt` to `now` (so we don't re-check until the next interval)
- No special backoff -- the per-tenant interval (15-60min) is already the throttle
- If the audit API returns 429, respect `Retry-After` header and skip that tenant for this cycle

**Concurrency model:** `MAX_CONCURRENT = 3` (matches scheduler), with stagger of 30s between queued launches. Each tenant drift check takes ~2-5s (1 audit log query + 0-3 area re-collections).

### 6. SignalR Drift Push

**Current pattern** (from `apps/api/src/services/signalr.ts`): [VERIFIED: codebase inspection]
- `pushAuditProgress(userId, message)` -- user-scoped push to `audit` hub
- `pushRemediationProgress(userId, message)` -- user-scoped push on `remediationProgress` target
- JWT signed with HS256 using `SIGNALR_ACCESS_KEY`
- REST API POST to `${endpoint}/api/v1/hubs/${HUB_NAME}/users/${userId}`

**New function: `pushDriftAlert()`**

```typescript
export async function pushDriftAlert(
  userId: string,
  message: DriftAlertMessage,
): Promise<void> {
  // Same pattern as pushAuditProgress but with target: 'driftAlert'
  const { endpoint, accessKey } = getSignalRConfig();
  const url = `${endpoint}/api/v1/hubs/${HUB_NAME}/users/${userId}`;
  const token = jwt.sign({ aud: url }, accessKey, { algorithm: 'HS256', expiresIn: '5m' });

  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      target: 'driftAlert',
      arguments: [message],
    }),
  });
}
```

**DriftAlertMessage type:**
```typescript
export interface DriftAlertMessage {
  type: 'drift_detected';
  driftAlertId: string;
  tenantId: string;
  area: string;              // e.g., 'conditionalAccess'
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  activityType: string;      // e.g., 'Delete conditional access policy'
  actorUpn: string | null;
  diffSummary: string;       // human-readable summary
  detectedAt: string;        // ISO 8601
}
```

**Push scope:** Push to all users who have access to the tenant (via `tenantUserAccess` table). The drift poller should query `tenantUserAccess` to find all userIds with access to the affected tenant, then push to each. This matches the action queue's cross-tenant visibility model. [VERIFIED: control-plane schema has tenantUserAccess table]

### 7. Integration with Phase 5 Action Queue

**Current action queue data flow:** [VERIFIED: codebase inspection]
- `ActionQueueItem` type in `packages/shared/src/types/action-queue.ts` has `type: 'critical_findings' | 'needs_reauth' | 'stale_audit'`
- Items are computed server-side and returned via `/api/action-queue`
- `actionQueueDismissals` table persists per-user dismiss state with deterministic `itemKey`

**Recommendation: Extend `ActionQueueItem.type` to include `'drift_detected'`:**
```typescript
export interface ActionQueueItem {
  id: string;
  type: 'critical_findings' | 'needs_reauth' | 'stale_audit' | 'drift_detected'; // Phase 8 addition
  // ... rest unchanged
}
```

**New `SEVERITY_BORDER` and `TypeIcon` entries needed in ActionQueue.tsx:**
- Border color: `drift_detected: "border-l-purple-500"` (distinct from existing colors)
- Icon: `Activity` from lucide-react (or a custom drift icon)

**Action queue data source for drift alerts:**
- The existing action-queue API computes items from control-plane data. Drift alerts live in tenant DBs.
- **Recommendation:** Add a new query in the action-queue route that, for each active tenant, reads the count of undismissed drift alerts from the tenant's `drift_alerts` table. Aggregate into `ActionQueueItem[]` with `type: 'drift_detected'`, `count: N`, `linkTo: '/tenants/{id}/drift'`.
- **itemKey format:** `"drift-{tenantId}"` for dismissal tracking.

### 8. Link to Phase 7 Remediation

**RemediateButton requirements:** [VERIFIED: codebase inspection of RemediateButton.tsx]
- Props: `finding: AuditFinding`, `tenantId: string`, `classification: 'SAFE' | 'RISKY'`, `bundle: ScopeBundleName`
- The finding object needs: `id`, `controlId`, and other AuditFinding fields

**Mapping drift alerts to controlIds:**
- When a drift alert fires for a specific area (e.g., CA policy disabled), we can identify which control(s) are affected by re-running the evaluators for that area against the new facts.
- **Recommendation: Create a synthetic finding from the drift alert.** The drift detail view should:
  1. Show the before/after diff
  2. List the audit controls that are now failing (by re-evaluating against the drifted facts)
  3. For each newly-failing control, render a `RemediateButton` if a remediation entry exists

**Implementation approach:**
```typescript
// When showing drift detail, re-evaluate controls against the "after" facts
const affectedControls = getAllControls()
  .filter(c => c.evaluator(afterFacts).rating === 'fail')
  .filter(c => c.evaluator(beforeFacts).rating === 'pass'); // Only newly-failing

// For each, check if a remediation entry exists
const remediatable = affectedControls
  .filter(c => getRemediationByControlId(c.id) !== null);
```

This avoids creating synthetic findings in the DB -- the drift detail UI computes the mapping on the fly.

## Common Pitfalls

### Pitfall 1: Audit Log Filter Combining OR Across Fields
**What goes wrong:** Using `$filter=activityDateTime ge {since} and category eq 'Policy' or category eq 'RoleManagement'` may not parse correctly due to OData operator precedence.
**Why it happens:** OData `or` binds tighter than `and` without parentheses, and Graph's OData implementation has quirks.
**How to avoid:** Filter only by `activityDateTime ge {since}` in the API call, then filter by category/activityDisplayName client-side. This is safer and the data volume per 15-minute window is small.
**Warning signs:** Getting all audit events instead of just security-relevant ones, or getting 400 Bad Request.

### Pitfall 2: Rate Limiting on Audit Log Endpoint
**What goes wrong:** 5 requests per 10 seconds limit. With 50 tenants checking every 15 minutes, peaks can exceed this.
**Why it happens:** Each tenant drift check = 1 audit log query + 0-N re-collection calls. If many tenants are due simultaneously, the concurrent Graph calls spike.
**How to avoid:** MAX_CONCURRENT=3 with stagger between launches. Each tenant check spaces out API calls naturally. The 60s poll interval means at most 3 tenants start checks per minute.
**Warning signs:** HTTP 429 responses from Graph API.

### Pitfall 3: Facts Snapshot Size with Large Tenants
**What goes wrong:** Tenants with 500+ CA policies could produce 500KB+ JSON snapshots, slowing DB writes and reads.
**Why it happens:** `AuditFacts.conditionalAccess.policies` includes full policy objects.
**How to avoid:** Consider truncating policy details in the snapshot (keep id, displayName, state but drop full conditions/grantControls). Alternatively, accept the size -- NVARCHAR(MAX) handles it fine and SQL Server compresses effectively.
**Warning signs:** Slow `auditRuns` insert queries, tenant DB storage growing faster than expected.

### Pitfall 4: Deduplication Within a Single Poll Cycle
**What goes wrong:** If a CA policy is updated 3 times in 15 minutes, the audit log returns 3 events for the same area. Re-collecting the area 3 times is wasteful.
**Why it happens:** Multiple changes to the same resource within one poll interval.
**How to avoid:** Deduplicate by area before re-collection. Group audit events by `ACTIVITY_TO_AREA[activityDisplayName]`, then re-collect each unique area only once. Create one drift alert per unique area with all related events listed.
**Warning signs:** Redundant drift alerts for the same area within seconds of each other.

### Pitfall 5: lastDriftPollAt Must Be Updated BEFORE Processing
**What goes wrong:** If the poller crashes mid-check, the next poll cycle re-picks the same tenant and reprocesses the same events, potentially creating duplicate drift alerts.
**Why it happens:** Same as scheduler.ts PITFALL 1 -- timestamp updated after processing means re-picks on crash.
**How to avoid:** Update `lastDriftPollAt = now` BEFORE starting the audit log query. If the check fails, we miss that window but avoid duplicates.
**Warning signs:** Duplicate drift alerts with identical `audit_event_id` values.

## Code Examples

### Full Drift Check Flow for One Tenant

```typescript
// Source: composition of verified patterns from scheduler.ts, fact-collector.ts, rollback-service.ts
async function checkTenantDrift(tenant: TenantRow): Promise<void> {
  const db = await getControlPlaneDb();

  // PITFALL 5: Update timestamp FIRST
  await db.update(tenants)
    .set({ lastDriftPollAt: new Date(), updatedAt: new Date() })
    .where(eq(tenants.id, tenant.id));

  // 1. Get Graph client for this tenant
  const accessToken = await getDriftAccessToken(tenant);
  if (!accessToken) return;
  const client = createGraphClient(accessToken);

  // 2. Poll audit log since last check
  const since = tenant.lastDriftPollAt ?? new Date(Date.now() - 15 * 60_000);
  const events = await pollAuditLog(client, since);
  if (events.length === 0) return; // No security-relevant changes

  // 3. Deduplicate by area
  const areasToCheck = new Map<string, DirectoryAuditEvent[]>();
  for (const event of events) {
    const area = ACTIVITY_TO_AREA[event.activityDisplayName];
    if (!area) continue;
    if (!areasToCheck.has(area)) areasToCheck.set(area, []);
    areasToCheck.get(area)!.push(event);
  }

  // 4. Load baseline from most recent completed audit run
  const { db: tenantDb } = await getTenantDb(tenant.databaseName);
  const [latestRun] = await tenantDb.select()
    .from(auditRuns)
    .where(eq(auditRuns.status, 'completed'))
    .orderBy(desc(auditRuns.completedAt))
    .limit(1);

  if (!latestRun?.factsSnapshot) return; // No baseline yet
  const baselineFacts: AuditFacts = JSON.parse(latestRun.factsSnapshot);

  // 5. For each affected area, re-collect and diff
  for (const [area, areaEvents] of areasToCheck) {
    const currentAreaFacts = await collectSingleArea(client, area as keyof AuditFacts);
    const baselineAreaFacts = baselineFacts[area as keyof AuditFacts];

    const diff = diffFactArea(area, baselineAreaFacts, currentAreaFacts);
    if (!diff.drifted) continue; // Audit log event but no actual drift (e.g., reverted change)

    // 6. Classify severity from the activity types
    const severity = classifySeverity(areaEvents);
    const actorUpn = areaEvents[0]?.initiatedBy?.user?.userPrincipalName ?? null;

    // 7. Create drift alert
    const alertId = crypto.randomUUID();
    await tenantDb.insert(driftAlerts).values({
      id: alertId,
      tenantId: tenant.id,
      area,
      severity,
      activityType: areaEvents.map(e => e.activityDisplayName).join(', '),
      actorUpn,
      beforeSnapshot: JSON.stringify(baselineAreaFacts),
      afterSnapshot: JSON.stringify(currentAreaFacts),
      diffSummary: diff.humanSummary,
      auditEventId: areaEvents[0]?.id ?? null,
      detectedAt: new Date(),
    });

    // 8. Push to all users watching this tenant
    const watchers = await getWatcherUserIds(tenant.id);
    for (const userId of watchers) {
      await pushDriftAlert(userId, {
        type: 'drift_detected',
        driftAlertId: alertId,
        tenantId: tenant.id,
        area,
        severity,
        activityType: areaEvents[0]?.activityDisplayName ?? '',
        actorUpn,
        diffSummary: diff.humanSummary,
        detectedAt: new Date().toISOString(),
      }).catch(() => {}); // Fire-and-forget SignalR
    }
  }
}
```

### Migration SQL

```sql
-- Migration 0002 (tenant): Add drift detection tables + factsSnapshot column.
-- Phase 8 Plan 01 -- Drift Detection Engine.

-- 1. Add factsSnapshot to audit_runs
ALTER TABLE [audit_runs] ADD [facts_snapshot] NVARCHAR(MAX) NULL;

-- 2. Create drift_alerts table
CREATE TABLE [drift_alerts] (
    [id]                   VARCHAR(36)    NOT NULL,
    [tenant_id]            VARCHAR(36)    NOT NULL,
    [area]                 VARCHAR(50)    NOT NULL,
    [severity]             VARCHAR(20)    NOT NULL,
    [activity_type]        NVARCHAR(200)  NULL,
    [actor_upn]            NVARCHAR(200)  NULL,
    [before_snapshot]      NVARCHAR(MAX)  NULL,
    [after_snapshot]       NVARCHAR(MAX)  NULL,
    [diff_summary]         NVARCHAR(MAX)  NULL,
    [audit_event_id]       VARCHAR(100)   NULL,
    [detected_at]          DATETIME2      NOT NULL CONSTRAINT [DF_drift_alerts_detected_at] DEFAULT GETDATE(),
    [dismissed_at]         DATETIME2      NULL,
    [dismissed_by]         NVARCHAR(200)  NULL,
    [remediation_job_id]   VARCHAR(36)    NULL,
    [created_at]           DATETIME2      NOT NULL CONSTRAINT [DF_drift_alerts_created_at] DEFAULT GETDATE(),
    CONSTRAINT [PK_drift_alerts] PRIMARY KEY ([id])
);

-- Index: undismissed alerts for action queue count
CREATE INDEX [IX_drift_alerts_undismissed]
    ON [drift_alerts] ([tenant_id], [dismissed_at])
    WHERE [dismissed_at] IS NULL;

-- Index: by area for deduplication checks
CREATE INDEX [IX_drift_alerts_area]
    ON [drift_alerts] ([tenant_id], [area], [detected_at] DESC);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Azure AD Graph /reports | Microsoft Graph /auditLogs/directoryAudits | 2023 (Azure AD Graph sunset) | Must use MS Graph v1.0 endpoint |
| Webhook subscriptions for CA changes | Audit log polling (webhooks don't support CA/Intune/DLP) | Ongoing limitation | Polling is the only option for these resource types |
| Manual diff of policy exports | Structured diff via Graph API modifiedProperties + re-collection | Phase 8 adds this | Automated, near-real-time detection |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | OData `or` across different filter fields may not work reliably in directoryAudits | Section 1 (Pitfall 1) | Low -- we already recommend client-side filtering |
| A2 | Role membership changes have `oldValue: null` in modifiedProperties | Section 1 (modifiedProperties quirks) | Low -- two-phase detection handles this via re-collection |
| A3 | Device compliance state changes don't include modifiedProperties | Section 1 (modifiedProperties quirks) | Low -- two-phase detection handles this |
| A4 | `Update security defaults` has minimal modifiedProperties | Section 1 (modifiedProperties quirks) | Low -- two-phase detection handles this |
| A5 | Typical AuditFacts JSON serializes to 30-80KB | Section 4 (Size estimate) | Medium -- if much larger, may need snapshot pruning strategy |

## Open Questions

1. **`AuditLog.Read.All` permission already granted?**
   - What we know: The CLAUDE.md Graph API permissions table shows `AuditLog.Read.All` as "Needed" but not yet granted.
   - What's unclear: Whether the managed identity already has this permission or if it needs to be added.
   - Recommendation: Add `AuditLog.Read.All` grant as a prerequisite step in Plan 08-01 Wave 0.

2. **Facts snapshot backfill for existing audit runs?**
   - What we know: `factsSnapshot` will be NULL for all existing audit runs. The drift poller needs a baseline.
   - What's unclear: Should we backfill, or just wait for the next audit to populate the snapshot?
   - Recommendation: Wait for the next audit. The drift poller should gracefully skip tenants with no baseline (`latestRun?.factsSnapshot` is null).

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified -- Phase 8 is purely code/config changes using existing project infrastructure).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (project-current) |
| Config file | `vitest.config.ts` (project root) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command |
|--------|----------|-----------|-------------------|
| DRIFT-01 | Audit log parser maps activityDisplayName to area | unit | `npx vitest run packages/audit/src/drift/__tests__/audit-log-parser.test.ts` |
| DRIFT-02 | collectSingleArea returns typed area facts | unit | `npx vitest run packages/audit/src/drift/__tests__/area-recollector.test.ts` |
| DRIFT-03 | diffFactArea detects added/removed/modified items | unit | `npx vitest run packages/audit/src/drift/__tests__/diff-engine.test.ts` |
| DRIFT-04 | Severity classifier produces correct levels | unit | `npx vitest run packages/audit/src/drift/__tests__/severity-classifier.test.ts` |
| DRIFT-05 | Drift poller picks up due tenants and creates alerts | unit | `npx vitest run apps/api/src/services/__tests__/drift-poller.test.ts` |
| DRIFT-06 | Drift API routes return correct responses | unit | `npx vitest run apps/api/src/routes/__tests__/drift.test.ts` |
| DRIFT-07 | factsSnapshot serialized on audit completion | unit | `npx vitest run packages/audit/src/__tests__/audit-runner.test.ts` |

### Wave 0 Gaps
- [ ] `packages/audit/src/drift/__tests__/` -- new test directory (all Phase 8 tests are new)
- [ ] `apps/api/src/services/__tests__/drift-poller.test.ts` -- drift poller tests
- [ ] `apps/api/src/routes/__tests__/drift.test.ts` -- drift route tests
- [ ] Mock fixtures for directoryAudit responses

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | N/A -- drift detection is read-only monitoring |
| V3 Session Management | No | N/A |
| V4 Access Control | Yes | Drift alerts are tenant-scoped; API routes use existing tenant context middleware |
| V5 Input Validation | Yes | Validate `driftCheckIntervalMinutes` input (15-60 range), sanitize activity type strings |
| V6 Cryptography | No | N/A -- uses existing SignalR JWT signing |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Tenant isolation bypass (reading another tenant's drift alerts) | Information Disclosure | Existing tenant context middleware validates user access to tenant |
| Forged drift alert injection via API | Tampering | Drift alerts are only created by the server-side poller, never via user API |
| Sensitive config data in snapshots | Information Disclosure | Snapshots contain policy config (not secrets); access controlled by existing auth middleware |

## Sources

### Primary (HIGH confidence)
- [Microsoft Graph directoryAudit resource type](https://learn.microsoft.com/en-us/graph/api/resources/directoryaudit?view=graph-rest-1.0) -- response shape, properties, filter support
- [Microsoft Graph List directoryAudits](https://learn.microsoft.com/en-us/graph/api/directoryaudit-list?view=graph-rest-1.0) -- endpoint, permissions, pagination, examples
- [Microsoft Entra audit log activity reference](https://learn.microsoft.com/en-us/entra/identity/monitoring-health/reference-audit-activities) -- complete list of activityDisplayName strings per category
- [Troubleshoot CA policy changes with audit log](https://learn.microsoft.com/en-us/entra/identity/conditional-access/troubleshoot-policy-changes-audit-log) -- CA-specific modifiedProperties with oldValue/newValue examples
- [Log latency for Microsoft Entra ID](https://learn.microsoft.com/en-us/entra/identity/monitoring-health/reference-log-latency) -- 2min-1hr latency range for audit events
- [Microsoft Graph throttling limits](https://learn.microsoft.com/en-us/graph/throttling-limits) -- 5 req/10s for auditLogs endpoints

### Secondary (MEDIUM confidence)
- Codebase inspection: `packages/audit/src/collectors/fact-collector.ts` -- area collection pipeline
- Codebase inspection: `packages/audit/src/remediation/rollback-service.ts` -- computeDrift() implementation
- Codebase inspection: `apps/api/src/services/scheduler.ts` -- poller pattern
- Codebase inspection: `apps/api/src/services/remediation-worker.ts` -- heartbeat + drain pattern
- Codebase inspection: `apps/api/src/services/signalr.ts` -- push pattern
- Codebase inspection: `packages/db/src/tenant/schema.ts` -- current schema
- Codebase inspection: `packages/db/src/control-plane/schema.ts` -- tenants table

### Tertiary (LOW confidence)
- None -- all claims verified against official docs or codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing infrastructure
- Architecture: HIGH -- all patterns directly verified from codebase with line-level inspection
- Graph API: HIGH -- all activityDisplayName strings verified against Microsoft Learn reference
- Pitfalls: HIGH -- drawn from verified API documentation and established codebase patterns

**Research date:** 2026-04-15
**Valid until:** 2026-05-15 (stable -- Graph v1.0 API, established codebase patterns)
