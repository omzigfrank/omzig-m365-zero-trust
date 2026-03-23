# Phase 2: Core Audit Engine - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the collect-then-evaluate audit pipeline so users can trigger an on-demand audit of an M365 tenant and see pass/fail results for every CISA SCuBA Entra ID control. The engine collects tenant configuration state via Graph API, evaluates it against 29 Entra ID controls, stores results in the per-tenant database, and pushes real-time progress via SignalR. No tenant onboarding flows (Phase 4), no multi-framework scoring (Phase 3), no dashboard drill-down UX (Phase 5), no scheduled scans (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Audit Pipeline Architecture
- Hybrid approach: TypeScript for fact collection (Graph API calls via Microsoft Graph SDK) and evaluator logic (ported from PowerShell). PowerShell Azure Functions kept as fallback for v2 workloads (Exchange, Teams, SharePoint, Defender) that require PowerShell-only modules.
- Direct port of existing PowerShell evaluator logic to TypeScript -- same control IDs, same pass/fail conditions. Proven logic, no interpretation divergence.
- Collect-all-first pipeline (AUDIT-04): single pass fetches all tenant configuration into a facts object, then all evaluators run against that snapshot. Fewer Graph API calls, easier caching/retry.
- Product-aware directory structure: organize evaluators by product (entra-id/, exchange/, teams/) from the start. Phase 2 only implements entra-id/ but the pattern is extensible for v2 products.

### Finding Detail and Storage
- Full detail per finding: control ID, rating (pass/fail/warn/na), severity (Critical/High/Medium/Low), affected setting name, current value, expected value, message, remediation action. Covers AUDIT-03 and AUDIT-06.
- Relational storage: auditRuns table (one row per scan) + auditFindings table (one row per check result, FK to auditRuns). Clean model for querying historical results per control.
- Static TypeScript control registry: control definitions (ID, description, requirement level, severity, NIST 800-53 cross-ref) defined as TypeScript objects in the codebase. Versioned with code, no DB migration needed to add/update controls.
- Denormalize control metadata into findings rows: each finding stores control ID, description, severity, requirement level. Historical findings remain accurate even if control definitions change in future code deploys.

### Audit Progress and Feedback
- Real-time progress via SignalR: push updates as each check completes -- "12/29 checks complete -- Evaluating MS.AAD.3.1v1 (MFA requirement)..."
- Count + current check name format: shows numeric progress and what's actively running.
- Asynchronous execution: POST /api/audits returns 202 with audit ID immediately. Backend runs checks, pushes progress via SignalR, marks complete when done. Non-blocking, scalable.
- Individual check retry: users can retry specific failed checks (e.g., permission errors) without re-running the entire audit. Results update in-place on the existing audit run.

### Graph API Scoping (AUTH-06)
- Delegated token approach: during onboarding (Phase 4), client admin consents to Graph scopes. Platform stores refresh token (encrypted in Key Vault via envelope encryption from Phase 1) and uses it for audit calls.
- All read scopes requested upfront: request broad read permissions at onboarding covering all future products (Exchange, Teams, SharePoint). User consents once, avoids re-consent when v2 products arrive.
- Per-check permission mapping: each failed finding shows which Graph permission it needed. Summary shows "3 checks failed due to missing Policy.Read.All". User sees exactly what to fix.
- Auto-refresh with fallback: attempt silent token refresh using stored refresh token. If refresh fails (revoked, consent withdrawn), mark tenant as "needs re-authorization" and notify admin.
- Track and throttle Graph API rate limits: monitor request count vs limits during audit. If approaching 80%, slow down check execution with backoff. Log consumption per audit run.
- Microsoft Graph SDK (@microsoft/microsoft-graph-client) for all Graph API calls. Official SDK with built-in auth, batching, pagination, and retry. Type-safe models via @microsoft/microsoft-graph-types.
- Batch requests where possible ($batch endpoint, up to 20 per batch) to reduce HTTP round-trips during fact collection.

### Claude's Discretion
- Exact TypeScript evaluator file organization within the product directories
- Graph API error handling and retry backoff strategy
- SignalR hub naming and message format
- Audit run status state machine transitions
- Test structure and mocking approach for Graph API calls

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **PowerShell evaluators** (`scripts/audit/CisaEvaluatorRegistry.ps1`, `NistEvaluatorRegistry.ps1`): 60+ CISA and 35 NIST evaluator functions. Direct port source for TypeScript evaluators -- same control IDs and pass/fail logic.
- **Tenant fact collector** (`scripts/audit/TenantFactCollector.ps1`): Collects 15+ data areas from Graph API (CA policies, MFA, auth methods, devices, roles, etc.). Port collection logic to TypeScript using Microsoft Graph SDK.
- **CISA catalog fetcher** (`scripts/audit/CisaCatalogFetcher.ps1`): Parses CISA SCuBA baseline specs from ScubaGear v1.7.1. Reference for control metadata (IDs, descriptions, requirement levels, NIST mappings).
- **Frontend audit types** (`apps/web/src/lib/types.ts`): AuditCheck, AuditSummary, FrameworkReport, AuditEnvelope, AuditState types already defined. Extend or align with new backend types.
- **Frontend audit hook** (`apps/web/src/hooks/useAudit.ts`): React hook managing audit execution state. Update to use new async API + SignalR.
- **Frontend audit components** (`apps/web/src/components/audit/`): FrameworkSelector, ScoreOverview, AuditResults, ExportButtons. Reusable for Phase 2 results display.
- **Key Vault service** (`apps/api/src/services/keyvault.ts`): Tenant token encryption/decryption ready. Used for storing delegated Graph tokens.
- **Tenant middleware** (`apps/api/src/middleware/tenant.ts`): Per-request tenant context with DB connection. Audit routes use this to get tenant DB for result storage.
- **Existing Run-Audit function** (`functions/Run-Audit/run.ps1`): Azure Function orchestrating CISA+NIST evaluation. Pattern reference for the TypeScript pipeline.

### Established Patterns
- Hono API with separated app.ts/index.ts for testability
- Middleware chain: health (public) → JWK → MFA → RBAC → tenant context
- Vitest for unit testing with mock injection via createMiddleware
- Drizzle ORM with mssqlTable for per-tenant database schemas
- On-demand per-tenant DB connections (open/close per request)
- Key Vault envelope encryption (RSA-OAEP) for sensitive data

### Integration Points
- New audit routes register in `apps/api/src/app.ts` after auth middleware
- Audit results stored in per-tenant databases using existing connection factory (`packages/db/src/connection.ts`)
- Tenant tokens retrieved from Key Vault via `keyvault.ts` service
- SignalR already provisioned via Bicep (`bicep/platform/signalr.bicep`) in serverless mode
- Existing auditRuns stub table in `packages/db/src/tenant/schema.ts` -- extend with findings table
- Frontend audit hook (`useAudit.ts`) and API client (`api-client.ts`) need updates for async + SignalR

</code_context>

<specifics>
## Specific Ideas

- Port PowerShell evaluators 1:1 to TypeScript -- same control IDs (e.g., MS.AAD.1.1v1), same pass/fail conditions, proven logic
- The collect-then-evaluate pipeline mirrors how CISA ScubaGear works: collect all facts, then evaluate -- not interleaved
- Graph SDK batching for fact collection: group independent calls into $batch requests (up to 20/batch) for speed
- Rate limit monitoring with 80% threshold and backoff -- the platform monitors its own Graph API consumption per tenant
- Individual check retry is important for MSPs: if one permission is missing, fix it and retry just that check without re-running the whole audit

</specifics>

<deferred>
## Deferred Ideas

- NIST 800-207 / 800-53 / CSF 2.0 evaluators -- Phase 3 (Compliance Framework Mapping)
- Tenant onboarding and OAuth consent flow -- Phase 4 (Tenant Onboarding)
- Dashboard drill-down and filtering -- Phase 5 (Dashboard and Findings UX)
- Scheduled automated scans -- Phase 6 (Scheduling, Reporting and Trending)
- Config snapshots for drift comparison -- Phase 8 (Drift Detection)
- v2 product evaluators (Exchange, Teams, SharePoint, Defender) -- v2 via PowerShell Azure Functions sidecar

</deferred>

---

*Phase: 02-core-audit-engine*
*Context gathered: 2026-03-11*
