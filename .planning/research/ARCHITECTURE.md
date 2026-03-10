# Architecture Research

**Domain:** Multi-tenant M365 Zero Trust Security Auditing Platform
**Researched:** 2026-03-10
**Confidence:** HIGH (core patterns), MEDIUM (drift detection specifics)

## System Overview

```
                             MSP Analysts / Admins
                                     |
                                     v
+====================================================================+
|                     PRESENTATION LAYER                              |
|  +--------------------------------------------------------------+  |
|  |                Next.js Frontend (SWA)                         |  |
|  |  Dashboard | Audit Results | Drift Alerts | Reports | Admin  |  |
|  +-------------------------------+------------------------------+  |
+==================================|=================================+
                                   | REST + SignalR (WebSocket)
                                   v
+====================================================================+
|                     API / ORCHESTRATION LAYER                       |
|  +--------------------------------------------------------------+  |
|  |             Azure Container Apps (Core API)                   |  |
|  |                                                               |  |
|  |  +----------+  +----------+  +-----------+  +-------------+  |  |
|  |  | Auth &   |  | Audit    |  | Tenant    |  | SignalR     |  |  |
|  |  | Tenant   |  | Engine   |  | Mgmt &   |  | Hub (drift  |  |  |
|  |  | Resolver |  | (runner) |  | Onboard  |  | push)       |  |  |
|  |  +----------+  +----------+  +-----------+  +-------------+  |  |
|  +--------------------------------------------------------------+  |
+==================================|=================================+
                                   |
          +------------------------+------------------------+
          |                        |                        |
          v                        v                        v
+==================+  +=====================+  +=====================+
| EVENT-DRIVEN     |  |    DATA LAYER       |  | EXTERNAL SERVICES   |
| LAYER            |  |                     |  |                     |
| Azure Functions  |  | +---Azure SQL----+  |  | Microsoft Graph API |
|                  |  | | Elastic Pool   |  |  |   v1.0 + beta      |
| +-------------+  |  | | +-----------+  |  |  |                     |
| | Webhook     |  |  | | | Tenant A  |  |  |  | Entra ID (auth)     |
| | Receiver    |  |  | | | DB        |  |  |  |                     |
| +-------------+  |  | | +-----------+  |  |  | Partner Center API  |
| +-------------+  |  | | +-----------+  |  |  | (GDAP)              |
| | Scheduled   |  |  | | | Tenant B  |  |  |  |                     |
| | Scan Runner |  |  | | | DB        |  |  |  | CISA ScubaGear      |
| +-------------+  |  | | +-----------+  |  |  | (control catalog)   |
| +-------------+  |  | | +-----------+  |  |  +=====================+
| | Remediation |  |  | | | Catalog   |  |  |
| | Executor    |  |  | | | DB        |  |  |
| +-------------+  |  | | +-----------+  |  |
| +-------------+  |  | +---------------+  |
| | Subscription|  |  |                     |
| | Manager     |  |  | Azure Key Vault     |
| +-------------+  |  | (tokens, certs)     |
+==================+  |                     |
                       | Azure Blob Storage  |
                       | (reports, exports)  |
                       +=====================+
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| **Next.js Frontend** | Dashboard, drill-downs, report viewer, tenant onboarding wizard, real-time drift alert display | Next.js on Azure Static Web Apps; MSAL.js for Entra ID auth; SignalR client for push notifications |
| **Core API (Container Apps)** | REST API gateway, audit orchestration, tenant resolution, RBAC enforcement, WebSocket hub for real-time events | Node.js or .NET on Azure Container Apps; holds persistent SignalR connections; stateful enough for long-running audit sessions |
| **Auth & Tenant Resolver** | Validate Entra ID tokens, resolve calling user to MSP tenant, determine which client tenants they can access, enforce RBAC roles | Middleware in Core API; reads RBAC assignments from catalog DB; validates GDAP relationship status |
| **Audit Engine** | Execute compliance checks against tenant configurations, score findings, compare to baselines (CISA SCuBA, NIST 800-207, NIST 800-53, NIST CSF 2.0) | Core logic in Container Apps; calls Graph API per-tenant; evaluates controls using rule engine; stores results in tenant DB |
| **Tenant Management** | Onboard/offboard client tenants, manage OAuth consent or GDAP relationships, store encrypted tokens, provision per-tenant databases | Core API service; provisions Azure SQL databases in elastic pool; manages token lifecycle |
| **SignalR Hub** | Push real-time drift alerts and audit progress to connected frontend clients | Azure SignalR Service (serverless mode) connected to Container Apps |
| **Webhook Receiver (Function)** | Receive Graph change notifications for subscribed resources per tenant, classify changes, trigger drift evaluation | HTTP-triggered Azure Function; validates notification payload; queues drift analysis |
| **Scheduled Scan Runner (Function)** | Execute full or incremental audits on a schedule (daily/weekly per tenant) | Timer-triggered Azure Function; pulls tenant list from catalog DB; invokes audit engine API |
| **Remediation Executor (Function)** | Execute approved remediation actions against client tenants via Graph API | Queue-triggered Azure Function; reads approved remediation from queue; applies changes with audit trail |
| **Subscription Manager (Function)** | Create, renew, and clean up Graph change notification subscriptions for all monitored tenants | Timer-triggered Azure Function; runs every few hours to renew subscriptions before expiry |
| **Catalog DB** | Shared database for MSP-level data: tenant registry, user RBAC assignments, control definitions, framework metadata, subscription records | Single Azure SQL database; NOT per-tenant data; holds the "control plane" information |
| **Tenant DBs** | Per-tenant isolated databases for audit results, historical scores, drift events, remediation history, configuration snapshots | One Azure SQL database per client tenant, all in same elastic pool; Always Encrypted for sensitive columns |
| **Key Vault** | Store encrypted tenant tokens, GDAP certificates, API keys | Azure Key Vault with managed identity access only; per-tenant token references |
| **Blob Storage** | Generated PDF/CSV reports, audit exports, cached control catalogs | Azure Blob Storage with SAS token access for downloads |

## Recommended Project Structure

```
omzig-m365-zero-trust/
├── apps/
│   ├── web/                        # Next.js frontend
│   │   ├── src/
│   │   │   ├── app/                # App router pages
│   │   │   │   ├── dashboard/      # MSP multi-tenant overview
│   │   │   │   ├── tenants/        # Tenant management & onboarding
│   │   │   │   ├── audit/          # Audit execution & results
│   │   │   │   ├── drift/          # Drift events & alerts
│   │   │   │   ├── remediation/    # Remediation queue & approvals
│   │   │   │   ├── reports/        # Compliance report generation
│   │   │   │   └── settings/       # RBAC, preferences
│   │   │   ├── components/
│   │   │   │   ├── audit/          # Audit-specific components
│   │   │   │   ├── dashboard/      # Dashboard widgets
│   │   │   │   ├── drift/          # Drift notification components
│   │   │   │   ├── layout/         # Shell, sidebar, header
│   │   │   │   └── ui/             # Shared primitives
│   │   │   ├── hooks/              # Custom React hooks
│   │   │   ├── lib/                # Utilities, API client, types
│   │   │   └── providers/          # Auth, SignalR, query providers
│   │   └── package.json
│   │
│   └── api/                        # Core API (Container Apps)
│       ├── src/
│       │   ├── routes/             # REST endpoint handlers
│       │   │   ├── tenants/        # Tenant CRUD & onboarding
│       │   │   ├── audit/          # Audit execution & results
│       │   │   ├── drift/          # Drift event queries
│       │   │   ├── remediation/    # Remediation approval & execution
│       │   │   └── reports/        # Report generation
│       │   ├── services/           # Business logic
│       │   │   ├── audit-engine/   # Core audit evaluation logic
│       │   │   ├── graph-client/   # Per-tenant Graph API client
│       │   │   ├── tenant-mgmt/   # Tenant provisioning
│       │   │   ├── drift/          # Drift classification & alerting
│       │   │   └── remediation/    # Remediation planning & execution
│       │   ├── middleware/         # Auth, tenant resolution, RBAC
│       │   ├── db/                 # Database access layer
│       │   │   ├── catalog/        # Catalog DB repositories
│       │   │   └── tenant/         # Per-tenant DB repositories
│       │   ├── frameworks/         # Compliance framework definitions
│       │   │   ├── cisa-scuba/     # CISA control catalog + evaluators
│       │   │   ├── nist-800-207/   # NIST ZTA checks
│       │   │   ├── nist-800-53/    # NIST 800-53 mappings
│       │   │   └── nist-csf/       # NIST CSF 2.0 mappings
│       │   └── signalr/            # Real-time notification hub
│       └── package.json
│
├── functions/                      # Azure Functions (event-driven)
│   ├── webhook-receiver/           # Graph change notification handler
│   ├── scheduled-scanner/          # Timer-triggered full scans
│   ├── remediation-worker/         # Queue-triggered remediation
│   ├── subscription-manager/       # Graph subscription lifecycle
│   ├── report-generator/           # Async report generation
│   └── shared/                     # Shared utilities across functions
│
├── packages/                       # Shared code (monorepo)
│   ├── types/                      # Shared TypeScript types
│   ├── frameworks/                 # Framework definitions (shared between API + functions)
│   └── graph-helpers/              # Graph API utilities (shared)
│
├── infra/                          # Infrastructure as Code
│   ├── bicep/                      # Azure Bicep modules
│   │   ├── main.bicep
│   │   ├── container-apps.bicep
│   │   ├── sql-elastic-pool.bicep
│   │   ├── functions.bicep
│   │   ├── keyvault.bicep
│   │   └── signalr.bicep
│   └── scripts/                    # Deployment scripts
│
├── baselines/                      # SCT baseline data (existing)
├── docs/                           # Documentation
├── .planning/                      # Planning artifacts
└── turbo.json                      # Turborepo config (monorepo orchestration)
```

### Structure Rationale

- **apps/web and apps/api as separate deployables:** The frontend deploys to Static Web Apps and the API to Container Apps. They share types via the `packages/` workspace but build and deploy independently. This matches the constraint that the frontend is a static site (SSG/SSR on edge) while the API needs persistent container processes for SignalR and long-running audit sessions.
- **functions/ as a separate deployable:** Azure Functions deploy as their own Function App. They share `packages/` code but run on a consumption plan, scaling to zero when no events fire. Keeping them separate avoids coupling the always-on API container with event-driven workloads.
- **packages/ for shared code:** TypeScript types, framework definitions, and Graph API helpers are shared across web, API, and functions. A monorepo with Turborepo handles build ordering and caching.
- **infra/ replaces the existing top-level bicep/:** Infrastructure code moves to a dedicated folder. The existing `bicep/` modules for deployment (identity, devices, security, data) stay where they are as they serve the deployment tool, not the auditing platform.
- **frameworks/ in packages/ and api/:** Framework definitions (CISA control catalogs, NIST checks, evaluators) live in a shared package so both the API audit engine and the scheduled scanner Function can use them without duplication.

## Architectural Patterns

### Pattern 1: Tenant-Scoped Graph Client

**What:** A factory that produces pre-authenticated Graph API clients scoped to a specific client tenant. Each client uses the stored GDAP credentials or OAuth tokens for that tenant, retrieved from Key Vault.

**When to use:** Every time the system needs to read from or write to a client tenant's M365 configuration. Never make Graph calls without tenant scoping.

**Trade-offs:** (+) Strong isolation -- a bug in one tenant's client cannot leak to another. (+) Credential rotation is per-tenant. (-) Token management overhead -- must handle refresh, expiry, consent revocation per tenant.

**Example:**
```typescript
// Tenant-scoped Graph client factory
class TenantGraphClientFactory {
  constructor(
    private keyVault: KeyVaultClient,
    private catalogDb: CatalogRepository
  ) {}

  async getClient(tenantId: string): Promise<TenantGraphClient> {
    const tenantRecord = await this.catalogDb.getTenant(tenantId);

    // Retrieve encrypted token/cert from Key Vault
    const credential = await this.keyVault.getSecret(
      `tenant-${tenantId}-credential`
    );

    // GDAP: use partner token with on-behalf-of flow
    // OAuth: use stored refresh token to get access token
    const accessToken = await this.acquireToken(tenantRecord, credential);

    return new TenantGraphClient(tenantId, accessToken);
  }
}
```

### Pattern 2: Collect-Then-Evaluate Audit Pipeline

**What:** A two-phase audit where Phase 1 collects raw tenant "facts" (configurations) from Graph API into a normalized structure, and Phase 2 evaluates those facts against framework rules. This mirrors CISA ScubaGear's architecture (collect via PowerShell, evaluate via OPA/Rego policies).

**When to use:** All audit execution. The separation means evaluators are pure functions that take facts and return findings -- they never call Graph directly.

**Trade-offs:** (+) Evaluators are trivially testable (pass in mock facts, assert findings). (+) Framework rules can be updated without changing collection logic. (+) Collected facts can be cached and re-evaluated against new framework versions. (-) Collection phase must be comprehensive enough for all evaluators -- adding a new check may require adding a new fact collection step.

**Example:**
```typescript
// Phase 1: Fact Collection
interface TenantFacts {
  conditionalAccess: { policies: CAPolicy[]; totalPolicies: number };
  mfa: { registeredUsers: number; totalUsers: number; percentage: number };
  licenses: { hasP2: boolean; hasIntune: boolean; skus: LicenseInfo[] };
  // ... 15+ fact sections
}

async function collectFacts(graphClient: TenantGraphClient): Promise<TenantFacts> {
  const [caPolicies, mfaStatus, licenses] = await Promise.all([
    graphClient.getConditionalAccessPolicies(),
    graphClient.getMfaRegistrationStatus(),
    graphClient.getSubscribedSkus(),
  ]);
  return { conditionalAccess: caPolicies, mfa: mfaStatus, licenses };
}

// Phase 2: Evaluation (pure function, no Graph calls)
function evaluateControl(controlId: string, facts: TenantFacts): AuditFinding {
  // Each evaluator is a pure function: facts in, finding out
  const evaluator = evaluatorRegistry.get(controlId);
  return evaluator(facts);
}
```

### Pattern 3: Hybrid Drift Detection (Polling + Audit Log Monitoring)

**What:** Graph change notifications do NOT support conditional access policies, Intune device configurations, DLP policies, or most security-relevant M365 resources as subscribable resource types. The supported resources are primarily user/group directory objects, mail, calendar, Teams messages, and OneDrive/SharePoint items. Therefore, real-time drift detection for security configurations must use a hybrid approach:

1. **Audit log polling** -- Poll `directoryAudits` via Graph API on a short interval (every 5-15 minutes) filtered to security-relevant activity categories (Policy, RoleManagement, DeviceManagement, etc.)
2. **Graph change notifications for users/groups** -- Subscribe to `/users` and `/groups` changes (supported, max ~29 day subscription lifetime) to detect membership changes to security-critical groups (break-glass, admin groups)
3. **Delta queries** -- Use Graph delta queries for resources that support them to get incremental changes efficiently
4. **Scheduled full re-scans** -- Run full audit evaluations on a configurable schedule (daily/weekly) as the authoritative baseline

**When to use:** This is the only viable approach. Do not design the system assuming real-time webhooks will work for CA policy changes -- they will not.

**Trade-offs:** (+) Actually works with the current Graph API capabilities. (+) Audit log polling catches ALL changes, not just the subset with webhook support. (-) 5-15 minute latency instead of true real-time for policy changes. (-) Audit log polling at scale (many tenants) requires careful throttling management.

**Critical finding:** The PROJECT.md states "Real-time drift via Graph webhooks" as a key decision. This is partially achievable but NOT for the core security configurations (CA policies, Intune, Defender, DLP). The architecture must account for this limitation. Audit log polling is the industry-standard approach used by competitors like Octiga, CoreView, and inforcer.

### Pattern 4: Per-Tenant Database with Connection Routing

**What:** Each client tenant gets its own Azure SQL database within an elastic pool. The API resolves the calling user's target tenant from the request context and routes the database connection accordingly using a shard map or simple connection string lookup.

**When to use:** All data access operations for tenant-specific data (audit results, drift events, remediation history, configuration snapshots).

**Trade-offs:** (+) Strongest possible isolation -- a SQL injection in one tenant's query cannot access another tenant's data. (+) Per-tenant backup, restore, and data deletion are trivial. (+) Elastic pool shares compute costs across tenants. (-) Schema migrations must be applied to every tenant database. (-) Connection pool management at scale (100+ tenants) requires attention. (-) Cost overhead per database, even in elastic pool (minimum DTU allocation).

**Example:**
```typescript
// Tenant database resolver middleware
class TenantDbRouter {
  private connectionCache = new Map<string, ConnectionPool>();

  async getConnection(tenantId: string): Promise<ConnectionPool> {
    if (this.connectionCache.has(tenantId)) {
      return this.connectionCache.get(tenantId)!;
    }

    const tenantRecord = await this.catalogDb.getTenant(tenantId);
    const connString = await this.keyVault.getSecret(
      `tenant-${tenantId}-db-connection`
    );

    const pool = new ConnectionPool(connString);
    this.connectionCache.set(tenantId, pool);
    return pool;
  }
}
```

### Pattern 5: Approval-Gated Remediation Queue

**What:** Remediation actions are classified as "safe" (auto-approvable) or "risky" (requires human approval). All remediation goes through a queue with an approval gate. Safe actions auto-approve after a configurable delay; risky actions require explicit MSP analyst approval before execution.

**When to use:** All remediation actions that modify client tenant configurations.

**Trade-offs:** (+) Prevents accidental lockouts from CA policy changes. (+) Full audit trail of who approved what and when. (+) Delay on safe actions allows cancellation if auto-classification was wrong. (-) Adds latency to remediation; "auto-fix" is not instant. (-) Approval queue management becomes a workflow in itself.

## Data Flow

### Audit Execution Flow

```
MSP Analyst clicks "Run Audit" for Tenant X
    |
    v
[Next.js Frontend] --POST /api/audit/run--> [Core API]
    |                                            |
    |                                  [Auth Middleware]
    |                                  Verify Entra ID token
    |                                  Resolve MSP user + RBAC
    |                                  Verify access to Tenant X
    |                                            |
    |                                  [Tenant Graph Client Factory]
    |                                  Get Graph client for Tenant X
    |                                  (GDAP token from Key Vault)
    |                                            |
    |                                  [Fact Collector]
    |                                  Parallel Graph API calls:
    |                                   - CA policies
    |                                   - MFA registration
    |                                   - Licenses
    |                                   - Devices
    |                                   - Auth methods
    |                                   - Directory roles
    |                                   - etc. (18 sections)
    |                                            |
    |                                  [Evaluator Engine]
    |                                  For each framework:
    |                                   - Load control catalog
    |                                   - Run evaluators vs facts
    |                                   - Score findings
    |                                   - Map to NIST 800-53
    |                                            |
    |                                  [Tenant DB: Tenant X]
    |                                  Store audit results
    |                                  Update compliance score
    |                                  Update historical trend
    |                                            |
    v                                            v
[SignalR push: "audit complete"]    [Return AuditEnvelope JSON]
```

### Drift Detection Flow

```
[Subscription Manager Function] (runs every 4 hours)
    |
    | For each tenant:
    |   - Renew /users subscription (max 29 days)
    |   - Renew /groups subscription (max 29 days)
    |   - Renew /security/alerts subscription (max 30 days)
    v

[Scheduled Audit Log Poller Function] (runs every 5-15 min)
    |
    | For each tenant:
    |   - GET /auditLogs/directoryAudits?$filter=activityDateTime gt {lastPoll}
    |   - Filter for categories: Policy, RoleManagement, UserManagement,
    |     GroupManagement, DeviceManagement, ApplicationManagement
    |   - Classify changes by severity
    |   - Store drift events in tenant DB
    |   - Push high-severity alerts via SignalR
    v

[Webhook Receiver Function] (event-driven, near-real-time)
    |
    | Receives Graph notifications for:
    |   - User changes (new admin? role change?)
    |   - Group membership changes (break-glass group modified?)
    |   - Security alerts (new risky sign-in?)
    |   - OneDrive/SharePoint list changes (sensitivity labels?)
    |
    | Classify change -> store drift event -> push via SignalR
    v

[Full Re-scan Function] (daily/weekly per tenant)
    |
    | Execute complete audit
    | Compare against last known-good baseline
    | Generate diff report
    | Highlight net-new findings since last scan
    v

[Tenant DB] --> [SignalR Hub] --> [Frontend Dashboard]
  Stores all      Pushes drift      Shows red/yellow/green
  drift events    alerts to          per-tenant health
                  connected users
```

### Tenant Onboarding Flow

```
MSP Admin initiates onboarding
    |
    v
[Frontend: Onboarding Wizard]
    |
    | Option A: OAuth Consent        Option B: GDAP
    |   User clicks "Grant Access"     MSP provides GDAP relationship ID
    |   Redirects to Entra ID          API validates via Partner Center
    |   Returns auth code              Retrieves delegated permissions
    |   API exchanges for tokens       Stores GDAP relationship metadata
    |                                  |
    +------ tokens/creds ------>------+
    |
    v
[Core API: Tenant Provisioning]
    1. Store encrypted credentials in Key Vault
    2. Provision new database in elastic pool
    3. Run schema migration on new tenant DB
    4. Execute initial fact collection (validate access works)
    5. Register Graph subscriptions for drift detection
    6. Run first full audit
    7. Store results, calculate initial compliance score
    |
    v
[Tenant appears on MSP Dashboard]
    Compliance score, health status, initial findings
```

### Key Data Flows

1. **Audit execution:** Frontend -> API -> Graph (per-tenant) -> Evaluate -> Tenant DB -> Frontend. The API is the orchestrator; it never exposes Graph tokens to the frontend.
2. **Drift detection:** Graph Audit Logs -> Poller Function -> Classify -> Tenant DB -> SignalR -> Frontend. Audit log polling is the primary channel; Graph webhooks supplement for user/group changes.
3. **Remediation:** Finding -> Remediation Plan -> Approval Queue -> (Auto-approve or Human approve) -> Remediation Worker Function -> Graph API -> Tenant DB (audit trail) -> Frontend notification.
4. **Report generation:** Frontend requests report -> API queues generation -> Report Generator Function -> Reads tenant DB -> Generates PDF/CSV -> Stores in Blob Storage -> Returns download URL.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-20 tenants | Single elastic pool (5-10 eDTU per DB). Single Container App replica. Functions on Consumption plan. Audit log polling on single timer. All fits in a single Azure region. |
| 20-100 tenants | Elastic pool with 200+ eDTUs. 2-3 Container App replicas behind ingress. Batch audit log polling (process 10 tenants per function invocation). Azure SignalR Service standard tier. Consider connection pool limits on API. |
| 100-500 tenants | Multiple elastic pools (Azure SQL supports max 500 DBs per pool). Dedicated Container Apps plan. Premium Functions plan for consistent cold start. Shard audit log polling across multiple timer triggers. Regional deployment for latency-sensitive tenants. |
| 500+ tenants | Stamp-based architecture: each stamp (region) handles a subset of tenants. Independent elastic pools per stamp. Cross-stamp catalog for global view. Graph API throttling becomes primary bottleneck -- implement tenant-aware rate limiting with backoff. |

### Scaling Priorities

1. **First bottleneck: Graph API throttling.** Each tenant audit makes 15-20 Graph API calls. At 100 tenants running daily scans, that is 1,500-2,000 Graph calls per scan window. Graph throttling limits (varies by endpoint, typically 10,000 requests per 10 minutes per app) will be hit during concurrent scans. **Mitigation:** Stagger scans across the day; implement per-tenant rate limiting; use delta queries for incremental scans instead of full collection every time.

2. **Second bottleneck: Audit log polling at scale.** Polling audit logs for 100+ tenants every 5-15 minutes means 100+ Graph API calls per cycle just for drift detection. **Mitigation:** Batch tenant polling into groups of 10-20; implement adaptive polling (poll more frequently for tenants with recent drift events, less for stable tenants); cache last-poll timestamps to avoid re-processing.

3. **Third bottleneck: Database connection pooling.** With per-tenant databases, the API must manage connection pools to potentially hundreds of databases. **Mitigation:** Lazy connection initialization (only connect when tenant is accessed); connection pool size limits per tenant (2-3 connections); connection idle timeout to release unused pools.

## Anti-Patterns

### Anti-Pattern 1: Graph Token in the Frontend

**What people do:** Pass the user's delegated Graph token from the frontend to the API, then use it to query client tenants.
**Why it's wrong:** The user's token is scoped to their own tenant (the MSP tenant), not the client tenants. You cannot use a user's delegated token to read a different tenant's CA policies. Multi-tenant access requires application credentials (GDAP or OAuth app consent) managed server-side.
**Do this instead:** Frontend authenticates the MSP user via Entra ID. The API uses server-side GDAP/OAuth credentials (from Key Vault) to access each client tenant independently. The user never sees client tenant tokens.

### Anti-Pattern 2: Single Shared Database with Tenant Column

**What people do:** Use one database with a `tenant_id` column on every table and rely on row-level security (RLS) or application-level filtering.
**Why it's wrong:** For a security auditing tool, a bug in tenant filtering could expose one client's security vulnerabilities and compliance gaps to another client. The consequences are severe -- you are literally exposing where a tenant is weak. The project constraints explicitly require per-tenant database isolation.
**Do this instead:** Per-tenant databases in an elastic pool. Accept the schema migration overhead. Use elastic jobs to apply migrations across all tenant databases.

### Anti-Pattern 3: Assuming Graph Webhooks for All Drift Detection

**What people do:** Design the architecture around Graph change notifications (webhooks) for all security configuration changes, expecting near-real-time alerts when CA policies, Intune profiles, or DLP rules change.
**Why it's wrong:** Graph change notifications do not support conditional access policies, Intune configurations, DLP policies, Defender settings, or Exchange transport rules as subscribable resources. The supported resources are limited to users, groups, mail, calendar, Teams, OneDrive, SharePoint lists, and security alerts. Building an architecture that depends on webhooks for policy drift will fail at implementation.
**Do this instead:** Use the hybrid approach: audit log polling (directoryAudits API) for security configuration changes + Graph webhooks only for supported resources (users, groups, security alerts) + scheduled full re-scans as authoritative baseline.

### Anti-Pattern 4: Monolithic Audit Function

**What people do:** Put the entire audit pipeline (authentication, fact collection, evaluation, scoring, storage) in a single Azure Function.
**Why it's wrong:** Azure Functions on Consumption plan have a 10-minute execution timeout. A full audit of a large tenant with 18+ fact collection steps can take 2-5 minutes per tenant. Running sequential tenant audits in a single function invocation will timeout. Also, cold starts in PowerShell Functions add 10-30 seconds.
**Do this instead:** Use the Container Apps API for the audit engine (no timeout restrictions, always-warm). Use Azure Functions only for event-driven work (webhook receiver, timer-triggered scan scheduler that calls the API, remediation worker). The scan scheduler Function calls the API's audit endpoint per-tenant, not executing the audit itself.

### Anti-Pattern 5: Storing Graph Tokens in the Database

**What people do:** Store OAuth refresh tokens or GDAP certificates directly in Azure SQL, possibly encrypted at the application level.
**Why it's wrong:** Database backups, query logs, and diagnostic data could expose tokens. Azure Key Vault exists specifically for this purpose and provides hardware-backed encryption, access auditing, and automatic rotation support.
**Do this instead:** Store token references (Key Vault secret names) in the database. Store actual tokens/certificates in Azure Key Vault with managed identity access only. Reference tokens by vault URI, never by value.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Microsoft Graph API (v1.0) | Per-tenant REST client with OAuth bearer tokens; retry with exponential backoff on 429/503 | Conditional Access, directory roles, users, groups, licenses, domains, auth methods, MFA registration -- all v1.0 stable. Subscription expiry for users/groups: ~29 days; must renew. |
| Microsoft Graph API (beta) | Same client, beta base URL | Sensitivity labels, PIM role assignments, some Intune endpoints. Mark beta-dependent features as potentially unstable. |
| Entra ID (authentication) | MSAL.js in frontend for user auth; MSAL Confidential Client in API for app-to-app | Frontend uses authorization code flow with PKCE. API validates tokens and resolves RBAC. |
| Partner Center API | REST client for GDAP relationship management | Used during tenant onboarding to validate GDAP relationship status and retrieve delegated permissions. |
| CISA ScubaGear (GitHub) | HTTP fetch of control catalog from cisagov/ScubaGear repo; cache locally with fallback to built-in defaults | Current implementation already does this in `CisaCatalogFetcher.ps1`. Port to TypeScript for the new API. Cache in catalog DB or blob storage with TTL. |
| Azure SignalR Service | Serverless mode; API sends messages via SignalR management SDK; frontend connects via SignalR client | Used for drift alert push, audit progress notifications. Serverless mode means no persistent hub connection from API -- just REST calls to send messages. |
| Exchange Online PowerShell | Certificate-based app auth via `Connect-ExchangeOnline` | Required to evaluate 37 CISA SCuBA Exchange controls. Cannot use Graph API for mail flow rules, DKIM, transport config. This is a significant integration complexity. |
| Teams Admin PowerShell | Certificate-based auth via `Connect-MicrosoftTeams` | Required for 20 CISA SCuBA Teams controls. Meeting policies, messaging policies, external access. |
| SharePoint Admin (PnP.PowerShell) | Certificate-based app auth via `Connect-PnPOnline` | Required for 8 CISA SCuBA SharePoint controls. Sharing policies, access control. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Frontend <-> Core API | REST over HTTPS + SignalR over WebSocket | API is the single gateway; frontend never talks to Functions, DB, or Key Vault directly. |
| Core API <-> Functions | HTTP calls (API -> Functions for on-demand triggers) and Azure Storage Queue (Functions -> API results) | Functions are fire-and-forget workers; they write results to tenant DB or queue, not back to the API synchronously. |
| Core API <-> Catalog DB | Direct SQL connection via managed identity | Always-available connection pool; small database with low query volume. |
| Core API <-> Tenant DBs | Routed SQL connection via tenant resolver; pooled with lazy initialization | Connection string per-tenant from Key Vault; pool size limited per tenant. |
| Functions <-> Graph API | Same tenant-scoped client pattern as Core API; shared `graph-helpers` package | Functions must use the same token management logic as the API; shared code prevents divergence. |
| Functions <-> Key Vault | Managed identity access for token retrieval | Functions have their own managed identity; Key Vault access policy grants read-only to both API and Functions identities. |
| Functions <-> Tenant DBs | Direct SQL connection for writing drift events and reading tenant configs | Functions share the same connection routing logic via shared package. |

## Build Order (Dependency Chain)

The architecture has clear dependency layers that dictate build order:

```
Layer 1: Foundation (no dependencies)
  - Infra: Elastic pool, Key Vault, Container Apps environment, Function App, SignalR
  - Catalog DB schema (tenant registry, RBAC, framework definitions)
  - Shared packages: types, graph-helpers

Layer 2: Core Services (depends on Layer 1)
  - Auth middleware (Entra ID token validation, RBAC)
  - Tenant management service (onboarding, DB provisioning)
  - Tenant Graph Client Factory (Key Vault token retrieval)

Layer 3: Audit Engine (depends on Layer 2)
  - Fact Collector (port existing TenantFactCollector.ps1 to TypeScript)
  - Framework evaluators (port existing CISA + NIST evaluators)
  - Audit orchestrator (run collection + evaluation + store results)

Layer 4: Dashboard & Visualization (depends on Layer 3)
  - Multi-tenant dashboard (tenant grid, health scores)
  - Audit results drill-down (tenant -> category -> finding)
  - Historical trending

Layer 5: Drift Detection (depends on Layers 2 + 3)
  - Audit log poller Function
  - Graph subscription manager Function
  - Webhook receiver Function
  - Drift classification engine
  - SignalR push to frontend

Layer 6: Remediation (depends on Layers 3 + 5)
  - Remediation plan generator (from findings)
  - Approval queue + workflow
  - Remediation executor Function
  - Audit trail logging

Layer 7: Reporting & Polish (depends on all above)
  - PDF/CSV report generation
  - Compliance attestation documents
  - Extended framework coverage (Exchange, Teams, SharePoint evaluators)
```

## Sources

- [Microsoft Graph Change Notifications Overview](https://learn.microsoft.com/en-us/graph/change-notifications-overview) -- HIGH confidence. Authoritative list of supported resources for webhooks. Confirmed that CA policies, Intune, DLP are NOT in the supported resource list.
- [Subscription Resource Type - Expiration Limits](https://learn.microsoft.com/en-us/graph/api/resources/subscription?view=graph-rest-1.0) -- HIGH confidence. User/group subscriptions max ~29 days; security alerts max ~30 days.
- [Multitenancy and Azure SQL Database](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/service/sql-database) -- HIGH confidence. Microsoft's official architecture guidance for database-per-tenant with elastic pools.
- [Multitenant SaaS Database Tenancy Patterns](https://learn.microsoft.com/en-us/azure/azure-sql/database/saas-tenancy-app-design-patterns?view=azuresql) -- HIGH confidence. Elastic pool patterns, shard management, schema migration strategies.
- [GDAP API Overview](https://learn.microsoft.com/en-us/graph/api/resources/delegatedadminrelationships-api-overview?view=graph-rest-1.0) -- HIGH confidence. Partner Center GDAP relationship management via Graph.
- [Azure SignalR Service Internals](https://learn.microsoft.com/en-us/azure/azure-signalr/signalr-concept-internals) -- HIGH confidence. Serverless mode architecture for push notifications without persistent hub connections.
- [CISA ScubaGear GitHub](https://github.com/cisagov/ScubaGear) -- HIGH confidence. Three-phase architecture: collect -> evaluate (OPA/Rego) -> report. Design validated by CISA for M365 assessment.
- [CISA ScubaConnect GitHub](https://github.com/cisagov/ScubaConnect) -- MEDIUM confidence. Multi-tenant orchestration for ScubaGear. Cloud-native infrastructure for automated multi-tenant assessment.
- [Troubleshoot CA Policy Changes via Audit Log](https://learn.microsoft.com/en-us/entra/identity/conditional-access/troubleshoot-policy-changes-audit-log) -- HIGH confidence. Confirms audit logs as the mechanism for detecting CA policy changes.
- [GDAP Multi-Tenant Automation](https://tminus365.com/gdap-multi-tenant-automation/) -- MEDIUM confidence. Practical MSP patterns for GDAP token management.
- [CoreView M365 Governance](https://www.coreview.com/) -- MEDIUM confidence (competitor analysis). Forensic audit trail, configuration change detection, security scoring.
- [Octiga M365 Security Monitoring](https://www.octiga.io/) -- MEDIUM confidence (competitor analysis). Living security audit, incident-level alerts.
- [inforcer M365 Policy Management](https://www.inforcer.com/) -- MEDIUM confidence (competitor analysis). Cross-tenant policy standardization, drift detection, auto-remediation.
- [Microsoft Graph Webhooks - Best Practices (Voitanos)](https://www.voitanos.io/blog/microsoft-graph-webhook-delta-query/) -- MEDIUM confidence. Practical guidance on webhook + delta query combination.

---
*Architecture research for: Multi-tenant M365 Zero Trust Security Auditing Platform*
*Researched: 2026-03-10*
