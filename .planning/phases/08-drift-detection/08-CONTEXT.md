# Phase 8: Drift Detection — Context

**Gathered:** 2026-03-24
**Status:** Ready for research → planning

<domain>
## Phase Boundary

Build **configuration drift detection** so the platform monitors tenant security settings between audits and alerts MSPs in near-real-time when something changes. This is the final phase of milestone v1.0 — it transforms the platform from reactive (audit-then-fix) to proactive (continuous monitoring).

The drift engine polls Microsoft Graph's `directoryAudits` API for security-relevant changes, re-collects the affected fact area to verify the drift, compares against a stored baseline, and creates an alert with before/after comparison. Alerts flow into the existing cross-tenant action queue (Phase 5) and push to the dashboard in real-time via Azure SignalR (Phase 2).

**Depends on:**
- Phase 6 (scheduler pattern for the drift poller)
- Phase 2 (SignalR push, audit pipeline, fact collector)
- Phase 5 (action queue UI, cross-tenant dashboard)
- Phase 7 (remediation — drift alerts can link to "remediate" actions)

**Explicit non-goals for Phase 8:**
- Graph webhooks / change notifications — architecture decision is audit log polling (PROJECT.md key decision: "webhooks don't support CA/Intune/DLP resources")
- Drift prevention / auto-remediation — users can manually remediate from the alert using Phase 7 infrastructure
- Custom drift rules or user-defined sensitivity thresholds — v2 feature
- Multi-tenant drift correlation ("3 tenants changed the same policy this week") — v2 analytics
- Email/SMS alert delivery — deferred to notification pipeline

</domain>

<decisions>
## Implementation Decisions (gathered from user)

### Detection Strategy: Audit Log Polling + Diff Verification

Two-phase detection approach:
1. **Poll phase:** Query `/auditLogs/directoryAudits` at configurable intervals (15min default, configurable 15min-1hr per tenant) for security-relevant activity types. Filter by category and activity type (see activity type catalog below).
2. **Verify phase:** When the poller detects a potentially drifted change, re-collect ONLY the affected AuditFacts area (e.g., just `conditionalAccess` if a CA policy changed, just `authMethods` if an auth method was modified) and diff against the stored baseline snapshot.

This approach gives:
- Fast detection (minutes, not hours) from the audit log
- Accurate verification (no false positives from ambiguous log entries) from the targeted re-collect + diff
- Minimal Graph API overhead (only re-collect the specific area that changed, not all 16 areas)

**Activity type → AuditFacts area mapping** (what to watch for):

| Graph directoryAudit Category | Activity Types | AuditFacts Area to Re-Collect |
|-------------------------------|---------------|-------------------------------|
| Policy | Add/Update/Delete conditional access policy | `conditionalAccess` |
| Policy | Update authentication methods policy | `authMethods` |
| Policy | Update authorization policy | `authorizationPolicy` |
| Policy | Update admin consent request policy | `adminConsentPolicy` |
| Policy | Update security defaults | `securityDefaults` |
| RoleManagement | Add/Remove member to role | `adminRoles` |
| RoleManagement | Add/Remove eligible member to role | `roleAssignments` |
| UserManagement | Update user (password policy) | `passwordPolicy` (via `domains`) |
| ApplicationManagement | Add/Update/Delete application | `appRegistrations` |
| Device | Update device compliance | `devices` |

### Baseline Storage: Extend auditRuns with factsSnapshot

- Add `factsSnapshot NVARCHAR(MAX)` column to the existing `auditRuns` table (tenant-scoped).
- After each successful audit completion, the audit runner writes the serialized `AuditFacts` JSON to `factsSnapshot`.
- The drift engine reads the most recent completed `auditRuns` row's `factsSnapshot` as the baseline.
- Migration: `0008_add_facts_snapshot.sql` (ALTER TABLE auditRuns ADD factsSnapshot NVARCHAR(MAX) NULL)
- Drizzle schema update in `packages/db/src/tenant/schema.ts`
- Estimated size: ~50-200KB per audit run. For 50 tenants × 2 audits/week, that's ~10-20MB/week — negligible.
- **Side benefit:** This also fixes the Phase 7 gap where `/preview` and the remediation worker called `createEmptyFacts()` because no facts snapshot was available. Both can now read from `auditRuns.factsSnapshot`.

### Plan Split: Backend Engine → Frontend + SignalR Push

- **08-01 (Wave 1):** Backend drift detection engine
  - Drift poller service (in-process, mirrors scheduler/remediation-worker pattern)
  - Audit log parser + activity type → area mapping
  - Baseline snapshot storage (extend auditRuns + wire into audit runner)
  - Diff engine (per-area deep comparison with volatile-field exclusion)
  - Drift alert DB table (tenant-scoped) with before/after snapshots
  - Drift alert API routes (list, detail, dismiss, configure polling interval)
  - Tests for all backend components

- **08-02 (Wave 2, depends on 08-01):** Frontend drift UI + real-time push
  - Drift events list component (table with timestamp, category, severity, what changed)
  - Drift detail view with before/after JSON diff display
  - Dashboard integration — drift alert count badge on sidebar + alert panel on /tenants page
  - SignalR real-time push for new drift events (extends existing hub)
  - Time-range filtering and severity filtering
  - Link from drift alert to "Remediate" action (Phase 7 infrastructure)
  - Tests for all frontend components

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets

**Phase 6 — Scheduler Pattern (`apps/api/src/services/scheduler.ts`):**
- Direct pattern template for the drift poller: in-process setInterval, concurrency control, race-guarded state updates, idempotent start/stop.
- Drift poller uses the same shape with different timing: POLL_INTERVAL=60s (check for pending tenants), per-tenant check frequency configurable 15min-1hr.

**Phase 7 — Remediation Worker (`apps/api/src/services/remediation-worker.ts`):**
- Extended poller pattern with heartbeat + zombie sweep. Drift poller should add heartbeat for crash detection too.
- SIGTERM/SIGINT graceful drain pattern to reuse.

**Phase 2 — Fact Collector (`packages/audit/src/collectors/fact-collector.ts`):**
- Collects all 16 AuditFacts areas. Phase 8 extends this with a targeted `collectFactArea(client, areaName)` function that re-collects a single area (for drift verification without re-running the full pipeline).
- Area parsers are already standalone: `parseConditionalAccess(data)`, `parseAuthenticationMethods(data)`, etc. — can be called individually.

**Phase 2 — SignalR Push (`apps/api/src/services/signalr.ts`):**
- `pushAuditProgress()` and `pushRemediationProgress()` already exist. Phase 8 adds `pushDriftAlert()` with a new message type.

**Phase 5 — Action Queue (`apps/web/src/components/tenants/ActionQueue.tsx`):**
- Cross-tenant action queue on the dashboard. Drift alerts integrate as a new action type alongside remediation actions and audit findings.
- `actionQueueDismissals` table already exists in control-plane schema for dismiss persistence.

**Phase 7 — Rollback Service (`packages/audit/src/remediation/rollback-service.ts`):**
- `computeDrift()` function already exists — compares two JSON objects and excludes volatile fields (`modifiedDateTime`, `createdDateTime`, `policyVersion`, `lastModifiedDateTime`). Phase 8's diff engine reuses this exact function.

**Phase 1 — Key Vault + Token Management:**
- Drift poller needs Graph tokens for each tenant. Reuses the existing tenant token infrastructure (Phase 4 consent flow → Phase 1 Key Vault storage → Phase 7 token broker pattern).

### Established Patterns
- Hono API with typed env and tenant context middleware
- Drizzle ORM with mssqlTable for per-tenant schemas
- On-demand per-tenant DB connections (open/close per request; workers open their own)
- Vitest with mock injection
- In-process setInterval workers with race-guarded state updates
- SignalR REST API push with JWT HS256 signing

### Integration Points
- New `driftAlerts` tenant-scoped table in `packages/db/src/tenant/schema.ts`
- New `factsSnapshot` column on existing `auditRuns` table + migration
- Optional `driftCheckIntervalMinutes` column on `tenants` control-plane table (configurable per tenant)
- New drift routes register in `apps/api/src/app.ts`
- Drift poller service wired into `apps/api/src/index.ts` serve callback (alongside scheduler and remediation worker)
- SignalR hub extended with `drift_detected` message type
- Action queue component extended with drift alert rendering

</code_context>

<specifics>
## Specific Ideas

### Drift Severity Auto-Classification

| Change Type | Severity | Rationale |
|-------------|----------|-----------|
| CA policy deleted or disabled | Critical | Immediate security gap |
| CA policy grant controls weakened (MFA removed, device compliance removed) | Critical | Silent security degradation |
| Security defaults disabled | Critical | Tenant-wide MFA dropped |
| Global Admin added | High | Privilege escalation |
| Auth method enabled (SMS/Voice re-enabled) | High | Weak auth method reintroduced |
| Guest access policy loosened | High | External collaboration risk |
| Password policy weakened | Medium | Longer exposure window |
| PIM role assignment changed | Medium | Privilege scope change |
| App registration added | Low | New application surface |
| Named location changed | Low | Network policy adjustment |

### Audit Log Query Pattern

```typescript
// Poll for recent security-relevant audit events
const since = lastPollTimestamp.toISOString();
const filter = `activityDateTime ge ${since} and category eq 'Policy' or category eq 'RoleManagement'`;
const events = await client.api('/auditLogs/directoryAudits')
  .filter(filter)
  .top(100)
  .orderby('activityDateTime desc')
  .get();
```

The audit log returns `targetResources[].modifiedProperties[]` with `displayName`, `oldValue`, and `newValue` — but these are strings, not JSON, and they're inconsistent across activity types. This is why the verify phase (re-collect + diff) is essential.

### Drift Alert Schema (Tenant-Scoped)

```sql
CREATE TABLE drift_alerts (
  id NVARCHAR(36) PRIMARY KEY DEFAULT NEWID(),
  tenant_id NVARCHAR(36) NOT NULL,
  area NVARCHAR(50) NOT NULL,          -- e.g., 'conditionalAccess', 'adminRoles'
  severity NVARCHAR(20) NOT NULL,       -- Critical, High, Medium, Low
  activity_type NVARCHAR(100),          -- from directoryAudit activityDisplayName
  actor_upn NVARCHAR(200),              -- who made the change (from initiatedBy)
  before_snapshot NVARCHAR(MAX),        -- the baseline area snapshot
  after_snapshot NVARCHAR(MAX),         -- the re-collected area snapshot
  diff_summary NVARCHAR(MAX),           -- human-readable diff summary
  audit_event_id NVARCHAR(100),         -- Graph auditLog event ID for correlation
  detected_at DATETIME2 NOT NULL DEFAULT GETDATE(),
  dismissed_at DATETIME2 NULL,
  dismissed_by NVARCHAR(200) NULL,
  remediation_job_id NVARCHAR(36) NULL, -- FK to remediationJobs if user remediates
  created_at DATETIME2 NOT NULL DEFAULT GETDATE()
);
```

### Per-Area Targeted Re-Collection

Instead of re-running the full 16-area `collectFacts()`, the drift verify phase calls a new `collectSingleArea(client, areaName)` function that runs only the relevant batch request + parser. This keeps the verification fast (~200ms per area vs. ~4s for full collection) and minimizes Graph API consumption.

```typescript
// In packages/audit/src/collectors/fact-collector.ts (new export)
export async function collectSingleArea(
  client: Client,
  area: keyof AuditFacts,
): Promise<AuditFacts[typeof area]> {
  // Run only the batch request + parser for this specific area
  // Returns just the typed area facts
}
```

</specifics>

<deferred>
## Deferred Ideas

- **Graph webhooks / change notifications** — would give true real-time detection (seconds, not minutes). Blocked by webhook support gaps for CA/Intune/DLP resources. Revisit when Microsoft expands webhook coverage.
- **Custom drift sensitivity thresholds** — let users configure which change types they care about and at what severity. V2 feature.
- **Multi-tenant drift correlation** — "3 tenants changed the same policy this week" pattern detection. V2 analytics.
- **Email/SMS/Teams alert delivery** — send drift alerts via channels beyond the dashboard. Notification pipeline.
- **Auto-remediation on drift** — automatically revert drift to baseline when detected. High-risk; needs user confirmation workflow. Could layer on Phase 7 remediation engine.
- **Drift trend analytics** — how often does each tenant drift, which areas drift most, is the drift rate improving. V2 reporting.
- **Drift allowlist** — "I know about this change, stop alerting me." Beyond simple dismiss — persists across future detections of the same pattern.

</deferred>

<claude_discretion>
## Claude's Discretion

The planner/executor may decide these without asking:
- Exact audit log activity type filter strings (which `activityDisplayName` values to match per category)
- Polling backoff strategy when a tenant's audit log returns no new events
- Diff display format (JSON side-by-side vs. unified diff vs. semantic field-level comparison)
- Whether `collectSingleArea` reuses batch helper or makes standalone GET calls
- Drift alert deduplication strategy (same area changed multiple times in one poll cycle)
- UI component naming and file locations within `apps/web/src/components/drift/` (new directory)
- Number of dashboard notification components and their layout
- Whether drift detail page is a new route or a drawer off the action queue
- Test structure for the drift poller and diff engine

</claude_discretion>

---

*Phase: 08-drift-detection*
*Context gathered: 2026-03-24*
*Depends on: Phase 6 (scheduler pattern), Phase 2 (SignalR, fact collector), Phase 5 (action queue), Phase 7 (remediation link)*
*Next step: `/gsd:plan-phase 8` to generate 2 plan files*
