# Codebase Structure

**Analysis Date:** 2026-03-23

## Directory Layout

```
omzig-m365-zero-trust/
├── apps/
│   ├── api/                    # Hono REST API (Node.js, TypeScript)
│   │   └── src/
│   │       ├── app.ts          # App factory (route registration)
│   │       ├── index.ts        # Server entry point
│   │       ├── middleware/     # Auth, RBAC, MFA, tenant context, error
│   │       ├── routes/         # Route handlers by feature
│   │       ├── services/       # Business logic services
│   │       └── __tests__/      # API integration tests
│   └── web/                    # Next.js 14 App Router frontend
│       └── src/
│           ├── app/            # App Router pages (layout, pages)
│           ├── components/     # Feature component groups + UI primitives
│           ├── hooks/          # Custom React hooks (state + API calls)
│           ├── lib/            # API client, type definitions, MSAL config
│           └── __tests__/      # Component tests
├── packages/
│   ├── audit/                  # @omzig/audit — audit engine package
│   │   └── src/
│   │       ├── collectors/     # Graph API data collection (facts, areas, batch)
│   │       ├── evaluators/     # Per-framework control evaluators
│   │       ├── pipeline/       # Audit runner, maturity, progress, rate limiter
│   │       ├── registry/       # Control definitions (all 4 frameworks)
│   │       ├── remediation/    # Remediation guidance per framework
│   │       ├── types.ts        # AuditFacts, AuditProgressMessage types
│   │       └── __tests__/      # Audit package tests + fixtures
│   ├── db/                     # @omzig/db — Drizzle ORM + Azure SQL
│   │   └── src/
│   │       ├── control-plane/  # Control-plane schema + migrations
│   │       ├── tenant/         # Per-tenant schema (auditRuns, findings, scores)
│   │       ├── connection.ts   # DB connection factories (MSI + SQL auth)
│   │       ├── migrate.ts      # Migration runner
│   │       └── index.ts        # Package exports
│   ├── shared/                 # @omzig/shared — cross-package types + constants
│   │   └── src/
│   │       ├── types/          # ApiResponse, tenant, org, roles, action-queue
│   │       ├── constants/      # Error codes, role definitions, role hierarchy
│   │       └── index.ts        # Re-exports all types and constants
│   └── tsconfig/               # @omzig/tsconfig — shared tsconfig presets
├── functions/                  # Azure Functions (PowerShell 7.4)
│   ├── Orchestrator/           # Entry point — validates config, fans out
│   ├── Deploy-Identity/        # CA policies, MFA via Graph API
│   ├── Deploy-Devices/         # Intune compliance policies
│   ├── Deploy-Security/        # Defender, Log Analytics, Sentinel
│   ├── Deploy-Data/            # DLP policies, sensitivity labels
│   ├── Deploy-Users/           # [Planned] User provisioning
│   ├── Deploy-Exchange/        # [Planned] Exchange Online config
│   ├── Deploy-Autopilot/       # [Planned] Device enrollment profiles
│   ├── Deploy-Collaboration/   # [Planned] SharePoint/Teams policies
│   ├── Deploy-Lighthouse/      # [Planned] Azure Lighthouse/GDAP setup
│   ├── Modules/                # Shared PowerShell modules (GraphHelper.psm1)
│   ├── Tests/                  # Pester unit tests (partial)
│   ├── host.json               # Functions runtime config
│   ├── requirements.psd1       # PowerShell module dependencies
│   └── profile.ps1             # Functions startup profile
├── bicep/                      # Azure Bicep IaC modules
│   ├── main.bicep              # Composition root
│   ├── main-rg.bicep           # Resource group scoped entry
│   ├── identity/               # CA policies, MFA (identity.bicep)
│   ├── devices/                # Intune compliance (devices.bicep)
│   ├── security/               # Defender, Log Analytics (security.bicep)
│   ├── data/                   # DLP, sensitivity labels (data.bicep)
│   ├── network/                # NSG (stub — network.bicep)
│   ├── lighthouse/             # Azure Lighthouse delegation [planned]
│   └── platform/               # Supporting Azure resources
├── managed-app/                # Azure Marketplace package
│   ├── createUiDefinition.json # 6-step wizard definition
│   ├── mainTemplate.json       # ARM template (built from Bicep)
│   ├── viewDefinition.json     # Portal view
│   └── build-template.ps1      # Build script
├── ui/                         # Standalone createUiDefinition.json (v2)
├── baselines/                  # Security baselines (catalog.json, SCT profiles, mappings)
├── docs/                       # Compliance and deployment docs
├── templates/                  # Industry compliance templates
│   └── industries/             # Legal, Financial, Education, Government [planned]
├── scripts/                    # Utility scripts (FrameworkAuditHelper.ps1)
├── pipelines/                  # Azure DevOps YAML pipelines
│   ├── azure-pipelines.yml     # Main: Validate → Build → Deploy Dev → Prod
│   └── functions-pipeline.yml  # Functions: Validate → Build → Deploy Dev → Prod
├── .planning/                  # GSD planning documents
├── package.json                # Workspace root (pnpm, Turbo scripts)
├── pnpm-workspace.yaml         # pnpm workspace definition
├── turbo.json                  # Turborepo pipeline config
├── .env.example                # Required environment variable template
└── framework-cache.json        # Cached framework scoring data
```

## Directory Purposes

**`apps/api/src/middleware/`:**
- Purpose: Request processing pipeline middleware
- Contains: `auth.ts` (JWKS JWT validation), `rbac.ts` (role + permission enforcement), `mfa.ts` (amr claim check), `tenant.ts` (injects tenantDb and tenantMeta into context), `error.ts` (global error/404 handlers)
- Key files: `apps/api/src/middleware/auth.ts`, `apps/api/src/middleware/rbac.ts`, `apps/api/src/middleware/tenant.ts`

**`apps/api/src/routes/`:**
- Purpose: HTTP route handlers — one file per resource
- Contains: `health.ts`, `auth.ts`, `tenants.ts`, `oauth-callback.ts`, `wizard-state.ts`, `audits.ts`, `action-queue.ts`
- Key files: `apps/api/src/routes/audits.ts`, `apps/api/src/routes/tenants.ts`

**`apps/api/src/services/`:**
- Purpose: Business logic not tied to a specific route
- Contains: `tenant-provisioning.ts` (DB creation + KV token storage), `keyvault.ts` (Azure Key Vault reads/writes), `oauth-consent.ts` (delegated token acquisition), `gdap-verification.ts`, `tenant-db.ts` (control-plane DB queries), `user.ts` (user resolution), `signalr.ts` (negotiate + push)
- Key files: `apps/api/src/services/tenant-provisioning.ts`, `apps/api/src/services/keyvault.ts`

**`apps/web/src/app/`:**
- Purpose: Next.js App Router — each subdirectory is a route segment
- Contains: `layout.tsx` (root MSAL provider), `page.tsx` (home), `dashboard/page.tsx`, `audit/page.tsx`, `audit/loading.tsx`, `deploy/page.tsx`, `reports/page.tsx`
- Key files: `apps/web/src/app/layout.tsx`, `apps/web/src/app/audit/page.tsx`

**`apps/web/src/components/`:**
- Purpose: React components organized by feature domain
- Contains: `audit/` (AuditResults, ScoreCard, FindingDetailDrawer, FrameworkSelector, GroupedFindingsView, ZtaMaturityRadar, etc.), `tenants/` (TenantCard, TenantGrid, OnboardingWizard, wizard step components), `layout/` (Header, Sidebar, AuthGuard), `ui/` (Badge, Card, Drawer, ProgressBar, OmzigLogo)

**`apps/web/src/hooks/`:**
- Purpose: Custom hooks encapsulating state and API interaction per domain
- Key files: `useAudit.ts` (audit lifecycle + SignalR), `useTenants.ts`, `useAuth.ts`, `useOnboarding.ts`, `useActionQueue.ts`, `useClientAudit.ts`, `useApi.ts`

**`apps/web/src/lib/`:**
- Purpose: Shared utilities and API integration layer for the frontend
- Key files: `api-client.ts` (MSAL-authenticated fetch wrapper), `audit-api.ts`, `tenant-api.ts`, `action-queue-api.ts`, `msal.ts` (MSAL instance config), `types.ts` (frontend-local types)

**`packages/audit/src/collectors/`:**
- Purpose: Fetch and parse raw tenant data from Microsoft Graph API
- Contains: `fact-collector.ts` (orchestrates batching + standalone calls), `graph-client.ts` (creates Graph SDK client), `batch-helper.ts` (executes `$batch` requests), `areas/` (one parser per Graph API area)
- Key files: `packages/audit/src/collectors/fact-collector.ts`

**`packages/audit/src/evaluators/`:**
- Purpose: Pure functions that evaluate a single control given `AuditFacts`
- Contains: `entra-id/` (8 evaluator files — aad-1 through aad-8), `nist-80053/` (7 control families), `nist-csf/` (6 functions), `nist-zta/` (7 tenets), `types.ts`
- Key files: `packages/audit/src/evaluators/types.ts`

**`packages/audit/src/registry/`:**
- Purpose: Master list of all ~101 audit controls with compliance metadata
- Contains: `control-registry.ts` (aggregates all frameworks), `entra-id-controls.ts`, `nist-80053-controls.ts`, `nist-csf-controls.ts`, `nist-zta-controls.ts`
- Key files: `packages/audit/src/registry/control-registry.ts`

**`packages/audit/src/pipeline/`:**
- Purpose: Orchestrates a complete audit run end-to-end
- Contains: `audit-runner.ts` (main pipeline function), `maturity-calculator.ts` (NIST 800-207 tenet scores), `progress-emitter.ts` (SignalR push wrapper), `rate-limiter.ts` (Graph API throttle guard), `token-manager.ts` (token refresh)
- Key files: `packages/audit/src/pipeline/audit-runner.ts`

**`functions/Modules/`:**
- Purpose: Shared PowerShell modules imported by all Deploy-* functions
- Key files: `functions/Modules/GraphHelper.psm1` (Graph API helpers with retry logic)

## Key File Locations

**Entry Points:**
- `apps/api/src/index.ts`: API server startup
- `apps/api/src/app.ts`: Hono app factory with all middleware and route registration
- `apps/web/src/app/layout.tsx`: Next.js root layout with MSAL initialization
- `packages/audit/src/index.ts`: Audit package public API exports
- `functions/Orchestrator/`: Azure Functions PowerShell entry point

**Configuration:**
- `.env.example`: Required environment variables reference
- `turbo.json`: Turborepo pipeline (dev/build/test/lint tasks)
- `pnpm-workspace.yaml`: Workspace package paths
- `apps/api` — reads: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `SQL_SERVER_HOST`, `ELASTIC_POOL_NAME`, `KEYVAULT_URL`, `SIGNALR_CONNECTION_STRING`, `FRONTEND_URL`
- `apps/web/next.config.mjs`: Next.js config (static export for Azure Static Web Apps)
- `apps/web/staticwebapp.config.json`: Azure Static Web Apps routing rules

**Core Logic:**
- `packages/audit/src/pipeline/audit-runner.ts`: Audit pipeline orchestrator
- `packages/audit/src/collectors/fact-collector.ts`: Graph API data collection
- `packages/audit/src/registry/control-registry.ts`: All control definitions aggregated
- `apps/api/src/services/tenant-provisioning.ts`: Tenant DB creation and lifecycle
- `apps/api/src/middleware/rbac.ts`: Role resolution with per-tenant overrides
- `packages/db/src/control-plane/schema.ts`: Control-plane DB schema (orgs, users, tenants)
- `packages/db/src/tenant/schema.ts`: Per-tenant DB schema (auditRuns, findings, maturityScores)

**Testing:**
- `apps/api/src/__tests__/`: API route and service integration tests (Vitest)
- `apps/web/src/__tests__/`: Component tests (Vitest)
- `apps/web/src/hooks/__tests__/`: Hook tests
- `packages/audit/src/__tests__/`: Audit engine unit tests with Graph fixtures
- `packages/audit/src/__tests__/fixtures/graph-responses.ts`: Mock Graph API responses
- `functions/Tests/`: Pester tests for PowerShell functions (partially implemented)

## Naming Conventions

**Files:**
- TypeScript source files: `kebab-case.ts` (e.g., `audit-runner.ts`, `fact-collector.ts`)
- React components: `PascalCase.tsx` (e.g., `AuditResults.tsx`, `TenantCard.tsx`)
- Test files: `kebab-case.test.ts` or `PascalCase.test.tsx`
- PowerShell function directories: `Verb-Noun` (e.g., `Deploy-Identity`, `Run-Audit`)

**Directories:**
- Feature groups: `kebab-case` (e.g., `conditional-access/`, `entra-id/`, `nist-zta/`)
- Component domains: `lowercase` (e.g., `audit/`, `tenants/`, `layout/`, `ui/`)
- Azure Function directories: `PascalCase` verb-noun (e.g., `Deploy-Identity/`, `Pre-Deploy-Audit/`)

**Packages:**
- Internal workspace packages prefixed with `@omzig/` (e.g., `@omzig/audit`, `@omzig/db`, `@omzig/shared`)

## Where to Add New Code

**New API Route:**
- Route handler: `apps/api/src/routes/<feature>.ts`
- Register in: `apps/api/src/app.ts` (`app.route('/api/<feature>', ...)`)
- Tests: `apps/api/src/__tests__/<feature>.test.ts`

**New Service/Business Logic:**
- Implementation: `apps/api/src/services/<feature>.ts`
- Import in route handler that needs it

**New Audit Control:**
- Add control definition: `packages/audit/src/registry/<framework>-controls.ts`
- Add evaluator function: `packages/audit/src/evaluators/<framework>/<control-id>.ts` or inline in existing evaluator file
- Register in: `packages/audit/src/registry/control-registry.ts` via `getAllControls()`
- Add remediation: `packages/audit/src/remediation/<framework>-remediation.ts`
- Add tests: `packages/audit/src/__tests__/evaluators.test.ts` or new test file

**New React Page:**
- Page file: `apps/web/src/app/<route>/page.tsx`
- Loading state: `apps/web/src/app/<route>/loading.tsx`

**New React Component:**
- Feature component: `apps/web/src/components/<domain>/<ComponentName>.tsx`
- UI primitive: `apps/web/src/components/ui/<ComponentName>.tsx`
- Tests: `apps/web/src/__tests__/<ComponentName>.test.tsx`

**New Custom Hook:**
- Implementation: `apps/web/src/hooks/use<Feature>.ts`
- Tests: `apps/web/src/hooks/__tests__/use<Feature>.test.ts`

**New Shared Type:**
- Add to: `packages/shared/src/types/<domain>.ts`
- Re-export from: `packages/shared/src/index.ts`

**New Database Table:**
- Control-plane table: `packages/db/src/control-plane/schema.ts`
- Per-tenant table: `packages/db/src/tenant/schema.ts`
- Create migration: `packages/db/src/control-plane/migrations/<number>_<description>.sql`

**New Azure Function:**
- Directory: `functions/<Verb>-<Noun>/`
- Required files: `run.ps1`, `function.json`
- Register in: `functions/Orchestrator/run.ps1` fan-out logic

**New Bicep Module:**
- Module file: `bicep/<domain>/<module>.bicep`
- Register in: `bicep/main.bicep` as a module reference
- Add to ARM build: update `managed-app/build-template.ps1`

## Special Directories

**`.planning/`:**
- Purpose: GSD planning documents, phase plans, research
- Generated: No
- Committed: Yes

**`apps/web/.next/`:**
- Purpose: Next.js build output (server chunks, static assets)
- Generated: Yes
- Committed: No

**`apps/web/out/`:**
- Purpose: Static export output (deployed to Azure Static Web Apps)
- Generated: Yes
- Committed: No

**`packages/*/dist/`:**
- Purpose: TypeScript compiled output for each package
- Generated: Yes (Turbo build)
- Committed: No

**`node_modules/`:**
- Purpose: pnpm workspace dependencies (hoisted + per-package)
- Generated: Yes
- Committed: No

**`baselines/`:**
- Purpose: Security baseline catalog and SCT profiles for audit framework mappings
- Key files: `baselines/catalog.json` (164KB framework definitions), `baselines/mappings/`, `baselines/profiles/`, `baselines/parsed/`
- Generated: No (source of truth for compliance data)
- Committed: Yes

**`framework-cache.json`:**
- Purpose: Pre-computed framework scoring cache (164KB)
- Generated: Yes (by scripts)
- Committed: Yes (for performance in CI/CD)

---

*Structure analysis: 2026-03-23*
