# Phase 7: Remediation Engine — Context

**Gathered:** 2026-03-24
**Status:** Ready for research → planning

<domain>
## Phase Boundary

Build the **remediation engine** so MSPs can fix compliance failures through the platform — one-click auto-fix for SAFE findings, guided wizard with impact preview for RISKY findings, full audit trail, and rollback capability. The engine transforms the read-only audit platform into a read-write compliance automation tool while preserving minimum-privilege permissions and safe-by-default deployment patterns (Report-Only → Enforce).

This phase depends on Phase 5 (already complete), which delivered the `remediation` registry containing documentation-grade metadata (steps, admin portal URLs, PowerShell snippets, estimated impact) for each control. Phase 7 operationalises that registry by wiring each entry to an actual executable Graph API remediation.

**Explicit non-goals for Phase 7:**
- Batch remediation across multiple tenants — deferred to EXTREMED-03 backlog
- Exchange / Defender / SharePoint remediations — deferred to EXTREMED-01/02 (requires PowerShell sidecar)
- Drift detection — Phase 8
- Scheduled remediation — covered manually via Phase 6 scheduler if wanted
- White-label / branded remediation reports — deferred to REPORT-01

</domain>

<decisions>
## Implementation Decisions (gathered from user)

### Write Permissions: Just-In-Time Per Remediation Type
- The tenant onboarding OAuth consent flow stays **read-only** (Phase 4 scopes unchanged).
- The first time a user clicks "Remediate" on a finding of type X, the UI triggers an **incremental consent popup** requesting exactly the write scopes needed for type X.
- Scope-to-remediation mapping examples:
  - CA policy remediations → `Policy.ReadWrite.ConditionalAccess`
  - Authentication methods → `Policy.ReadWrite.AuthenticationMethod`
  - Authorization policy / user consent → `Policy.ReadWrite.Authorization`
  - Privileged roles / PIM → `RoleManagement.ReadWrite.Directory`
  - Security defaults → `Policy.ReadWrite.SecurityDefaults`
- Once a scope is consented for a tenant, subsequent remediations of the same type proceed silently (token cached in Key Vault via Phase 1 envelope encryption).
- Consent state (which scopes are active per tenant) tracked in a new `tenantRemediationConsents` table on the control plane.
- **REMED-08 directly satisfied** by this model: minimum-privilege, write scopes requested only at activation.

### Execution Model: Async with SignalR Progress
- POST approval endpoints return **202 Accepted** immediately with a `remediationJobId`.
- A new `remediationJobs` table (tenant-scoped) stores queue state and worker picks up pending rows.
- Worker calls Graph API with the remediation-specific write token, pushes progress via the existing SignalR hub (reusing `pushAuditProgress` pattern from Phase 2 with a new message type), and updates `remediationJobs.status` through `pending → running → completed | failed | rolled_back`.
- Frontend subscribes via the existing SignalR connection with polling fallback (same pattern as Phase 2 audit hook).
- This model supports the **multi-step RISKY flow** (Report-Only deploy → user validates impact → Enforce) as sequenced job phases, not two separate HTTP round trips.
- Worker runs in the same Hono API process (no separate container) — in-process setInterval poller identical to the Phase 6 scheduler pattern (`startRemediationWorker()` called at server startup in `index.ts`).

### Rollback Storage: Full Config Snapshot Per Remediation
- Each `remediationJobs` row stores a **full `beforeSnapshot`** JSON blob of the Graph resource being modified (e.g., full CA policy JSON including all downstream fields, not just the fields we changed).
- After successful execution, it also stores **`afterSnapshot`** for diff display and rollback fidelity.
- Rollback = PATCH/PUT the `beforeSnapshot` back through Graph API. For DELETE-type remediations (e.g., removing a guest user), rollback = POST to recreate.
- Trade-off accepted: ~10-50KB per remediation row vs. storage minimization. For an MSP running 100 remediations/month across 50 tenants, that's ~25MB/month — negligible.
- **REMED-05** satisfied: before/after values + timestamp + approver are all in the row.
- **REMED-06** satisfied: `POST /remediations/:id/rollback` route writes `beforeSnapshot` back via Graph.

### Plan Split: Engine+DB → SAFE flow → RISKY wizard
- **07-01 (Wave 1):** Classification + DB schema + Graph write client + dispatcher/worker + rollback service. All backend plumbing. No API routes, no UI.
- **07-02 (Wave 2, depends on 07-01):** SAFE remediation API routes (POST approve, POST rollback, GET audit trail) + frontend one-click "Remediate" button + audit log view + rollback UI. Satisfies REMED-01, REMED-02, REMED-05, REMED-06, REMED-07, REMED-08.
- **07-03 (Wave 3, depends on 07-02):** RISKY guided wizard UI with impact preview (e.g., "47 users will be blocked"), Report-Only deploy step, monitor sign-in logs in between, Enforce step. Satisfies REMED-03, REMED-04.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets (already in repo)

**Phase 5 — Remediation Registry (`packages/audit/src/remediation/`):**
- `entra-id-remediation.ts` (29 entries) — CISA SCuBA Entra ID controls with documentation-grade metadata
- `nist-80053-remediation.ts` — NIST 800-53 remediation mappings
- `nist-csf-remediation.ts` — NIST CSF 2.0 remediation mappings
- `nist-zta-remediation.ts` — NIST 800-207 ZTA remediation mappings
- `types.ts` — `RemediationEntry` shape with `steps[]`, `adminPortalUrl`, `powershell`, `estimatedImpact`
- Phase 7 extends this with `classification: 'SAFE' | 'RISKY'`, `writeScopes: string[]`, `executor: (client, tenant, facts) => Promise<ExecutionResult>`, and `rollbackExecutor: (client, snapshot) => Promise<void>` per entry.

**Phase 2 — Audit Pipeline Patterns (`packages/audit/src/pipeline/`):**
- `audit-runner.ts` — Collect-then-evaluate pipeline. Phase 7 mirrors this with collect-before-state → write → collect-after-state pattern.
- `rate-limiter.ts` — Graph API rate limiter with 80% threshold backoff. Phase 7 reuses directly for write calls.
- `token-manager.ts` — Phase 4 handoff placeholder. Phase 7 wires real incremental-consent token refresh here.
- `progress-emitter.ts` — SignalR progress push. Phase 7 extends message types with `remediation_started`, `remediation_progress`, `remediation_completed`, `remediation_failed`, `remediation_rolled_back`.

**Phase 2 — Graph Client (`packages/audit/src/collectors/graph-client.ts`):**
- `createGraphClient(accessToken)` factory. Phase 7 uses the same factory with write-scope tokens.
- `batch-helper.ts` — $batch helper for efficient multi-resource reads. Not directly reused for writes (Graph $batch supports writes but they're not atomic) but the error-handling pattern carries over.

**Phase 6 — Scheduler Pattern (`apps/api/src/services/scheduler.ts`):**
- Direct pattern match for the remediation worker: in-process setInterval poller, concurrency control, race-guarded state update before async launch, idempotent start/stop, exported pure helper.
- Phase 7's `remediation-worker.ts` copies this structure with `MAX_CONCURRENT_REMEDIATIONS = 2` (lower than scheduler's 3 because writes are more consequential) and `STAGGER_SECONDS = 30` (tighter than scheduler's 300s because remediations are user-initiated, not background).

**Phase 1 — Key Vault (`apps/api/src/services/keyvault.ts`):**
- Envelope encryption for tenant tokens. Phase 7 stores remediation-scope refresh tokens here via a new `storeRemediationToken(tenantId, scopeBundle, token)` helper.

**Phase 4 — OAuth Consent Flow:**
- Existing tenant onboarding consent uses delegated tokens. Phase 7 adds incremental consent via `msalInstance.acquireTokenPopup({ scopes: writeScopes, account })` from the frontend. The resulting refresh token is sent to the backend and stored per (tenant, scopeBundle) pair.

**Phase 2 — Audit Findings Schema (`packages/db/src/tenant/schema.ts`):**
- `auditFindings` table. Phase 7 adds a `remediationJobs` table with FK to `auditFindings.id` so each remediation links to the finding it fixes.

### Established Patterns

- Hono API with typed env (Phase 2 pattern for tenantDb/tenantMeta/jwtPayload on route context)
- Middleware chain: health → JWK → MFA → RBAC → tenant context
- Drizzle ORM with mssqlTable for per-tenant databases
- On-demand per-tenant DB connections (open/close per request; async workers open their own via `getTenantDb(databaseName)` — PITFALL 4)
- Key Vault envelope encryption (RSA-OAEP) for sensitive data
- Vitest with mock injection via createMiddleware
- SignalR REST API push with JWT HS256 signing (Phase 2)
- In-process setInterval workers with race-guarded state updates (Phase 6)

### New Code Integration Points

- New routes register in `apps/api/src/app.ts` after existing audit routes
- New tenant-scoped table `remediationJobs` added to `packages/db/src/tenant/schema.ts`
- New control-plane table `tenantRemediationConsents` added to `packages/db/src/control-plane/schema.ts`
- New service `apps/api/src/services/remediation-worker.ts` wired into `index.ts` alongside the scheduler
- Frontend `FindingDetailDrawer.tsx` (Phase 5) extended with a "Remediate" button that opens either a confirm dialog (SAFE) or the wizard (RISKY) based on the new `classification` field

</code_context>

<specifics>
## Specific Ideas

### SAFE vs. RISKY Classification Rubric

A remediation is **SAFE** if **all** of the following are true:
- Blast radius is provably bounded to tenant configuration (no user impact outside the change)
- Rollback is deterministic (single Graph API call restores prior state)
- No chance of locking out users (break-glass accounts excluded from any CA changes)
- No chance of data loss or exfiltration risk
- Change takes effect immediately with no secondary propagation window

Examples (from Phase 5 remediation registry):
- **SAFE:** Enable mailbox auditing, block legacy auth via CA (Report-Only default), enable Security Defaults on unconfigured tenants, disable SMS/Voice auth methods (if at least one strong method is configured), set password expiry to never (modern best practice), require admin MFA if admin-level CA policy exists
- **RISKY:** Require compliant devices (can lock out users on non-enrolled devices), enforce phishing-resistant MFA for all users (requires FIDO2/Windows Hello rollout), block guest access (impacts existing collaboration), disable user consent to apps (breaks existing third-party integrations), sign-in risk policies (false positives can lock out legitimate users)

Every entry in the `remediation` registry gets an explicit `classification: 'SAFE' | 'RISKY'` field. The Plan 07-01 task that adds this field also writes a brief `classificationRationale: string` per entry explaining why.

### Report-Only → Enforce Flow (REMED-04)

For RISKY CA policy remediations:
1. User clicks "Remediate" → opens wizard
2. Wizard shows impact preview (e.g., "Your tenant has 47 users on non-compliant devices. Enforcing this policy would block 23 of them who have signed in in the last 30 days.") — computed from existing `AuditFacts`
3. User clicks "Deploy in Report-Only mode"
4. Worker creates CA policy with `state: enabledForReportingButNotEnforced`, pushes progress
5. Remediation row updated to `status: 'report_only_deployed'` with the policy object ID stored
6. Wizard shows "Policy deployed in Report-Only. Monitor sign-in logs for 24-72 hours." with a link to Sign-in logs blade
7. Later, user returns to the finding (now showing "Report-Only deployed") and clicks "Enforce"
8. Worker PATCHes the policy to `state: enabled`, row advances to `completed`
9. Either step can be rolled back via stored snapshot

### Prerequisites Validation (REMED-07)

Before launching any remediation worker job, validate prerequisites by re-running a targeted subset of fact collection:
- CA policy that excludes break-glass: confirm break-glass group exists with ≥1 member, confirm group is excluded
- Device compliance: confirm ≥1 compliant device exists (prevents lockout per existing Phase 1 warning in `CLAUDE.md`)
- MFA enforcement: confirm at least 80% of target users have registered MFA (reusing the MFA registration fact from Phase 2)
- Auth method disable: confirm at least one other strong method (Authenticator, FIDO2, Windows Hello) is enabled

Prerequisite failures return an actionable error message to the user, not a generic "validation failed."

### Graph API $batch for Reads During Validation

Prerequisites validation may need to fetch multiple Graph resources. Reuse the existing `executeBatch` helper from Phase 2 for these reads — keeps the validation step fast and consistent with the audit pipeline.

### Remediation Worker Concurrency

- `MAX_CONCURRENT_REMEDIATIONS = 2` (tighter than Phase 6 scheduler's 3) — writes are more consequential
- `STAGGER_SECONDS = 30` (tighter than scheduler's 300s) — user-initiated, not background
- Poll interval: 10 seconds (tighter than scheduler's 60s) — users are waiting on the UI
- Concurrency is per-process, not per-tenant. Individual tenant has no explicit cap but is naturally limited by the global queue depth.

</specifics>

<deferred>
## Deferred Ideas

- **Batch remediation** across multiple tenants ("enable DKIM across all 17 failing tenants") — EXTREMED-03 backlog. Would require per-tenant consent bundling and a cross-tenant dashboard.
- **Exchange / Defender / SharePoint remediations** — EXTREMED-01/02. Requires PowerShell sidecar Azure Function because these APIs are not fully Graph-native. Architectural pattern exists in existing `functions/Run-Audit/` reference.
- **White-label remediation reports** — REPORT-01. PDF report enumerating all remediations executed for a tenant over a time window, with MSP branding. Extends Phase 6's PDF service.
- **Approval workflows with multi-person signoff** — MSPs with strict change management. Could layer on top of the existing RBAC model (require Owner approval for RISKY, Admin for SAFE).
- **Scheduled / policy-driven auto-remediation** — "Auto-remediate any SAFE finding within 1 hour of detection." Extends the Phase 6 scheduler with a new `remediationPolicyFrequency` column and a pre-built policy filter.
- **Diff visualisation UI** — Show beforeSnapshot / afterSnapshot as a JSON diff in the audit trail view. Nice-to-have; v1 just shows them as two collapsible JSON blocks.
- **Dry-run mode** — "Show me what would happen" without actually calling Graph. Would require every executor to also implement a `dryRun(facts)` method returning projected changes. Probably overkill for v1.

</deferred>

<claude_discretion>
## Claude's Discretion

The executor may decide these without asking:
- Exact TypeScript file organisation within `packages/audit/src/remediation/executors/` — one file per control ID, one per control family, or one per write-scope bundle
- Graph API error handling specifics for write operations (which errors are retryable, which are terminal)
- Worker state machine transitions beyond the 5 required states (pending/running/completed/failed/rolled_back) — e.g., intermediate states like `awaiting_user_confirmation` for the Report-Only → Enforce flow
- SignalR message payload shape for remediation progress (but must follow existing AuditProgressMessage envelope style)
- Test structure for new executors — suggest one test file per control ID matching the evaluator test pattern
- UI component naming and file locations within `apps/web/src/components/remediation/` (new directory)
- Wizard step count and ordering within the RISKY guided flow — the must-haves are impact preview, Report-Only deploy, monitor pause, and Enforce; the exact number of screens is flexible
- Whether to use a shared `RemediationJob` type across backend and frontend or have separate `remediationJob` DB type and `RemediationJobView` frontend type

</claude_discretion>

---

*Phase: 07-remediation-engine*
*Context gathered: 2026-03-24*
*Depends on: Phase 5 (complete), Phase 2 patterns (complete), Phase 6 scheduler pattern (complete)*
*Next step: `/gsd:plan-phase 7` to generate 3 plan files*
