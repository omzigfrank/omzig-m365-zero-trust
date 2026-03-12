# Roadmap: Omzig M365 Zero Trust Auditor

## Overview

This roadmap delivers a multi-tenant M365 Zero Trust auditing platform for MSPs. The journey starts with infrastructure and authentication (the security tool must practice what it preaches), then builds the core audit engine against CISA SCuBA and NIST frameworks, layers on multi-tenant management and interactive dashboard UX, adds automated scanning with reporting and trending, then ships the two highest-risk features last: remediation engine (can lock out users if wrong) and drift detection (requires stable baselines and tenant state). Each phase delivers an independently verifiable capability. The 8-phase structure derives from the 59 v1 requirements across 8 categories, respecting the dependency chain: infrastructure before engine, engine before UI, UI before automation, automation before remediation, all before drift.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation and Authentication** - Infrastructure platform, auth, tenant isolation, monorepo skeleton (completed 2026-03-11)
- [x] **Phase 2: Core Audit Engine** - Collect-then-evaluate pipeline for CISA SCuBA Entra ID controls (completed 2026-03-11)
- [x] **Phase 3: Compliance Framework Mapping** - NIST 800-207/800-53/CSF 2.0 evaluators and maturity scoring (completed 2026-03-11)
- [ ] **Phase 4: Tenant Onboarding and Management** - OAuth/GDAP onboarding, multi-tenant dashboard, tenant lifecycle
- [ ] **Phase 5: Dashboard and Findings UX** - Interactive drill-down, filtering, remediation guidance, action queue
- [ ] **Phase 6: Scheduling, Reporting and Trending** - Automated scans, PDF/CSV export, historical compliance trends
- [ ] **Phase 7: Remediation Engine** - Safe/risky classification, auto-fix, guided wizard, rollback
- [ ] **Phase 8: Drift Detection** - Audit log polling, baseline snapshots, alerts, real-time push

## Phase Details

### Phase 1: Foundation and Authentication
**Goal**: The platform infrastructure exists, a developer can authenticate, and per-tenant data isolation is provably enforced
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, INFRA-07, AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-07
**Success Criteria** (what must be TRUE):
  1. Developer can access the Next.js frontend via browser and authenticate with an Entra ID work account
  2. Authenticated user sees their assigned role (Admin/Analyst/Read-only) and role-restricted routes are enforced
  3. API calls from frontend to Hono backend succeed with token validation and RBAC middleware rejecting unauthorized requests
  4. Per-tenant database creation and isolation can be demonstrated -- writing data to Tenant A's database and confirming Tenant B's database contains none of it
  5. All secrets (tenant tokens, connection strings) are stored in Key Vault and accessed via managed identity -- no secrets in code or environment variables
**Plans**: 4 plans

Plans:
- [ ] 01-01-PLAN.md — Monorepo skeleton with Turborepo + pnpm, shared packages (@omzig/shared, @omzig/db, @omzig/tsconfig)
- [ ] 01-02-PLAN.md — Hono API with authentication middleware (JWK, MFA, RBAC) and tests
- [ ] 01-03-PLAN.md — Database connection factory, tenant isolation, Key Vault integration
- [ ] 01-04-PLAN.md — Frontend auth flow, Bicep platform infrastructure, end-to-end integration

### Phase 2: Core Audit Engine
**Goal**: Users can trigger an audit of an M365 tenant and see pass/fail results for every CISA SCuBA Entra ID control
**Depends on**: Phase 1
**Requirements**: AUDIT-01, AUDIT-02, AUDIT-03, AUDIT-04, AUDIT-05, AUDIT-06, FRAME-01, AUTH-06
**Success Criteria** (what must be TRUE):
  1. User can trigger an on-demand audit scan of a connected tenant and see it complete with results
  2. All 29 CISA SCuBA Entra ID controls are evaluated with pass/fail status and severity level (Critical/High/Medium/Low)
  3. Each finding shows the affected setting name, current value in the tenant, and expected value per the control
  4. Findings display their CISA SCuBA control ID with SHALL/SHOULD/MAY requirement level
  5. Audit results are persisted in the tenant's database and retrievable for later viewing
**Plans**: 3 plans

Plans:
- [ ] 02-01-PLAN.md — Audit package foundation: types, control registry (29 CISA SCuBA definitions), Graph API fact collector
- [ ] 02-02-PLAN.md — DB schema (auditFindings table), SignalR service, audit API routes (trigger, list, detail, retry)
- [ ] 02-03-PLAN.md — 29 Entra ID evaluators, audit runner pipeline, frontend async audit with SignalR progress

### Phase 3: Compliance Framework Mapping
**Goal**: Users can view their tenant's compliance posture across NIST 800-207, 800-53, and CSF 2.0 with maturity scoring
**Depends on**: Phase 2
**Requirements**: FRAME-02, FRAME-03, FRAME-04, FRAME-05, FRAME-06, FRAME-07
**Success Criteria** (what must be TRUE):
  1. Audit evaluates the tenant against all 7 NIST 800-207 Zero Trust Architecture tenets with 31+ checks
  2. Each finding cross-maps to NIST 800-53 security control families and NIST CSF 2.0 functions where applicable
  3. User can view a compliance score per framework (CISA SCuBA, NIST 800-207, NIST 800-53, CSF 2.0) for any audited tenant
  4. User can view ZTA maturity level (Traditional/Initial/Advanced/Optimal) per NIST 800-207 tenet and see a radar chart of all 7 tenets
**Plans**: 5 plans

Plans:
- [ ] 03-01-PLAN.md — Extended types, DB schema (maturityScores table), 31 NIST 800-207 ZTA evaluators ported from PowerShell
- [ ] 03-02-PLAN.md — 22 NIST 800-53 evaluators with independent pass/fail logic per control family
- [ ] 03-03-PLAN.md — 19 NIST CSF 2.0 evaluators with independent pass/fail logic per function
- [ ] 03-04-PLAN.md — Maturity calculator, unified control registry (~101 controls), audit pipeline wiring
- [ ] 03-05-PLAN.md — Combined compliance dashboard: 4 score cards, ZTA radar chart, framework filter, cross-framework badges

### Phase 4: Tenant Onboarding and Management
**Goal**: MSPs can connect multiple client tenants and manage them from a single multi-tenant view
**Depends on**: Phase 2
**Requirements**: TENANT-01, TENANT-02, TENANT-03, TENANT-04, TENANT-07, TENANT-08
**Success Criteria** (what must be TRUE):
  1. MSP can onboard a new client tenant via OAuth consent flow where the client admin grants audit permissions
  2. MSP can onboard a client tenant via GDAP/Lighthouse delegated admin relationship
  3. Multi-tenant dashboard displays all connected tenants with compliance scores and red/yellow/green health status
  4. MSP can click into any tenant from the dashboard to drill into that tenant's detailed findings
  5. MSP can remove a client tenant and confirm all associated data is deleted from the elastic pool database
**Plans**: 4 plans

Plans:
- [ ] 04-01-PLAN.md — Schema extensions, shared types, OAuth consent + GDAP verification + tenant provisioning services
- [ ] 04-02-PLAN.md — Tenant CRUD routes, onboarding endpoints, OAuth callback handler
- [ ] 04-03-PLAN.md — Multi-tenant dashboard (card grid + table toggle), tenant detail page wrapping Phase 3 compliance dashboard
- [ ] 04-04-PLAN.md — 5-step onboarding wizard at /tenants/new (OAuth consent + GDAP paths)

### Phase 5: Dashboard and Findings UX
**Goal**: Users can navigate audit results interactively with filtering, remediation guidance, and a cross-tenant action queue
**Depends on**: Phase 3, Phase 4
**Requirements**: DASH-01, DASH-02, DASH-05, DASH-06, DASH-07, DASH-10
**Success Criteria** (what must be TRUE):
  1. User can drill down from framework to category to individual finding to its remediation guidance
  2. User can filter findings by severity, framework, workload, and pass/fail status
  3. Each finding displays step-by-step remediation instructions including links to the relevant Microsoft admin portal page and PowerShell commands where applicable
  4. Alert/action queue on the dashboard surfaces drift events and critical findings across all connected tenants
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD

### Phase 6: Scheduling, Reporting and Trending
**Goal**: Audits run automatically on schedule and users can export reports and track compliance improvement over time
**Depends on**: Phase 5
**Requirements**: TENANT-05, TENANT-06, DASH-03, DASH-04, DASH-08, DASH-09
**Success Criteria** (what must be TRUE):
  1. MSP can configure daily or weekly automated audit scans per tenant and those scans execute on schedule
  2. Scheduled scans use stagger logic to avoid Graph API throttling when multiple tenants scan concurrently
  3. User can export a compliance report as PDF and detailed findings as CSV for any completed audit
  4. Dashboard shows historical compliance score trends over time with a chart showing improvement or regression across scan history
**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD

### Phase 7: Remediation Engine
**Goal**: Users can fix compliance failures through the platform -- auto-fix for safe changes, guided wizard for risky ones, with full audit trail and rollback
**Depends on**: Phase 5
**Requirements**: REMED-01, REMED-02, REMED-03, REMED-04, REMED-05, REMED-06, REMED-07, REMED-08
**Success Criteria** (what must be TRUE):
  1. Each remediable finding is classified as SAFE or RISKY and the classification is visible to the user
  2. User can auto-remediate a SAFE finding with one-click approval and see the tenant configuration change take effect
  3. RISKY findings present a guided wizard showing impact preview (e.g., affected user count) and CA policy remediations deploy in Report-Only mode first
  4. User can view full remediation audit trail (who approved, when, before/after values) and rollback any remediation to restore previous state
  5. Remediation engine validates prerequisites before applying changes and uses minimum-privilege Graph API permissions separate from read-only audit permissions
**Plans**: TBD

Plans:
- [ ] 07-01: TBD
- [ ] 07-02: TBD
- [ ] 07-03: TBD

### Phase 8: Drift Detection
**Goal**: The platform detects when tenant security configurations change and alerts the MSP in near-real-time
**Depends on**: Phase 6
**Requirements**: DRIFT-01, DRIFT-02, DRIFT-03, DRIFT-04, DRIFT-05, DRIFT-06
**Success Criteria** (what must be TRUE):
  1. System polls directoryAudits API at configurable intervals and detects security configuration changes since last baseline
  2. System stores baseline configuration snapshots after each successful audit and compares against them for drift
  3. When drift is detected, an alert appears in the cross-tenant action queue showing what changed, when, and by whom with before/after comparison
  4. Drift alerts push to the dashboard in near-real-time via Azure SignalR so the MSP sees changes without refreshing
**Plans**: TBD

Plans:
- [ ] 08-01: TBD
- [ ] 08-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8
Note: Phase 3 and Phase 4 both depend on Phase 2 and can execute in parallel. Phase 7 depends on Phase 5 (not Phase 6) so it can execute in parallel with Phase 6.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation and Authentication | 4/4 | Complete    | 2026-03-11 |
| 2. Core Audit Engine | 3/3 | Complete    | 2026-03-11 |
| 3. Compliance Framework Mapping | 5/5 | Complete    | 2026-03-11 |
| 4. Tenant Onboarding and Management | 1/4 | In progress | - |
| 5. Dashboard and Findings UX | 0/2 | Not started | - |
| 6. Scheduling, Reporting and Trending | 0/2 | Not started | - |
| 7. Remediation Engine | 0/3 | Not started | - |
| 8. Drift Detection | 0/2 | Not started | - |
