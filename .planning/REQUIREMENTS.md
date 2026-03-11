# Requirements: Omzig M365 Zero Trust Auditor

**Defined:** 2026-03-10
**Core Value:** MSPs can see exactly where every client tenant falls short of Zero Trust compliance, fix it with confidence, and know immediately when something drifts back.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Audit Engine

- [ ] **AUDIT-01**: User can trigger an on-demand audit scan of a connected M365 tenant
- [ ] **AUDIT-02**: Audit engine evaluates all 29 CISA SCuBA Entra ID (AAD) controls via Graph API
- [ ] **AUDIT-03**: Each finding shows pass/fail status with severity level (Critical/High/Medium/Low)
- [ ] **AUDIT-04**: Audit engine collects tenant configuration state before evaluating (collect-then-evaluate pipeline)
- [ ] **AUDIT-05**: Audit results are stored per tenant for historical reference
- [ ] **AUDIT-06**: User can view detailed finding information including affected setting, current value, and expected value

### Compliance Frameworks

- [ ] **FRAME-01**: Each finding maps to its CISA SCuBA control ID with SHALL/SHOULD/MAY requirement level
- [ ] **FRAME-02**: Audit engine evaluates tenant against NIST 800-207 Zero Trust Architecture (all 7 tenets, 31+ checks)
- [ ] **FRAME-03**: Each finding cross-maps to NIST 800-53 security control families where applicable
- [ ] **FRAME-04**: Each finding cross-maps to NIST CSF 2.0 functions (Identify/Protect/Detect/Respond/Recover) where applicable
- [ ] **FRAME-05**: User can view compliance score per framework (CISA SCuBA, NIST 800-207, NIST 800-53, CSF 2.0)
- [ ] **FRAME-06**: User can view ZTA maturity level (Traditional/Initial/Advanced/Optimal) per NIST 800-207 tenet
- [ ] **FRAME-07**: Dashboard displays ZTA maturity radar chart showing maturity across all 7 tenets

### Multi-Tenant Management

- [ ] **TENANT-01**: MSP can onboard a client tenant via OAuth consent flow (client admin grants permissions)
- [ ] **TENANT-02**: MSP can onboard a client tenant via GDAP/Lighthouse delegated admin relationship
- [ ] **TENANT-03**: Multi-tenant dashboard shows all connected tenants with compliance scores and health status (red/yellow/green)
- [ ] **TENANT-04**: MSP can click into any tenant from the dashboard to view detailed findings
- [ ] **TENANT-05**: MSP can configure scheduled audit scans per tenant (daily/weekly frequency)
- [ ] **TENANT-06**: Scheduled scans run automatically via Azure Functions timer triggers with stagger logic to avoid throttling
- [ ] **TENANT-07**: MSP can remove a client tenant and all associated data is deleted
- [ ] **TENANT-08**: Per-tenant database isolation — each client tenant's data is stored in a separate Azure SQL database within an Elastic Pool

### Dashboard & Reporting

- [ ] **DASH-01**: Web-based dashboard with interactive drill-down (framework -> category -> finding -> remediation)
- [ ] **DASH-02**: User can filter findings by severity, framework, workload, and status
- [ ] **DASH-03**: User can export compliance report as PDF for client-facing documentation
- [ ] **DASH-04**: User can export detailed findings as CSV for data analysis
- [ ] **DASH-05**: Each finding displays remediation guidance with step-by-step instructions
- [ ] **DASH-06**: Remediation guidance includes links to relevant Microsoft admin portal pages
- [ ] **DASH-07**: Remediation guidance includes PowerShell commands where applicable
- [ ] **DASH-08**: Dashboard shows historical compliance score trends over time per tenant
- [ ] **DASH-09**: Score trending chart shows compliance improvement/regression across scan history
- [ ] **DASH-10**: Alert/action queue shows drift events and critical findings across all tenants

### Remediation

- [ ] **REMED-01**: Each remediable finding is classified as SAFE or RISKY based on blast radius
- [ ] **REMED-02**: User can auto-remediate SAFE findings with one-click approval (e.g., enable DKIM, block legacy auth, enable mailbox auditing)
- [ ] **REMED-03**: RISKY findings present a guided wizard showing impact preview before changes (e.g., "47 users on non-compliant devices will be blocked")
- [ ] **REMED-04**: RISKY CA policy remediations deploy in Report-Only mode first, with a separate step to enforce
- [ ] **REMED-05**: All remediations are logged with before/after values, timestamp, and user who approved
- [ ] **REMED-06**: User can rollback any remediation to restore previous configuration state
- [ ] **REMED-07**: Remediation engine validates prerequisites before applying changes (e.g., break-glass accounts exist, compliant devices enrolled)
- [ ] **REMED-08**: Auto-remediation uses minimum-privilege Graph API permissions, requested only when remediation is activated (separate from read-only audit permissions)

### Drift Detection

- [ ] **DRIFT-01**: System polls directoryAudits API at configurable intervals (15min to 1hr) to detect security configuration changes
- [ ] **DRIFT-02**: System stores baseline snapshots of tenant configuration state after each successful audit
- [ ] **DRIFT-03**: When drift is detected, system creates an alert with before/after comparison of changed settings
- [ ] **DRIFT-04**: Drift alerts appear in the cross-tenant alert queue on the dashboard
- [ ] **DRIFT-05**: User can view drift event details showing what changed, when, and by whom
- [ ] **DRIFT-06**: Drift alerts push to dashboard in near-real-time via Azure SignalR

### Authentication & Security

- [ ] **AUTH-01**: MSP admins authenticate via Microsoft Entra ID (work account sign-in)
- [ ] **AUTH-02**: MFA is enforced for all users via Conditional Access policy on the app
- [ ] **AUTH-03**: App-level RBAC with three roles: Admin (full access), Analyst (audit + remediate), Read-only (view only)
- [ ] **AUTH-04**: Client tenant tokens are encrypted at rest using Azure Key Vault / Always Encrypted
- [ ] **AUTH-05**: All service-to-service communication uses managed identities (no stored secrets)
- [ ] **AUTH-06**: Graph API permissions per tenant are scoped to minimum required for audit (read-only by default)
- [ ] **AUTH-07**: Database access uses private endpoints (no public internet access)

### Infrastructure

- [ ] **INFRA-01**: Next.js frontend deployed to Azure Container Apps
- [ ] **INFRA-02**: Core API/audit engine runs on Azure Container Apps (Hono framework)
- [x] **INFRA-03**: Event-driven workloads (webhook receivers, scheduled scans, remediation execution) run on Azure Functions
- [ ] **INFRA-04**: Azure SQL Elastic Pool with per-tenant databases for data isolation
- [ ] **INFRA-05**: Azure SignalR Service (serverless mode) for real-time dashboard updates
- [ ] **INFRA-06**: Azure Key Vault for all secrets and tenant token encryption
- [x] **INFRA-07**: TypeScript monorepo (Turborepo + pnpm) with shared packages

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

**Why deferred:** 83% of CISA SCuBA controls (106 of 128) require product-specific PowerShell modules (ExchangeOnlineManagement, MicrosoftTeams, PnP.PowerShell, Security & Compliance) that cannot run via Microsoft Graph API. Each module requires its own certificate-based authentication per tenant, a PowerShell runtime (not available in TypeScript/Node.js), and per-tenant certificate lifecycle management (provisioning, Key Vault storage, rotation). This adds significant infrastructure complexity that would delay v1 launch without adding value to the 29 Entra ID + 31 NIST ZTA checks that Graph API already supports.

**What unblocks v2:** Build a PowerShell Azure Functions sidecar that the TypeScript API calls for data collection. The existing `Run-Audit` function already demonstrates this pattern. V2 extends it with certificate-based connections to Exchange, Teams, SharePoint, and Defender per tenant.

### PowerShell Connector Infrastructure

- **PSCON-01**: Certificate-based authentication framework for per-tenant PowerShell module connections
- **PSCON-02**: Per-tenant certificate provisioning, storage (Key Vault), and rotation lifecycle
- **PSCON-03**: Azure Functions (PowerShell runtime) sidecar for Exchange/Teams/SharePoint/Defender data collection

### Extended Workload Coverage (requires PowerShell connectors)

- **EXTCOV-01**: Exchange Online audit — 38 CISA SCuBA controls via ExchangeOnlineManagement PowerShell
- **EXTCOV-02**: Defender for Office 365 audit — 18 CISA SCuBA controls via Security & Compliance PowerShell
- **EXTCOV-03**: SharePoint/OneDrive audit — 8 CISA SCuBA controls via PnP.PowerShell
- **EXTCOV-04**: Teams audit — 20 CISA SCuBA controls via MicrosoftTeams PowerShell
- **EXTCOV-05**: Power Platform audit — 8 CISA controls via REST API
- **EXTCOV-06**: Power BI audit — 7 CISA controls via REST API
- **EXTCOV-07**: SCT device baseline auditing via Intune (3,940+ registry settings)
- **EXTCOV-08**: CIS Microsoft 365 Benchmark v6.0.0 support (140 controls)

### Extended Remediation

- **EXTREMED-01**: Auto-remediation for Exchange Online settings (enable DKIM, block forwarding, etc.)
- **EXTREMED-02**: Auto-remediation for Defender settings (enable preset security policies)
- **EXTREMED-03**: Batch remediation across multiple tenants ("enable DKIM across all 17 failing tenants")

### Enhanced Reporting

- **REPORT-01**: Branded/white-label PDF reports with MSP logo and custom branding
- **REPORT-02**: Executive summary section with plain-English findings for non-technical clients

### Integrations

- **INTEG-01**: PSA/ITSM integration (ConnectWise, Autotask, ServiceNow) for auto-ticket creation
- **INTEG-02**: Email/webhook notifications for critical drift events

## Out of Scope

| Feature | Reason |
|---------|--------|
| Custom compliance framework authoring | Exponential complexity. CISA SCuBA + three NIST frameworks cover 99% of needs. Allow control exclusions instead. |
| Full auto-remediation without approval | CA policy changes can lock out entire orgs. All remediations require MSP approval. |
| On-premises Active Directory auditing | Completely different architecture (agent-based, LDAP). M365/cloud-only scope. |
| Non-Microsoft cloud (AWS, GCP) | Different APIs, permission models, security surfaces. Value is depth on M365. |
| Agent-based endpoint scanning | Different product category (EDR/RMM). Audit Intune compliance state via Graph API instead. |
| Tenant deployment/provisioning | Mixing audit (read) and deploy (write new resources) creates permission scope creep. Remediation modifies existing settings only. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUDIT-01 | Phase 2 | Pending |
| AUDIT-02 | Phase 2 | Pending |
| AUDIT-03 | Phase 2 | Pending |
| AUDIT-04 | Phase 2 | Pending |
| AUDIT-05 | Phase 2 | Pending |
| AUDIT-06 | Phase 2 | Pending |
| FRAME-01 | Phase 2 | Pending |
| FRAME-02 | Phase 3 | Pending |
| FRAME-03 | Phase 3 | Pending |
| FRAME-04 | Phase 3 | Pending |
| FRAME-05 | Phase 3 | Pending |
| FRAME-06 | Phase 3 | Pending |
| FRAME-07 | Phase 3 | Pending |
| TENANT-01 | Phase 4 | Pending |
| TENANT-02 | Phase 4 | Pending |
| TENANT-03 | Phase 4 | Pending |
| TENANT-04 | Phase 4 | Pending |
| TENANT-05 | Phase 6 | Pending |
| TENANT-06 | Phase 6 | Pending |
| TENANT-07 | Phase 4 | Pending |
| TENANT-08 | Phase 4 | Pending |
| DASH-01 | Phase 5 | Pending |
| DASH-02 | Phase 5 | Pending |
| DASH-03 | Phase 6 | Pending |
| DASH-04 | Phase 6 | Pending |
| DASH-05 | Phase 5 | Pending |
| DASH-06 | Phase 5 | Pending |
| DASH-07 | Phase 5 | Pending |
| DASH-08 | Phase 6 | Pending |
| DASH-09 | Phase 6 | Pending |
| DASH-10 | Phase 5 | Pending |
| REMED-01 | Phase 7 | Pending |
| REMED-02 | Phase 7 | Pending |
| REMED-03 | Phase 7 | Pending |
| REMED-04 | Phase 7 | Pending |
| REMED-05 | Phase 7 | Pending |
| REMED-06 | Phase 7 | Pending |
| REMED-07 | Phase 7 | Pending |
| REMED-08 | Phase 7 | Pending |
| DRIFT-01 | Phase 8 | Pending |
| DRIFT-02 | Phase 8 | Pending |
| DRIFT-03 | Phase 8 | Pending |
| DRIFT-04 | Phase 8 | Pending |
| DRIFT-05 | Phase 8 | Pending |
| DRIFT-06 | Phase 8 | Pending |
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Pending |
| AUTH-05 | Phase 1 | Pending |
| AUTH-06 | Phase 2 | Pending |
| AUTH-07 | Phase 1 | Pending |
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Complete |
| INFRA-04 | Phase 1 | Pending |
| INFRA-05 | Phase 1 | Pending |
| INFRA-06 | Phase 1 | Pending |
| INFRA-07 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 59 total
- Mapped to phases: 59
- Unmapped: 0

---
*Requirements defined: 2026-03-10*
*Last updated: 2026-03-10 after roadmap phase mapping*
