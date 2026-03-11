# Phase 4: Tenant Onboarding and Management - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement the full tenant onboarding lifecycle so MSPs can connect multiple client M365 tenants and manage them from a unified dashboard. Includes OAuth consent flow (shareable link), GDAP/Lighthouse delegated admin onboarding, multi-tenant dashboard with health indicators, tenant detail navigation, and tenant removal with soft-delete retention. No dashboard drill-down UX beyond tenant-level navigation (Phase 5), no scheduled scans (Phase 6), no remediation (Phase 7), no drift detection (Phase 8).

</domain>

<decisions>
## Implementation Decisions

### Onboarding Flow UX
- Full-page wizard at `/tenants/new` with 5 steps:
  1. **Tenant Details** — display name, primary domain, contact email
  2. **Connection Method** — choose OAuth Consent or GDAP, with permissions explanation
  3. **Connect & Verify** — OAuth: shareable consent link + callback; GDAP: relationship ID entry + verification
  4. **Provisioning** — auto-provision: create tenant DB in elastic pool, store encrypted tokens, grant user access, auto-trigger first audit with live progress
  5. **Complete** — summary of what was set up, link to tenant dashboard, first audit results
- Uses existing `setupWizardState` table for step tracking and resume
- Full auto-provision after consent: DB + tokens + access + first audit, all automatic

### OAuth Consent Flow
- Shareable consent link: MSP generates a unique consent URL from the wizard
- MSP can copy link or email it to the client admin
- Client admin clicks link, signs in with their own M365 account, grants permissions
- OAuth callback notifies the MSP's wizard to advance to provisioning step
- Stores refresh token encrypted in Key Vault via existing `storeTenantToken()`
- All read scopes requested upfront (locked in Phase 2)

### GDAP/Lighthouse Onboarding
- Relationship ID entry: MSP enters their GDAP relationship ID from Partner Center
- Platform verifies the relationship by testing a Graph API call with delegated permissions
- Auto-detects client tenant ID from the relationship
- Shows verification result: roles granted, whether permissions are sufficient for auditing
- No client admin interaction needed — MSP already has delegated access

### Unified Token Storage
- Both OAuth and GDAP paths converge to the same token model
- OAuth: consent → auth code → refresh token → `storeTenantToken(tenantId, token)`
- GDAP: relationship → delegated token → `storeTenantToken(tenantId, token)`
- Audit pipeline uses `getTenantToken(tenantId)` — doesn't care which method was used
- Track connection method on tenant record (`connectionMethod: 'oauth' | 'gdap'`)

### Multi-Tenant Dashboard
- Hybrid layout: default card grid with toggle to data table view
- Card grid for visual overview (small MSPs), table for density (large MSPs with 20+ tenants)
- Each tenant card shows:
  - Overall compliance score (average across 4 frameworks)
  - Per-framework mini scores (CISA, ZTA, 800-53, CSF)
  - Last audit timestamp (relative: "2h ago", "3 days ago")
  - Critical findings count (high/critical severity failures)
  - Health indicator (colored dot)
- "Add Tenant" card/button in the grid launches the onboarding wizard
- Dashboard lives at `/tenants` (replaces current single-tenant assumption)

### Health Status Calculation
- Score-based thresholds using average of all 4 framework scores:
  - Green (Healthy): score >= 70%
  - Yellow (Needs Attention): score 40-69%
  - Red (Critical): score < 40%
  - Gray (Unknown): no audit yet
  - Orange (Action Needed): token expired / needs re-authorization
- Matches maturity threshold pattern from Phase 3

### Tenant Detail Navigation
- Clicking a tenant card navigates to `/tenants/:id`
- Sets tenant context (X-Tenant-Id) for all subsequent API calls
- Tenant detail page shows the full compliance dashboard from Phase 3:
  - Overview tab (score cards, radar chart)
  - Findings tab (framework filter, finding list)
  - Audit History tab
  - Settings tab
- Breadcrumb navigation back to `/tenants`

### Tenant Removal
- Confirm modal with name-typing requirement (type tenant name to confirm)
- Soft delete: sets `isDeleted=true`, `deletedAt=now`, `status='suspended'`
- Tenant disappears from dashboard immediately
- 30-day retention window before permanent deletion
- Hard purge via scheduled job: drop tenant DB, delete Key Vault secrets, remove access records

### Tenant Status Lifecycle
- 5 states: `pending` → `active` → `needs_reauth` → `suspended` → `purged`
- **pending**: wizard in progress, not yet connected
- **active**: connected, tokens valid, auditable
- **needs_reauth**: token expired or revoked, requires re-consent or new GDAP token
- **suspended**: soft-deleted, in 30-day retention window, no audits allowed
- **purged**: hard-deleted, DB dropped, secrets removed (row deleted or retained for audit log)
- Abandoned wizards (pending > 24h) cleaned up by scheduled job
- Re-authorization from needs_reauth returns tenant to active

### Claude's Discretion
- Exact Entra ID app registration configuration for OAuth consent
- Graph API scopes list for the consent prompt
- GDAP relationship verification approach (Partner Center API vs direct Graph test)
- Wizard step component structure and state management
- Table view column configuration and sorting
- Hard purge job implementation details (timer trigger, batch processing)
- API route structure for new tenant management endpoints

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Control-plane schema** (`packages/db/src/control-plane/schema.ts`): `tenants` table (id, orgId, displayName, m365TenantId, databaseName, tokenSecretName, isDeleted, deletedAt), `tenantUserAccess` table (userId, tenantId, roleOverride, grantedBy), `setupWizardState` table (currentStep, totalSteps, stepsCompleted, isComplete)
- **Connection factory** (`packages/db/src/connection.ts`): `getControlPlaneDb()` singleton, `getTenantDb(databaseName)` on-demand, `closeTenantDb(pool)` cleanup. Ready for tenant provisioning.
- **Key Vault service** (`apps/api/src/services/keyvault.ts`): `getTenantToken()`, `storeTenantToken()`, `encryptValue()`, `decryptValue()`. RSA-OAEP envelope encryption ready for token storage.
- **Tenant middleware** (`apps/api/src/middleware/tenant.ts`): `withTenantDb()` reads X-Tenant-Id, verifies access, opens per-tenant DB connection, closes in finally block. Already production-ready.
- **Tenant routes stub** (`apps/api/src/routes/tenants.ts`): GET/POST/DELETE `/api/tenants` returning 501. Replace stubs with real implementations.
- **Auth routes** (`apps/api/src/routes/auth.ts`): `/me` endpoint resolves base role + effective role per tenant. Already handles X-Tenant-Id for role resolution.
- **Dashboard page** (`apps/web/src/app/dashboard/page.tsx`): Current single-tenant landing. Transform into multi-tenant dashboard or create new `/tenants` page.
- **Audit page** (`apps/web/src/app/audit/page.tsx`): Combined compliance dashboard (score cards, radar chart, findings). Reuse as tenant detail view.
- **Frontend types** (`apps/web/src/lib/types.ts`): AuditRunDetail, FrameworkScores, MaturityScoreEntry. Extend with TenantSummary type for dashboard.

### Established Patterns
- Hono API with separated route files registered in app.ts
- Middleware chain: health → JWK → MFA → RBAC → tenant context
- Drizzle ORM with mssqlTable for both control-plane and tenant schemas
- On-demand per-tenant DB connections (open/close per request)
- Key Vault envelope encryption (RSA-OAEP) for sensitive data
- Vitest for unit testing with mock injection
- Next.js pages with AuthGuard wrapper and useAuth hook

### Integration Points
- Tenant routes (`tenants.ts`): replace 501 stubs with CRUD + onboarding endpoints
- New OAuth callback route for consent flow redirect handling
- setupWizardState table: wire into wizard step tracking
- tenants table: add `status` and `connectionMethod` columns
- Audit pipeline: trigger first audit programmatically after provisioning
- SignalR: push onboarding progress (DB creation, token storage, first audit)
- Frontend: new `/tenants` page (dashboard), `/tenants/new` (wizard), `/tenants/:id` (detail)
- Existing audit page components reused within `/tenants/:id` detail view

</code_context>

<specifics>
## Specific Ideas

- Shareable consent link supports remote onboarding — MSP doesn't need to be in the same room as the client admin. Critical for MSPs managing dozens of clients.
- Hybrid dashboard (cards + table toggle) scales from 3-tenant solo MSPs to 50-tenant managed service operations without redesigning.
- 5-state lifecycle makes token expiration visible as a distinct state rather than a hidden error — MSPs can see which tenants need attention at a glance.
- Full auto-provision (DB + tokens + first audit) means the MSP sees value within seconds of consent. No manual steps between "connected" and "first compliance score".
- Per-framework mini scores on tenant cards let MSPs spot which framework is dragging a tenant's health down without clicking in.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-tenant-onboarding-and-management*
*Context gathered: 2026-03-11*
