# Phase 1: Foundation and Authentication - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Deploy the infrastructure platform (monorepo, Container Apps, Azure SQL Elastic Pool, Key Vault, SignalR), implement Entra ID authentication with MFA enforcement and app-level RBAC (Owner/Admin/Analyst/Read-only), and prove per-tenant database isolation. This phase makes the platform runnable and secure -- no audit logic, no tenant onboarding flows, no dashboard UX. Setup wizard deferred to Phase 4 (Tenant Onboarding).

</domain>

<decisions>
## Implementation Decisions

### RBAC Role Model
- Four roles: Owner, Admin, Analyst, Read-only (expanded from original 3-role spec)
- Roles assigned via Entra ID app roles as the base level
- Per-tenant role overrides stored in the control plane database -- both upgrade and downgrade allowed (e.g., Read-only globally but Analyst for Tenant X)
- Tenant access is explicit -- users see NO tenants until an Admin/Owner grants access
- New users join via platform invite from Admin/Owner. Invited users see "Contact your admin for tenant access" until configured
- Multiple Owners allowed per org (like GitHub org owners)
- No limit on number of Admins per org

### RBAC Permission Boundaries
- **Owner-exclusive**: Platform billing, org deletion (soft delete with 30-day grace period), manage other Owners
- **Admin-exclusive**: Onboard/remove tenants, manage staff roles, configure scan schedules, alert routing, system settings, approve RISKY remediations (CA policy changes, etc.)
- **Analyst**: Trigger on-demand audits, approve/execute SAFE remediations, view all findings and remediation guidance
- **Read-only**: View audit findings, compliance scores, and dashboard. Cannot trigger audits or execute remediations
- Read-only visibility into remediation guidance: Claude's discretion (show guidance since it's educational, hide the "Apply" button)
- All users can see who else has access to their assigned tenants (names and roles)
- Activity logs visible to Owners and Admins

### Multi-Org SaaS Model
- Single platform instance serves multiple MSP organizations
- Shared infrastructure with org-level isolation (org_id on control plane tables)
- Per-tenant databases within the elastic pool for client audit data (separate from the shared control plane DB)
- Platform-enforced MFA validation -- checks MFA claims in JWT token, defense-in-depth beyond Entra CA policies
- Per-org configurable session timeout (within platform-defined min/max bounds)
- First user triggers setup wizard -> becomes initial Owner -> creates their org

### User Lifecycle
- Track "last active" per user with auto-disable after configurable inactivity period
- Full audit trail: every action logged with who, when, IP, and what changed
- API keys for programmatic access deferred to v2
- Org deletion: soft delete with 30-day grace period, Owner must confirm via typed org name + MFA re-auth

### Tenant DB Provisioning
- Per-tenant database created automatically on onboarding (zero manual steps)
- Control plane database lives inside the elastic pool (shared with tenant DBs)
- Tenant database names are opaque/UUID-based (no PII leakage in infrastructure)
- On-demand connections (open/close per request) -- not connection pooling. Better for many tenants with bursty audit workloads
- Database migrations run automatically on app startup for both control plane and tenant DBs
- Tenant removal: soft delete with 30-day retention, then permanent purge
- Elastic pool auto-scales DTUs based on demand
- No limit on number of tenants per org
- Key Vault envelope encryption for sensitive columns (tenant tokens, credentials) + Azure SQL TDE for data at rest -- substitutes Always Encrypted which is unsupported by Node.js tedious driver, confirmed acceptable by user
- Azure SQL automatic backups for disaster recovery (no custom backup mechanism)
- Full tenant data export capability (JSON/CSV) for compliance or offboarding
- Health check endpoint verifies database, elastic pool, Key Vault, and all service dependencies
- Graph API permission validation: fail-and-report approach (run audit, report which checks failed due to insufficient permissions)

### Setup Wizard
- Triggered on first Owner sign-in
- Full onboarding flow: org name -> org settings (session timeout, security prefs) -> invite team -> connect first tenant -> validate connection -> run first audit
- All steps skippable except org name
- Step progress bar with numbered steps (e.g., "Step 2 of 6")
- Wizard state persisted -- resumable if Owner closes browser mid-setup
- Tenant connection supports both OAuth consent and GDAP options
- Connection validation: test Graph API call with detailed permission checklist (granted/missing status per permission)
- First audit shows summary (compliance score, pass/fail counts, top 3 critical findings) with link to full dashboard results
- After wizard: land on dashboard with "Getting Started" checklist showing completed/remaining setup tasks (dismissible)
- **NOTE: Setup wizard implementation deferred to Phase 4 (Tenant Onboarding). Decisions recorded here for continuity.**

### Observability & Monitoring
- Public status page showing API, database, and service health
- Full distributed tracing with correlation IDs across frontend -> API -> database -> Azure Functions (Application Insights or OpenTelemetry)
- In-platform log viewer for Owners/Admins (recent requests, errors, traces -- searchable and filterable)
- Configurable email alerts for critical events (service down, audit failures, security anomalies) with per-org rules
- Graph API rate limit monitoring per tenant -- track consumption vs limits, alert at 80% threshold
- Audit execution timing: total time + per-check timing + slowest checks displayed
- User attribution on every audit (who triggered, when, which tenant)
- Prometheus/OpenTelemetry metrics endpoint deferred to v2
- Anomaly detection on audit results deferred to v2 -- v1 uses threshold-based alerts

### Platform Branding
- Corporate/enterprise visual tone -- clean, professional, muted colors (think Azure Portal, ServiceNow)
- Light theme only for v1 -- dark mode deferred
- Primary brand color: blue (trust/security)
- Login page: Omzig branded with logo, name, and tagline
- MSP-level custom branding (logo, colors) deferred to v2

### Error Handling
- Full technical details shown to users (error codes, API responses, correlation IDs) -- MSPs are technical
- Graceful degradation when downstream services are unavailable -- show cached data with "Last updated" warning
- Layered error display: global banner for platform-wide issues + per-tenant status for tenant-specific issues
- Auto-retry failed operations up to 3 times with backoff + user notification of retry status. Manual retry button if all retries fail

### Claude's Discretion
- Read-only user visibility into remediation guidance (recommendation: show guidance text, hide "Apply" button)
- Exact session timeout min/max bounds
- Observability dashboard layout and metrics prioritization
- Error message copywriting and tone
- Loading states and skeleton screens
- Exact setup wizard UI components and transitions

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **MSAL authentication** (`/web/src/lib/msal.ts`, `/web/src/hooks/useAuth.ts`): Fully implemented Entra ID auth with silent token acquisition and redirect fallback. 95% reusable -- extend with app role claim parsing and MFA validation
- **AuthGuard component** (`/web/src/components/layout/AuthGuard.tsx`): Route protection pattern, extend to check role-based access
- **UI components** (`/web/src/components/ui/`): Badge, Card, ProgressBar -- reusable for new dashboard views
- **Layout components** (`/web/src/components/layout/`): Header, Sidebar -- reusable shell for authenticated views
- **GraphHelper module** (`/functions/Modules/GraphHelper.psm1`): Graph API utilities with retry logic -- pattern reusable for TypeScript backend

### Established Patterns
- Next.js App Router with `src/app/` structure and `@/*` path aliases
- React hooks pattern for state management (`useAuth`, `useAudit`)
- Tailwind CSS for styling with `clsx` for conditional classes
- Azure Functions (PowerShell) with HTTP triggers, Bearer token validation, CORS handling
- Bicep module composition pattern (`main.bicep` composes sub-modules)

### Integration Points
- Frontend currently calls `/api/run-audit` on Azure Functions -- will need to point to new Hono API
- MSAL config in `.env.local` -- extend with new API scope for Container Apps backend
- Existing audit types in `/web/src/lib/types.ts` -- extend with RBAC types, org model, tenant model
- Existing Bicep modules in `/bicep/` -- add new modules for SQL, Container Apps, Key Vault, SignalR alongside existing identity/devices/security/data modules

</code_context>

<specifics>
## Specific Ideas

- Multi-org SaaS model (not single-deployment-per-MSP) -- supports hosted SaaS growth path
- Owner role above Admin prevents lockout scenarios -- "the person who pays can't be demoted"
- Explicit tenant access (not implicit) -- critical for MSPs with sensitive clients (healthcare, financial)
- Platform-enforced MFA validation -- a Zero Trust auditing tool must practice Zero Trust itself
- Opaque database names -- even infrastructure shouldn't leak client information
- Setup wizard includes "Run first audit" for immediate value demonstration on first login

</specifics>

<deferred>
## Deferred Ideas

- API keys for programmatic access -- v2 (adds auth complexity)
- MSP custom branding (logo, colors) -- v2 (REPORT-01 already deferred)
- Dark mode -- v2 (reduces design scope for v1)
- Prometheus/OpenTelemetry external metrics endpoint -- v2
- Anomaly detection on audit results -- v2 (needs historical baseline data)
- Per-tenant connection pooling -- revisit if on-demand connections become a bottleneck

</deferred>

---

*Phase: 01-foundation-and-authentication*
*Context gathered: 2026-03-10*
