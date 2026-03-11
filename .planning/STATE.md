---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in-progress
stopped_at: Completed 03-01-PLAN.md
last_updated: "2026-03-11T19:55:38Z"
last_activity: 2026-03-11 -- 31 ZTA evaluators ported, multi-framework types/schema extended
progress:
  total_phases: 8
  completed_phases: 2
  total_plans: 8
  completed_plans: 8
  percent: 42
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-10)

**Core value:** MSPs can see exactly where every client tenant falls short of Zero Trust compliance, fix it with confidence, and know immediately when something drifts back.
**Current focus:** Phase 3 in progress. Plan 01 (ZTA evaluators) complete. Plans 02-04 remaining.

## Current Position

Phase: 3 of 8 (Compliance Framework Mapping) — IN PROGRESS
Plan: 1 of 4 in current phase — COMPLETE
Status: Plan 03-01 complete (ZTA evaluators)
Last activity: 2026-03-11 -- 31 ZTA evaluators ported, multi-framework types/schema extended

Progress: [████░░░░░░] 42%

## Performance Metrics

**Velocity:**
- Total plans completed: 8
- Average duration: 10min
- Total execution time: 1.33 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 4 | 37min | 9min |
| 02-core-audit-engine | 3 | 33min | 11min |
| 03-compliance-framework-mapping | 1 | 10min | 10min |

**Recent Trend:**
- Last 5 plans: 01-04 (3min), 02-01 (9min), 02-02 (9min), 02-03 (15min), 03-01 (10min)
- Trend: Stable

*Updated after each plan completion*

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

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-03-11T19:55:38Z
Stopped at: Completed 03-01-PLAN.md
Resume file: .planning/phases/03-compliance-framework-mapping/03-01-SUMMARY.md
