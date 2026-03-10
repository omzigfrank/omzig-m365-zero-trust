# Project Research Summary

**Project:** Omzig M365 Zero Trust Auditor
**Domain:** Multi-tenant M365 Zero Trust Security Auditing Platform for MSPs
**Researched:** 2026-03-10
**Confidence:** HIGH

## Executive Summary

This project is a commercial SaaS auditing platform targeting MSPs who manage multiple Microsoft 365 tenants. The core value proposition is continuous, multi-tenant compliance monitoring against CISA SCuBA and NIST Zero Trust Architecture frameworks — something no competitor currently combines. Research confirms the correct approach is a TypeScript monorepo (Next.js frontend, Hono API on Container Apps, Azure Functions for event-driven work) with per-tenant Azure SQL databases in an elastic pool for strong data isolation. The audit engine should follow CISA ScubaGear's proven two-phase pattern: collect tenant facts via Graph API in parallel, then evaluate those facts as pure functions against framework control catalogs. This architecture supports testability, incremental framework expansion, and scale to hundreds of tenants.

The recommended MVP is narrow but credible: full Entra ID audit coverage (29 CISA AAD controls) plus NIST 800-207 Zero Trust checks (31 already implemented), delivered through a web dashboard with pass/fail results, remediation guidance, and basic PDF/CSV export. The existing audit engine, baseline files, and Next.js foundation in the repo accelerate the first phase significantly. NIST 800-207 ZTA mapping is a genuine competitive whitespace — no other tool provides it — and it should be the primary differentiator at launch.

Three risks demand early architectural decisions. First, Graph API change notifications do not support conditional access policies, Intune configs, DLP rules, or any of the security configurations this tool monitors — the "real-time drift detection via webhooks" assumption is false for most audit workloads and must be replaced with audit log polling plus scheduled re-scans from Phase 1. Second, 83% of CISA SCuBA controls require non-Graph PowerShell modules (Exchange Online, Teams, SharePoint) that require certificate-based auth and isolated execution environments — the MVP must launch with Graph-only coverage and add PowerShell connectors incrementally. Third, auto-remediation of CA policies and compliance policies without prerequisite validation causes user lockouts which destroy MSP client trust — every remediation must be classified safe or risky at the control definition level before any remediation feature ships.

## Key Findings

### Recommended Stack

The stack is TypeScript throughout. The frontend is Next.js 16 on Azure Container Apps (not Static Web Apps — SWA lacks full Next.js 16 support for streaming and middleware). The API is a Hono 4 server on Container Apps, chosen over Express for cold-start performance and multi-runtime portability. Azure Functions (v4 Node.js programming model) handle event-driven work only: webhook receivers, scheduled scan triggers, and remediation workers. Azure Service Bus queues remediation jobs with guaranteed delivery and dead-letter queues. Azure SignalR Service in serverless mode pushes real-time drift alerts to the frontend without a persistent WebSocket server. The database layer uses Azure SQL Elastic Pools with one database per client tenant (the only acceptable isolation model for a security tool), managed via Prisma 7 — the only TypeScript ORM that supports Azure SQL. Drizzle does not support SQL Server. MSAL is the exclusive auth library; Auth.js/NextAuth cannot handle GDAP flows, incremental Graph API consent, or multi-tenant app registrations.

The existing PowerShell Azure Functions for the deployment tool remain unchanged. The auditing platform is a new TypeScript codebase that coexists in the same repo via a Turborepo monorepo structure, sharing `packages/` for types, Graph helpers, and audit framework definitions.

**Core technologies:**
- Next.js 16 + React 19: Frontend on Azure Container Apps — App Router enables server-side Graph token handling without exposing tokens to the browser
- Hono 4 + Node.js 22 LTS: API server — lightweight, fast cold starts, runs identically in Container Apps and Functions
- Azure Functions v4 (TypeScript): Event-driven workers only — webhook receiver, scan scheduler trigger, remediation executor
- Azure Service Bus Standard: Reliable remediation job queue — FIFO, dead-letter queues, exactly-once delivery; preferred over Redis (retiring Sept 2028)
- Azure SQL Elastic Pools (General Purpose): Per-tenant databases — strongest isolation for a security product; catalog pattern for tenant-to-connection-string routing
- Prisma 7: TypeScript ORM — only viable option with Azure SQL Server support; pure TS engine in v7 (no Rust)
- MSAL (@azure/msal-browser 4 + @azure/msal-node 3): Auth — mandatory for Entra ID, GDAP flows, incremental consent, app role claims
- @microsoft/microsoft-graph-client 3.0.7: Graph API — stable release only; msgraph-sdk 1.0 is still preview
- Azure SignalR Service (serverless mode): Real-time drift alerts — no persistent hub server needed; Functions send messages via REST
- Zod 4: Schema validation + TypeScript inference — single source of truth for API payload shapes
- Turborepo 2 + pnpm 9: Monorepo — share types, Graph helpers, and framework definitions across web, API, and Functions
- Azure Bicep: IaC — continue existing pattern for all new infrastructure

### Expected Features

Research confirmed this market through analysis of ScubaGear, Maester, CoreView, Augmentt, Octiga, and Senserva. The competitive gap is clear: open-source tools lack multi-tenant management and auto-remediation; commercial tools lack depth on NIST 800-207 ZTA coverage and have no safe/risky remediation classification preventing lockouts.

**Must have (table stakes):**
- Multi-framework compliance audit (CISA SCuBA AAD + NIST 800-207) — every competitor audits at least one framework; missing this means zero adoption
- Pass/fail per-control results with Critical/High/Medium/Low severity — auditors require granular control-level results, not just a percentage
- Multi-tenant dashboard (tenant health grid) — MSPs managing 20-200 tenants cannot use per-tenant tools; this is the market entry requirement
- Tenant onboarding via OAuth consent — simplest path; GDAP can wait for v1.x
- Exportable compliance reports (PDF/CSV) — auditors and compliance officers need printable evidence
- RBAC (Admin/Analyst/Read-only roles) — universal SaaS requirement; use Entra ID app roles
- Remediation guidance per finding — step-by-step instructions with admin portal links at minimum
- Scheduled and on-demand audit scans — both recurring and ad-hoc assessments required by MSP workflows

**Should have (competitive differentiators):**
- NIST 800-207 ZTA mapping — no competitor maps M365 config to Zero Trust Architecture tenets; this is genuine whitespace with federal and enterprise demand
- Auto-remediation with safe/risky classification — prevents lockout disasters; addresses the failure mode every commercial tool ignores
- Exchange Online audit engine (37 CISA controls) — largest single coverage gap; required for credibility with security-focused MSPs
- Historical compliance trending — MSPs need to show clients score improvements over time
- GDAP/Lighthouse tenant onboarding — required for MSPs with CSP partner relationships
- NIST 800-53 + CSF 2.0 cross-framework mapping — single remediation that satisfies multiple auditors simultaneously
- Unified cross-tenant action queue — surface systemic issues ("17 tenants lack DKIM") and enable batch fixes

**Defer to v2+:**
- SharePoint/Teams/Power Platform audit engines — lower priority; Graph-only coverage ships first
- Guided remediation with impact preview (CA "What If" analysis) — high complexity; valid v2 differentiator
- Configuration drift detection — significant infrastructure; add after core audit is validated
- Branded/white-label PDF reports — nice-to-have once MSPs confirm core value
- SCT device baseline auditing (3,940+ Intune registry settings) — unique differentiator but high complexity
- PSA/ITSM integration (ConnectWise, Autotask) — MSP workflow integration for a mature product
- Batch remediation across tenants — useful once single-tenant auto-remediation core is proven

### Architecture Approach

The architecture separates concerns into three independently deployable units sharing code through a Turborepo monorepo. The Container Apps API is the always-on orchestrator: it holds the audit engine, tenant graph client factory, RBAC middleware, and SignalR hub management. Azure Functions handle only event-driven workloads with no execution timeout concerns for the audit itself. Per-tenant SQL databases in an elastic pool provide the strongest isolation available for a product that stores client security vulnerability data. Every audit run follows the collect-then-evaluate pipeline pattern (facts collected from Graph API in parallel; evaluators are pure functions that never call Graph directly), which CISA ScubaGear validates at scale.

**Major components:**
1. **Next.js Frontend (Container Apps)** — Dashboard, drill-downs, report viewer, tenant onboarding wizard, real-time drift alert display via SignalR client
2. **Core API (Container Apps)** — Audit orchestration, tenant resolution, RBAC enforcement, Graph client factory, SignalR hub management; the single gateway — frontend never calls Graph, DB, or Key Vault directly
3. **Fact Collector** — Parallel Graph API calls for 18+ configuration sections per tenant; results normalized into a typed TenantFacts structure
4. **Evaluator Engine** — Pure functions taking TenantFacts as input, one evaluator per CISA/NIST control; evaluators have no side effects and never call Graph
5. **Catalog DB (Azure SQL, single)** — Shared platform data: tenant registry, RBAC assignments, control definitions, framework metadata, webhook subscription records
6. **Tenant DBs (Elastic Pool, one per client tenant)** — Audit results, historical scores, drift events, remediation history, configuration snapshots; Always Encrypted for sensitive columns
7. **Azure Functions** — Webhook receiver (user/group changes only), scheduled scan trigger (calls API per-tenant), remediation worker (queue-triggered), subscription renewal manager
8. **Azure SignalR Service (serverless)** — Real-time drift alerts and audit progress pushed from API to frontend; no persistent hub server required
9. **Azure Key Vault** — All tenant OAuth tokens, GDAP certificates, DB connection strings; managed identity access only; application stores vault URIs, not token values
10. **Azure Blob Storage** — Generated PDF/CSV reports, audit exports; access via time-limited SAS tokens

### Critical Pitfalls

1. **Webhook drift detection does not work for security configurations** — Graph API change notifications explicitly exclude CA policies, Intune configs, DLP rules, Defender settings, and Exchange settings. Build drift architecture around audit log polling (`/auditLogs/directoryAudits`) as primary channel, Graph webhooks only for user/group changes, and scheduled full re-scans as authoritative baseline. This decision must be locked in Phase 1; changing it later requires an architecture rewrite.

2. **Graph API throttling destroys multi-tenant scan performance** — CA/Identity Protection endpoints throttle at 1 request/second/tenant with no `Retry-After` header. Intune allows only 200 write requests per 20 seconds per tenant. At 50+ tenants with parallel scans, throttling is inevitable without a centralized request queue with per-tenant rate limiting, staggered scan scheduling (~3 tenants/minute), and Graph batch requests. Rate limiting must be built into the scan engine core in Phase 2 — it cannot be added cleanly later.

3. **Auto-remediation lockouts destroy MSP client trust** — Enabling a device compliance CA policy when no devices are enrolled bricks user access. Enabling admin MFA before phishing-resistant methods are deployed locks out admins. Classify every remediation as SAFE or RISKY at the control definition level before any remediation feature ships. CA policies must deploy in Report-Only mode first; the transition to Enabled is always a separate manual action.

4. **Cross-tenant data leakage in a security auditing tool is catastrophic** — Even with per-tenant databases, leakage occurs through application-level caches without tenant-scoped keys, API endpoints that trust client-provided tenant IDs in URL parameters, and error messages containing wrong-tenant context. Derive tenant context exclusively from the authenticated token. Scope all cache keys with tenant ID. Include automated cross-tenant isolation tests in CI/CD from Phase 1.

5. **83% of CISA SCuBA controls require non-Graph PowerShell modules** — Exchange Online (37 controls), Teams (20 controls), and SharePoint (8 controls) require certificate-based authentication and cannot run reliably in Azure Functions due to cold start and memory issues with the PowerShell modules. Launch with Graph-only coverage clearly communicated, design a modular connector architecture in Phase 1 using Container Apps Jobs for PowerShell execution, and never promise 100% CISA coverage in early phases.

## Implications for Roadmap

Based on the architecture dependency chain in ARCHITECTURE.md and the pitfall-to-phase mapping in PITFALLS.md, a 6-phase structure is recommended.

### Phase 1: Foundation and Infrastructure
**Rationale:** Per-tenant database architecture, tenant isolation patterns, Key Vault credential storage, and Container Apps environment must exist before any application code can run. The drift detection architecture (polling vs. webhooks) must also be decided here — changing it later requires a rewrite. Cross-tenant isolation tests must be in CI/CD from this phase, not added as an afterthought. The connector architecture design for future PowerShell modules should also be specified here even if no connectors are built yet.
**Delivers:** Turborepo monorepo structure, Azure infrastructure (Container Apps, Elastic Pool, Functions, Key Vault, SignalR, Service Bus), Catalog DB schema, shared TypeScript packages (types, Graph helpers, framework definitions), auth middleware (Entra ID token validation, tenant resolver, RBAC), automated tenant isolation tests in CI/CD.
**Addresses:** RBAC infrastructure, tenant registry, Graph client factory pattern, connector architecture design
**Avoids:** Cross-tenant data leakage (Pitfall 4), webhook drift detection misdesign (Pitfall 1), shared database anti-pattern

### Phase 2: Core Audit Engine (Entra ID + NIST ZTA)
**Rationale:** The audit engine is the product's core value. Porting the existing TenantFactCollector.ps1 and evaluators to TypeScript with the collect-then-evaluate pattern gives the team a working end-to-end audit before building UI or multi-tenant management. Single-tenant audit must work before multi-tenant scale is attempted. Rate limiting must be built into the Graph API client here — retrofitting it after the engine is built causes wide refactors.
**Delivers:** TypeScript fact collector (18+ sections via parallel Graph API calls), CISA SCuBA AAD evaluators (29 controls, completing the 12 missing from the current 17), NIST 800-207 ZTA evaluators (31 checks, porting existing PowerShell evaluators), severity-weighted scoring engine, per-tenant DB schema for audit results, Graph API rate limiter with per-tenant token bucket, beta endpoint compatibility layer with graceful degradation.
**Uses:** @microsoft/microsoft-graph-client 3.0.7, Prisma 7, Zod 4, @azure/identity 4
**Implements:** Fact Collector + Evaluator Engine + Tenant DB repositories
**Avoids:** Graph API throttling at scale (Pitfall 2), beta endpoint breakage causing full audit failure (Pitfall 7)

### Phase 3: Tenant Onboarding, Multi-Tenant Dashboard, and Reporting
**Rationale:** Once the audit engine produces correct results for a single tenant, the experience layer can be built. Tenant onboarding via OAuth consent is the simpler path — GDAP adds complexity that can wait. The dashboard must show data freshness prominently from day one; displaying stale results without warnings is a documented UX pitfall. Reports are included in this phase because MSPs cannot use the tool in client conversations without printable evidence.
**Delivers:** OAuth consent onboarding wizard, tenant management UI, multi-tenant dashboard (health grid with red/yellow/green scores and "last scanned" timestamps), audit results drill-down (framework to category to finding with severity and remediation guidance text), per-tenant on-demand audit execution, GDAP/OAuth token health monitoring with disconnected-tenant visibility, basic PDF compliance reports (@react-pdf/renderer), CSV export, connection health indicators prominently displayed.
**Uses:** Next.js 16, shadcn/ui, Tailwind 4, Recharts, MSAL, @react-pdf/renderer 4, Azure Blob Storage
**Implements:** Tenant Management service, Dashboard layer, Report Generator Function
**Avoids:** GDAP token lifecycle silent failures (Pitfall 5), stale data without warning (UX pitfall), flat list of 159 checks overwhelming analysts (UX pitfall)

### Phase 4: Scheduled Scanning and Historical Trending
**Rationale:** MSPs need recurring automated assessments and evidence of score improvement over time before they can justify the product to clients. Scheduled scans require the staggered rate limiting from Phase 2 to work correctly at multi-tenant scale. Historical trending requires snapshot storage designed to avoid unbounded growth (a documented performance trap).
**Delivers:** Timer-triggered Azure Functions for daily/weekly per-tenant scheduled scans with configurable intervals, scan stagger logic to prevent concurrent throttling across tenants, historical compliance trending (score-over-time display per framework and per category), audit result archiving strategy (hot storage for 90 days, cold storage to Blob after), scan schedule configuration per tenant in the management UI.
**Uses:** Azure Functions timer triggers, Azure Blob Storage for report files and cold archive
**Implements:** Scheduled Scan Runner Function, historical trend queries, data retention management
**Avoids:** Full tenant scan on every audit run (performance trap), audit history growing unbounded (data retention trap)

### Phase 5: Exchange Online Audit and GDAP Onboarding
**Rationale:** Exchange Online (37 CISA controls) is the largest single coverage gap and is required for credibility with security-focused MSPs. This phase introduces the PowerShell connector architecture using Container Apps Jobs as isolated execution environments. GDAP onboarding is included here because MSPs with CSP relationships require it and the authentication patterns for GDAP and Exchange certificate-based auth are closely related. Together these two additions move the product from "interesting experiment" to "production MSP tool."
**Delivers:** Exchange Online connector using certificate-based app-only auth in Container Apps Jobs, ExchangeHelper TypeScript wrapper invoking PowerShell sessions, 37 additional CISA SCuBA evaluators covering mail flow rules, DKIM/DMARC, anti-spam, forwarding rule detection, and mailbox auditing, GDAP tenant onboarding flow via Partner Center API, GDAP relationship expiration monitoring with 30/14/7-day renewal alerts, per-connector certificate rotation automation in Key Vault.
**Uses:** ExchangeOnlineManagement PowerShell module, Azure Container Apps Jobs, Partner Center API, Key Vault for per-tenant certificates
**Implements:** PowerShell Connector Architecture (first instance), GDAP integration
**Avoids:** 83% CISA non-Graph coverage gap (Pitfall 6), GDAP token lifecycle silent failures (Pitfall 5)

### Phase 6: Remediation Engine and Drift Detection
**Rationale:** Remediation and drift detection both have the highest consequence of errors (lockouts, false-positive alerts at scale) and require stable audit results, multi-tenant management, and tenant state snapshots as prerequisites. They share infrastructure (Service Bus queue, approval workflow, SignalR push) so they are developed together. The safe/risky classification must be part of the control definition schema designed here. Drift detection is explicitly Phase 6 because UTCM APIs (Microsoft's native drift detection, currently in preview with 6-hour intervals) may reach GA during this phase and could simplify polling infrastructure.
**Delivers:** Safe/risky remediation classification in control definition schema, one-click auto-remediation for SAFE controls (enable DKIM, turn on audit logging, enable mailbox auditing) with MSP approval, guided remediation wizard for RISKY controls with prerequisite validation chains, CA policy auto-remediation to Report-Only mode only (transition to Enabled is always a separate manual action), rollback/undo mechanism with pre-change state snapshot, full remediation audit trail (actor, timestamp, before state, after state), hybrid drift detection (audit log polling every 15 minutes for security config changes + Graph webhooks for user/group membership changes), drift event severity classification, SignalR push of High/Critical drift alerts to dashboard with daily digest for Medium/Low.
**Uses:** Azure Service Bus (remediation job queue), Azure Functions (remediation worker, audit log poller, subscription manager), Azure SignalR Service
**Implements:** Approval-Gated Remediation Queue, Hybrid Drift Detection patterns
**Avoids:** Auto-remediation lockouts (Pitfall 3), webhook drift detection impossibility (Pitfall 1), Graph webhook subscription expiry without renewal (integration gotcha)

### Phase Ordering Rationale

- Phase 1 before all else: per-tenant isolation and infrastructure are load-bearing. A wrong architecture decision (shared DB with RLS) cannot be refactored cheaply after audit data accumulates.
- Phase 2 (audit engine) before Phase 3 (UI): there is nothing to display without working audit results. TypeScript port now enables shared types and Graph helpers to flow into all subsequent work.
- Phase 3 (dashboard + onboarding + basic reports) before Phase 4 (scheduling): MSPs need to see and export results in a web UI before they care about automation or historical charts.
- Phase 5 (Exchange + GDAP) after Phase 4: the PowerShell connector architecture introduces new execution infrastructure (Container Apps Jobs) that benefits from a stable monorepo foundation. GDAP complexity is much easier to handle once OAuth flows are proven.
- Phase 6 (remediation + drift) last: highest consequence of errors, depends on stable audit results, state snapshots from Phase 4 trending data, and all tenant management patterns from prior phases.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 5:** Exchange Online connector execution in Container Apps Jobs requires hands-on investigation of the ExchangeOnlineManagement module's behavior under multi-tenant automation — session isolation, memory limits, concurrent execution. GDAP Partner Center API flows for relationship validation also need hands-on proof-of-concept before committing to the implementation approach.
- **Phase 6:** Audit log polling at scale (100+ tenants polling every 15 minutes) needs load testing against Graph API throttling limits before settling on polling interval and batching strategy. The remediation prerequisite validation logic for each CA policy type needs detailed per-control specification.

Phases with standard patterns (skip research-phase):
- **Phase 1:** Azure SQL Elastic Pool multi-tenant patterns are documented by Microsoft with reference architectures. Turborepo + pnpm monorepo setup is standard. Container Apps + Key Vault managed identity integration is well-documented.
- **Phase 2:** The collect-then-evaluate audit engine pattern is validated by CISA ScubaGear at scale. Porting existing TenantFactCollector.ps1 and evaluators to TypeScript follows established patterns with the existing code as reference.
- **Phase 3:** Next.js 16 + MSAL + shadcn/ui patterns are mature. OAuth consent flows for Entra ID are standard and well-documented. @react-pdf/renderer is established for server-side PDF generation.
- **Phase 4:** Azure Functions timer triggers and Blob Storage archiving are standard Azure patterns with no novel integration challenges.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All major choices verified against official documentation and current release notes. Prisma 7, Next.js 16, MSAL 4, @azure/functions v4 model all confirmed stable. Hono 4 is the one medium-confidence choice — solid but newer than Express/Fastify; Fastify 5 is the documented fallback. |
| Features | HIGH | Competitor analysis covers 7 tools with specific feature matrices. CISA SCuBA control counts verified from official GitHub (128 controls, 5 M365 products). NIST 800-207 ZTA uniqueness confirmed — no competitor was found mapping M365 config to ZTA tenets across all sources examined. |
| Architecture | HIGH (core patterns), MEDIUM (drift detection specifics) | Per-tenant DB isolation, collect-then-evaluate pipeline, and tenant-scoped Graph client are verified against official Microsoft multi-tenant architecture guidance and CISA ScubaGear design. Drift detection hybrid approach is well-supported but UTCM APIs (Microsoft's native drift detection, public preview Jan 2026) are evolving — behavior may change before Phase 6. |
| Pitfalls | HIGH | All 7 critical pitfalls verified against official Microsoft documentation. Webhook limitation confirmed from official Graph change notifications supported resource list. Throttling numbers (1 req/sec CA, 200 write/20s Intune) from official Graph throttling limits page. GDAP expiration requirements from official Partner Center documentation. |

**Overall confidence:** HIGH

### Gaps to Address

- **UTCM API maturity:** Microsoft's Unified Tenant Configuration Management APIs (public preview Jan 2026) would provide native 6-hour interval drift detection for some security configurations. Current limits (800 resources/day, 30 monitors/tenant, no push notifications yet, 7-day retention) make them unsuitable for MVP. Monitor for GA announcement before Phase 6 design; if GA'd, integrate as the primary polling mechanism for supported resources instead of building custom polling.
- **Exchange Online session isolation at scale:** The ExchangeOnlineManagement module's behavior when running 50+ concurrent tenant sessions in Container Apps Jobs is not documented. Validate session limits and memory behavior during Phase 5 planning with a proof-of-concept against 10+ tenants before committing to the Container Apps Jobs execution model.
- **GDAP role-to-Graph-scope mapping:** The exact mapping between GDAP delegated admin roles (e.g., Security Reader, Intune Administrator) and the Graph API permissions they implicitly grant is partially documented. Validate during Phase 5 implementation which roles are sufficient for each evaluator category and design the onboarding flow to surface permission gaps to the MSP clearly.
- **Elastic Pool DTU sizing under scan workloads:** Write-heavy bursts when storing full audit results for 50+ tenants concurrently is not modeled in research. Load test against actual scan write patterns in Phase 2 with the 50 eDTU starting recommendation from Microsoft's reference architecture as the baseline.

## Sources

### Primary (HIGH confidence)
- [Microsoft Graph Change Notifications - Supported Resources](https://learn.microsoft.com/en-us/graph/change-notifications-overview) — Definitive list confirming CA policies, Intune configs, DLP, Defender, and Exchange settings are NOT webhook-subscribable
- [Microsoft Graph Service-Specific Throttling Limits](https://learn.microsoft.com/en-us/graph/throttling-limits) — CA API: 1 req/sec/tenant; Intune: 200 write/20s/tenant; Identity and Access: RU-based throttling
- [Multitenancy and Azure SQL - Database-per-Tenant with Elastic Pools](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/service/sql-database) — Microsoft's official multi-tenant database architecture guidance
- [Microsoft Graph Versioning and Support - Beta Policy](https://learn.microsoft.com/en-us/graph/versioning-and-support) — "APIs marked as preview can have breaking changes without notice"
- [GDAP Introduction and Expiration Requirements](https://learn.microsoft.com/en-us/partner-center/customers/gdap-introduction) — GDAP mandatory expiration, max 730 days
- [Azure SignalR Service Internals - Serverless Mode](https://learn.microsoft.com/en-us/azure/azure-signalr/signalr-concept-internals) — Serverless mode architecture; Functions send messages via REST management SDK
- [Azure Container Apps Managed Identity](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity) — Managed identity for Key Vault, SQL, Service Bus access
- [CISA ScubaGear GitHub](https://github.com/cisagov/ScubaGear) — 30,000+ downloads; collect-then-evaluate architecture; 128 controls across 5 M365 products
- [Prisma ORM 7 Announcement](https://www.prisma.io/blog/announcing-prisma-orm-7-0-0) — Pure TypeScript engine; @prisma/adapter-mssql for Azure SQL Server
- [Exchange Online App-Only Authentication](https://learn.microsoft.com/en-us/powershell/exchange/app-only-auth-powershell-v2) — Certificate-based auth requirements for non-interactive automation
- [Azure Service Bus vs Storage Queues](https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-azure-and-service-bus-queues-compared-contrasted) — FIFO, dead-letter, 256KB message justification for remediation queues
- [Microsoft Graph Subscription Resource Type - Expiration Limits](https://learn.microsoft.com/en-us/graph/api/resources/subscription?view=graph-rest-1.0) — User/group subscriptions max 29 days; must renew at 50% lifetime
- [GDAP API - Delegated Admin Relationships](https://learn.microsoft.com/en-us/graph/api/resources/delegatedadminrelationships-api-overview?view=graph-rest-1.0) — Partner Center GDAP relationship management

### Secondary (MEDIUM confidence)
- [UTCM Beta Analysis (Office365itpros)](https://office365itpros.com/2026/02/03/utcm-beta/) — UTCM preview limitations: 7-day retention, manual polling, no push notifications yet
- [Maester.dev](https://maester.dev/) — 300+ checks, commercial drift monitoring, no NIST 800-207 mapping confirmed
- [CoreView](https://www.coreview.com/) — Nightly backup drift comparison, no ZTA mapping
- [Augmentt](https://www.augmentt.com/) — MSP-focused, CIS/NIST/SOC2 baselines, one-click remediation
- [Octiga](https://www.octiga.io/) — Real-time monitoring, auto-remediation, PSA integration
- [Senserva](https://www.senserva.com/) — Automated drift + remediation, UTCM-ready
- [GDAP Multi-Tenant Automation (tminus365)](https://tminus365.com/gdap-multi-tenant-automation/) — Practical MSP patterns for GDAP token management at scale
- [CIS Microsoft 365 Foundations Benchmark v6](https://www.cisecurity.org/benchmark/microsoft_365) — 140 controls; overlap with CISA SCuBA; some MSPs specifically need CIS attestation

### Tertiary (LOW confidence)
- [M365 MSP Challenges Report 2025 (HelpNetSecurity)](https://www.helpnetsecurity.com/2025/10/20/microsoft-365-msp-challenges-report/) — MSP operational pain points with multi-tenant M365; general market validation only
- [OWASP Multi-Tenant Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html) — Tenant isolation anti-patterns; general reference used to validate pitfall analysis

---
*Research completed: 2026-03-10*
*Ready for roadmap: yes*
