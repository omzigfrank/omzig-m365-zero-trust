# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-10)

**Core value:** MSPs can see exactly where every client tenant falls short of Zero Trust compliance, fix it with confidence, and know immediately when something drifts back.
**Current focus:** Phase 1: Foundation and Authentication

## Current Position

Phase: 1 of 8 (Foundation and Authentication)
Plan: 3 of 4 in current phase
Status: Executing plans
Last activity: 2026-03-10 -- Completed 01-03 Database connection factory, tenant isolation, Key Vault integration

Progress: [██░░░░░░░░] 20%

## Performance Metrics

**Velocity:**
- Total plans completed: 3
- Average duration: 11min
- Total execution time: 0.57 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 3 | 34min | 11min |

**Recent Trend:**
- Last 5 plans: 01-01 (16min), 01-02 (9min), 01-03 (9min)
- Trend: Improving

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
- [Phase 1]: Always Encrypted for sensitive columns, opaque tenant DB names
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

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-03-10
Stopped at: Completed 01-03-PLAN.md
Resume file: .planning/phases/01-foundation-and-authentication/01-03-SUMMARY.md
