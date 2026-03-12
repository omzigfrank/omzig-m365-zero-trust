---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
stopped_at: Completed 04-04-PLAN.md
last_updated: "2026-03-12T02:10:00Z"
last_activity: 2026-03-12 -- 5-step tenant onboarding wizard
progress:
  total_phases: 8
  completed_phases: 4
  total_plans: 25
  completed_plans: 16
  percent: 64
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-10)

**Core value:** MSPs can see exactly where every client tenant falls short of Zero Trust compliance, fix it with confidence, and know immediately when something drifts back.
**Current focus:** Phase 4 complete. All 4 plans done. Ready for Phase 5 (Dashboard and Findings UX).

## Current Position

Phase: 4 of 8 (Tenant Onboarding and Management) — COMPLETE
Plan: 4 of 4 in current phase — COMPLETE
Status: 5-step onboarding wizard at /tenants/new with OAuth consent and GDAP paths
Last activity: 2026-03-12 -- 5-step tenant onboarding wizard

Progress: [██████░░░░] 64%

## Performance Metrics

**Velocity:**
- Total plans completed: 16
- Average duration: 9min
- Total execution time: 2.47 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 4 | 37min | 9min |
| 02-core-audit-engine | 3 | 33min | 11min |
| 03-compliance-framework-mapping | 5 | 38min | 8min |
| 04-tenant-onboarding | 4 | 40min | 10min |

**Recent Trend:**
- Last 5 plans: 03-05 (15min), 04-01 (5min), 04-02 (10min), 04-03 (10min), 04-04 (15min)
- Trend: Stable

*Updated after each plan completion*
| Phase 04 P04 | 15min | 1 tasks | 10 files |
| Phase 04 P03 | 10min | 2 tasks | 13 files |
| Phase 04 P02 | 10min | 2 tasks | 7 files |
| Phase 04 P01 | 5min | 2 tasks | 14 files |
| Phase 03 P05 | 15min | 2 tasks | 16 files |
| Phase 03 P04 | 8min | 2 tasks | 8 files |
| Phase 03 P03 | 5min | 1 tasks | 9 files |
| Phase 03 P02 | 6min | 1 tasks | 10 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Per-tenant DB isolation (elastic pool) is load-bearing -- must be proven in Phase 1 before any audit data flows
- [Roadmap]: Drift detection uses audit log polling, NOT Graph webhooks (webhooks don't support CA/Intune/DLP resources)
- [Roadmap]: Remediation and drift are last phases due to highest consequence of errors
- [Roadmap]: Phase 3 and Phase 4 can execute in parallel after Phase 2 completes
- [Roadmap]: Auth-06 (minimum-privilege Graph scopes) assigned to Phase 2 since scoping happens when the audit engine first calls Graph
- [Phase 1]: 4-role RBAC model (Owner/Admin/Analyst/Read-only) with Entra app roles + per-tenant database overrides
- [Phase 1]: Multi-org SaaS model with shared infra and org-level isolation
- [Phase 1]: Explicit tenant access (no implicit access to all tenants)
- [Phase 1]: Platform-enforced MFA validation (checks JWT claims, defense-in-depth)
- [Phase 1]: Setup wizard with full onboarding flow including first audit run
- [Phase 1]: Key Vault envelope encryption for sensitive columns, opaque tenant DB names
- [01-01]: Used drizzle-orm@beta (not stable) because mssql-core only exists in beta
- [01-01]: varchar(36) for UUID columns since drizzle mssql-core has no uniqueIdentifier type
- [01-01]: sql`GETDATE()` for datetime2 defaults since mssql-core has no defaultNow()
- [01-01]: Switched Next.js output from export to standalone for SSR support
- [01-02]: Separated app.ts from index.ts for testability (app exports Hono instance, index starts server)
- [01-02]: Used Hono verifyWithJwks with jwks_uri option for Entra ID JWKS endpoint validation
- [01-02]: Mock JWT injection in tests via createMiddleware instead of real JWKS calls
- [01-02]: Per-tenant role overrides use in-memory Map store (DB wired in Plan 03)
- [01-03]: Key Vault envelope encryption (RSA-OAEP) substitutes Always Encrypted -- Node.js tedious driver has no support
- [01-03]: azure-active-directory-default auth type for production SQL connections (works across Container Apps and local dev)
- [01-03]: drizzle-orm added as direct dependency of @omzig/api for eq/and operators (pnpm strict isolation)
- [01-03]: __dirname used instead of import.meta.url in migrate.ts (CJS output from Node16 module resolution)
- [02-02]: Hono typed environment (AuditEnv) for tenant-scoped routes instead of tsconfig excludes
- [02-02]: SignalR hub name 'audit' with JWT HS256 signing (5min push, 1hr negotiate)
- [02-02]: auditFindings denormalizes 16 columns of control metadata for historical accuracy
- [02-02]: Audit route RBAC: Analyst+ for trigger/retry, all authenticated for list/detail
- [02-03]: Pure evaluator functions: no Graph API calls inside evaluators, only during fact collection
- [02-03]: Advisory evaluators (4.1, 7.3, 7.4, 7.6, 7.8, 7.9) return 'warn' (not verifiable via Graph API)
- [02-03]: Pipeline opens own DB connection (PITFALL 4), closes in finally block
- [02-03]: Frontend SignalR with polling fallback (3s interval) when connection unavailable
- [02-03]: Unified AuditProgressMessage type: @omzig/audit is single source
- [03-01]: T6.3 emergency access returns advisory 'warn' (break-glass group data not in AuditFacts)
- [03-01]: T4.4 uses type assertion for untyped applications field on CA conditions
- [03-01]: ZTA control IDs follow NIST.ZTA.T{tenet}.{check}v1 format
- [03-01]: New auditFindings columns (nist_csf, nist_800_207_tenet) are nullable to preserve existing rows
- [03-03]: GV.OC-1 and RC.RP-1 return advisory 'warn' (organizational governance and recovery not auditable via Graph)
- [03-03]: CSF control IDs follow NIST.CSF.{function}.{category}-{number}v1 format
- [03-03]: CSF severity tiers: High for PR/DE, Medium for ID/RS, Low for GV/RC
- [Phase 03]: 800-53 evaluators are fully independent from CISA SCuBA evaluators per user locked decision
- [Phase 03]: 800-53 control IDs follow NIST.80053.{family}-{number}v1 format
- [Phase 03]: AU-12 counts 15 AuditFacts areas as telemetry sources; pass >= 5, warn 3-4, fail < 3
- [03-04]: Maturity levels: Traditional <40, Initial 40-69, Advanced 70-89, Optimal >=90 (configurable thresholds)
- [03-04]: Severity weights: Critical=4, High=3, Medium=2, Low=1 for weighted pass rate
- [03-04]: warn/na excluded from maturity pass/fail counts -- only pass/fail are scorable
- [03-04]: Overall maturity = average of per-tenet weighted pass rates
- [03-04]: Framework scores: pass/(pass+fail)*100 per product grouping
- [03-05]: Recharts RadarChart for ZTA maturity with dual Radar layers (solid current, dashed previous)
- [03-05]: FrameworkFilter multi-select checkboxes replace FrameworkSelector radio buttons (min 1 selected)
- [03-05]: Score cards always visible regardless of framework filter state
- [03-05]: .npmrc public-hoist-pattern for react/testing-library/recharts to fix pnpm strict mode jsdom tests
- [04-01]: Use authorize endpoint with prompt=admin_consent (not /adminconsent) to combine consent + code in one redirect
- [04-01]: HMAC-SHA256 state signing with 1-hour expiry for OAuth state parameter tamper protection
- [04-01]: databaseName and tokenSecretName nullable on tenants table (null during pending state)
- [04-01]: Graph API v1.0 GDAP endpoint for relationship verification (not Partner Center API)
- [04-01]: Replicate buildConfig pattern locally in tenant-provisioning.ts since connection.ts buildConfig is not exported
- [04-02]: OAuth callback route registered before auth middleware (Entra redirect has no JWT)
- [04-02]: Wizard-state PATCH uses upsert with optimistic locking (INSERT if no row, UPDATE with rowsAffected check)
- [04-02]: Vitest setup.ts mocks mssql globally to prevent transitive import failures from createApp()
- [04-02]: GET /api/tenants uses cached lastAuditScore for health (no per-tenant DB queries for dashboard MVP)
- [04-03]: TenantCard uses router.push for navigation (not Link) to support click handler on entire card div
- [04-03]: Tenant detail page reuses Phase 3 components (ScoreOverview, ZtaMaturityRadar, FrameworkBreakdown, AuditResults) via useAudit(tenantId)
- [04-03]: Tab navigation on detail page is client-side state (no URL routing) for simplicity
- [04-03]: TenantTable client-side sorting by column header click (no server-side sort for MVP)
- [04-04]: useRef(state) pattern for stale closure avoidance in async wizard callbacks
- [04-04]: setupWizardState table is source of truth, localStorage is session cache for fast hydration
- [04-04]: OAuth callback auto-advance via consent=success URL param triggers immediate step 4 provisioning
- [04-04]: Provisioning auto-advances to step 5 after 1-second delay for visual feedback

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-03-12T02:10:00Z
Stopped at: Completed 04-04-PLAN.md
Resume file: None
