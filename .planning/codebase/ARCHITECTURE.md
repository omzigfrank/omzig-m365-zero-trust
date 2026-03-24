# Architecture

**Analysis Date:** 2026-03-23

## Pattern Overview

**Overall:** Multi-layer monorepo — Turborepo workspace with two apps (`api`, `web`) and three shared packages (`audit`, `db`, `shared`), plus a separate Azure Functions layer and IaC layer.

**Key Characteristics:**
- Two distinct runtime planes: a TypeScript web platform (Next.js + Hono API) for the MSP management UI, and a PowerShell Azure Functions plane for actual M365 deployment/configuration
- Per-tenant database isolation: each onboarded M365 tenant gets its own Azure SQL database in an elastic pool; platform metadata lives in a shared "control plane" database
- Audit pipeline is async and fire-and-forget: API returns 202 immediately, pipeline runs in background and pushes progress via Azure SignalR with polling fallback
- Compliance framework coverage spans four frameworks: Entra ID (CISA SCuBA), NIST CSF, NIST 800-53, and NIST 800-207 Zero Trust Architecture

## Layers

**Frontend (Next.js App Router):**
- Purpose: MSP dashboard for managing M365 tenants, triggering audits, viewing findings
- Location: `apps/web/src/`
- Contains: App Router pages, feature component groups, custom hooks, API client lib, MSAL auth
- Depends on: `@omzig/shared` (types), `apps/api` (HTTP)
- Used by: End users (MSP staff) via browser

**API (Hono on Node.js):**
- Purpose: REST API for the web frontend; handles auth, tenant CRUD, audit triggering, action queue
- Location: `apps/api/src/`
- Contains: Route handlers, middleware (auth, RBAC, MFA, tenant context), services
- Depends on: `@omzig/db` (database access), `@omzig/audit` (pipeline), `@omzig/shared` (types)
- Used by: `apps/web` frontend

**Audit Package (`@omzig/audit`):**
- Purpose: Self-contained audit engine — collects facts from MS Graph API and evaluates ~101 controls across 4 frameworks
- Location: `packages/audit/src/`
- Contains: Collectors (graph batching), evaluators (per-framework), registry (control definitions), pipeline (runner, maturity, progress emitter, rate limiter, token manager), remediation
- Depends on: `@microsoft/microsoft-graph-client`, `@omzig/db`
- Used by: `apps/api` (via `runAuditPipeline` and `getAllControls`)

**Database Package (`@omzig/db`):**
- Purpose: Drizzle ORM schema definitions and connection utilities for both the control-plane database and per-tenant databases
- Location: `packages/db/src/`
- Contains: Control-plane schema (`organizations`, `users`, `tenants`, `tenantUserAccess`, `auditLog`, `setupWizardState`, `actionQueueDismissals`), tenant schema (`auditRuns`, `auditFindings`, `maturityScores`), connection factory
- Depends on: Azure SQL (mssql driver)
- Used by: `apps/api`, `packages/audit`

**Shared Package (`@omzig/shared`):**
- Purpose: Cross-package types, constants, and role/permission utilities
- Location: `packages/shared/src/`
- Contains: `ApiResponse<T>` type, role definitions (`Owner`, `Admin`, `Analyst`, `Read-only`), role hierarchy, error codes, tenant/org/action-queue types
- Depends on: Nothing (leaf package)
- Used by: `apps/api`, `apps/web`, `packages/audit`

**Azure Functions (PowerShell):**
- Purpose: Actual M365 Zero Trust deployment — creates Conditional Access policies, Intune compliance, Defender configuration, DLP labels via MS Graph API
- Location: `functions/`
- Contains: Orchestrator, Deploy-Identity, Deploy-Devices, Deploy-Security, Deploy-Data, shared GraphHelper module, Tests stubs
- Depends on: Azure Managed Identity, MS Graph API, PowerShell modules (Az, Microsoft.Graph, ExchangeOnlineManagement)
- Used by: Azure Marketplace managed app deployment flow; standalone MSP use

**Infrastructure as Code (Bicep):**
- Purpose: Azure resource provisioning — CA policies via ARM, Log Analytics, Sentinel, Intune compliance policies, DLP labels
- Location: `bicep/`
- Contains: `main.bicep` (entry), identity, devices, security, data, network, lighthouse, platform modules
- Depends on: Azure Resource Manager
- Used by: CI/CD pipelines, managed app deployment

## Data Flow

**Audit Pipeline Flow:**

1. Frontend calls `POST /api/tenants/:tenantId/audits` with delegated Graph `accessToken`
2. API route inserts `auditRuns` record (status=`running`) in the tenant's isolated database
3. API returns HTTP 202 immediately with `auditId`
4. `runAuditPipeline` fires asynchronously (fire-and-forget); opens its own DB connection to the tenant database
5. Pipeline calls `collectFacts(graphClient)` — executes 2 Graph `$batch` requests (12 endpoints) plus 3 standalone calls (MFA registration, PIM, sensitivity labels)
6. Pipeline iterates all ~101 controls from the registry; each control's `evaluator(facts)` runs synchronously against collected facts
7. Each finding is persisted to `auditFindings` table; SignalR progress message pushed after each control
8. After all controls, `calculateMaturitySnapshot` computes NIST 800-207 tenet scores; saved to `maturityScores`
9. `auditRuns` record updated to `completed` with pass/fail counts
10. Frontend receives real-time updates via Azure SignalR; falls back to 3-second polling if SignalR unavailable

**Tenant Onboarding Flow:**

1. Frontend wizard collects tenant details and connection method (OAuth delegated or GDAP app-only)
2. API `POST /api/tenants` creates pending tenant record in control-plane DB
3. OAuth consent or GDAP verification routes acquire M365 tokens
4. `provisionTenant()` service: creates UUID-named database in Azure SQL elastic pool, runs Drizzle migrations, stores token in Azure Key Vault, marks tenant `active`, grants onboarding user access
5. Wizard state persisted to `setupWizardState` table per org

**Authentication Flow:**

1. User authenticates via MSAL (Entra ID PKCE/redirect) in the Next.js frontend
2. MSAL acquires JWT Bearer token; included as `Authorization: Bearer <token>` on all API requests
3. API's `createAuthMiddleware` validates JWT against Entra ID JWKS endpoint (`RS256`, checks `iss` and `aud`)
4. `requireMfa()` middleware checks `amr` claim for MFA enforcement
5. `requireRole()` middleware resolves user's highest Entra app role, checks for per-tenant overrides via `X-Tenant-Id` header, sets `effectiveRole` on Hono context

**State Management (Frontend):**

- No global state library; each feature uses a custom hook
- `useAudit` manages audit lifecycle (idle/running/complete/error), SignalR connection, and polling fallback
- `useTenants`, `useOnboarding`, `useActionQueue` handle their respective domains
- `useAuth` wraps MSAL account state

## Key Abstractions

**Control Registry:**
- Purpose: Defines all audit controls — id, description, product, severity, compliance mappings (NIST 800-53, NIST CSF, NIST 800-207 tenet), and the evaluator function
- Examples: `packages/audit/src/registry/entra-id-controls.ts`, `nist-csf-controls.ts`, `nist-zta-controls.ts`
- Pattern: `getAllControls()` aggregates all registries; each control has `evaluator: (facts: AuditFacts) => EvaluatorResult`

**AuditFacts Snapshot:**
- Purpose: Immutable snapshot of all tenant Graph API data collected in one pipeline pass; passed to every evaluator
- Examples: `packages/audit/src/types.ts`, `packages/audit/src/collectors/fact-collector.ts`
- Pattern: Collected once at pipeline start; evaluators are pure functions over this snapshot — no additional Graph calls during evaluation

**ApiResponse<T> Envelope:**
- Purpose: Consistent response shape for all API endpoints
- Examples: `packages/shared/src/types/api.ts`
- Pattern: `{ data?: T, error?: ApiError, meta?: { correlationId, timestamp } }` — all Hono routes return this shape

**Per-Tenant DB Isolation:**
- Purpose: Each M365 tenant gets an isolated Azure SQL database; name is a UUID-based opaque string (no PII)
- Examples: `packages/db/src/tenant/schema.ts`, `apps/api/src/services/tenant-provisioning.ts`
- Pattern: `getTenantDb(databaseName)` called by the audit pipeline; tenant middleware injects `tenantDb` into Hono context for route handlers

**RBAC with Per-Tenant Overrides:**
- Purpose: Org-level base role (from Entra app roles claim) can be overridden per-tenant (upgrade or downgrade)
- Examples: `apps/api/src/middleware/rbac.ts`, `packages/shared/src/constants/roles.ts`
- Pattern: `requireRole('Owner', 'Admin', 'Analyst')` middleware; `X-Tenant-Id` header triggers override lookup

## Entry Points

**API Server:**
- Location: `apps/api/src/index.ts`
- Triggers: `@hono/node-server` listens on `PORT` env var (default 8080)
- Responsibilities: Creates `Hono` app via `createApp()`, starts HTTP server

**API Application Factory:**
- Location: `apps/api/src/app.ts`
- Triggers: Imported by `index.ts` and by tests
- Responsibilities: Registers all middleware and routes in order: CORS, health (public), OAuth callback (public), JWK auth, MFA, protected routes (auth, tenants, wizard-state, action-queue, audits)

**Web App Root:**
- Location: `apps/web/src/app/layout.tsx`
- Triggers: Next.js App Router on browser load
- Responsibilities: MSAL initialization, `handleRedirectPromise()`, wraps all pages in `MsalProvider`

**Web App Pages:**
- `apps/web/src/app/page.tsx` — root/home
- `apps/web/src/app/dashboard/page.tsx` — tenant dashboard
- `apps/web/src/app/audit/page.tsx` — audit runner and findings view
- `apps/web/src/app/deploy/page.tsx` — deployment tools
- `apps/web/src/app/reports/page.tsx` — reports

**Audit Package Public API:**
- Location: `packages/audit/src/index.ts`
- Triggers: Imported by `apps/api/src/routes/audits.ts`
- Responsibilities: Exports `runAuditPipeline`, `getAllControls`, evaluator types

**Azure Functions Orchestrator:**
- Location: `functions/Orchestrator/`
- Triggers: HTTP POST (Azure Functions runtime) or called from ARM deployment
- Responsibilities: Validates config, fans out to Deploy-* sub-functions

## Error Handling

**Strategy:** Structured error responses at API layer; graceful degradation in audit pipeline per-control; retry with exponential backoff in Graph calls

**Patterns:**
- All API routes return `ApiResponse` with `error.code` from `ERROR_CODES` constants; never raw exceptions to clients
- Audit pipeline: per-control try/catch persists an `na` finding rather than aborting the run; pipeline-level errors mark the run `failed`
- Graph API rate limiting handled by `RateLimiter` in `packages/audit/src/pipeline/rate-limiter.ts`
- PowerShell functions: `Invoke-GraphWithRetry` wraps all Graph calls with 429/5xx retry logic and exponential backoff
- Frontend: `useAudit` hook catches errors, sets `status: 'error'` state; SignalR failure falls back to HTTP polling

## Cross-Cutting Concerns

**Logging:** `console.log`/`console.error` with `[omzig-api]` prefixes in API; PowerShell functions use `Write-Host "[INFO]"`, `Write-Warning "[WARN]"`, `Write-Error "[ERROR]"` pattern
**Validation:** Input validation in route handlers (req.json() with try/catch); Zod not used — TypeScript types enforced at compile time
**Authentication:** Entra ID JWT via MSAL (frontend) + JWKS validation (API); PowerShell functions use Azure Managed Identity (`Connect-MgGraph -Identity`)
**Secrets:** All secrets in Azure Key Vault; tenant auth tokens stored under `tenant-token-{tenantId}` secret names; never logged or committed

---

*Architecture analysis: 2026-03-23*
