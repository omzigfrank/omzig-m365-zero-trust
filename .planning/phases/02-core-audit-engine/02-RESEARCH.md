# Phase 2: Core Audit Engine - Research

**Researched:** 2026-03-11
**Domain:** Microsoft Graph API audit pipeline, TypeScript evaluators, Azure SignalR real-time progress, Drizzle ORM per-tenant storage
**Confidence:** HIGH

## Summary

Phase 2 builds the collect-then-evaluate audit pipeline that collects M365 tenant configuration via Microsoft Graph API, evaluates it against 29 CISA SCuBA Entra ID controls, persists results in per-tenant databases, and pushes real-time progress via Azure SignalR. The architecture ports proven PowerShell evaluator logic (already implemented in `scripts/audit/CisaEvaluatorRegistry.ps1`) to TypeScript, using the Microsoft Graph JavaScript SDK for API calls with $batch optimization.

The codebase already contains the complete evaluator logic for all 29 Entra ID controls (16 AAD evaluators in CisaEvaluatorRegistry.ps1 + the remaining mapped as defaults in CisaCatalogFetcher.ps1), a comprehensive fact collector covering 15 Graph API data areas (TenantFactCollector.ps1), and a working orchestration pattern (Run-Audit/run.ps1). The existing per-tenant DB infrastructure (Drizzle ORM, elastic pool, tenant middleware) is proven from Phase 1. SignalR is already provisioned in serverless mode via Bicep. The primary work is: (1) port PowerShell to TypeScript, (2) extend the tenant DB schema, (3) add API routes, (4) integrate SignalR progress, (5) update the frontend hook.

**Primary recommendation:** Port evaluators 1:1 from PowerShell to TypeScript. Use `@microsoft/microsoft-graph-client` with `BatchRequestContent` for fact collection. Use Azure SignalR REST API directly (no SDK needed for server-to-client push). Extend the existing `auditRuns` stub table and add `auditFindings` table via Drizzle migration.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Hybrid approach: TypeScript for fact collection (Graph API calls via Microsoft Graph SDK) and evaluator logic (ported from PowerShell). PowerShell Azure Functions kept as fallback for v2 workloads (Exchange, Teams, SharePoint, Defender) that require PowerShell-only modules.
- Direct port of existing PowerShell evaluator logic to TypeScript -- same control IDs, same pass/fail conditions. Proven logic, no interpretation divergence.
- Collect-all-first pipeline (AUDIT-04): single pass fetches all tenant configuration into a facts object, then all evaluators run against that snapshot. Fewer Graph API calls, easier caching/retry.
- Product-aware directory structure: organize evaluators by product (entra-id/, exchange/, teams/) from the start. Phase 2 only implements entra-id/ but the pattern is extensible for v2 products.
- Full detail per finding: control ID, rating (pass/fail/warn/na), severity (Critical/High/Medium/Low), affected setting name, current value, expected value, message, remediation action. Covers AUDIT-03 and AUDIT-06.
- Relational storage: auditRuns table (one row per scan) + auditFindings table (one row per check result, FK to auditRuns). Clean model for querying historical results per control.
- Static TypeScript control registry: control definitions (ID, description, requirement level, severity, NIST 800-53 cross-ref) defined as TypeScript objects in the codebase. Versioned with code, no DB migration needed to add/update controls.
- Denormalize control metadata into findings rows: each finding stores control ID, description, severity, requirement level. Historical findings remain accurate even if control definitions change in future code deploys.
- Real-time progress via SignalR: push updates as each check completes -- "12/29 checks complete -- Evaluating MS.AAD.3.1v1 (MFA requirement)..."
- Count + current check name format: shows numeric progress and what's actively running.
- Asynchronous execution: POST /api/audits returns 202 with audit ID immediately. Backend runs checks, pushes progress via SignalR, marks complete when done. Non-blocking, scalable.
- Individual check retry: users can retry specific failed checks (e.g., permission errors) without re-running the entire audit. Results update in-place on the existing audit run.
- Delegated token approach: during onboarding (Phase 4), client admin consents to Graph scopes. Platform stores refresh token (encrypted in Key Vault via envelope encryption from Phase 1) and uses it for audit calls.
- All read scopes requested upfront: request broad read permissions at onboarding covering all future products (Exchange, Teams, SharePoint). User consents once, avoids re-consent when v2 products arrive.
- Per-check permission mapping: each failed finding shows which Graph permission it needed. Summary shows "3 checks failed due to missing Policy.Read.All". User sees exactly what to fix.
- Auto-refresh with fallback: attempt silent token refresh using stored refresh token. If refresh fails (revoked, consent withdrawn), mark tenant as "needs re-authorization" and notify admin.
- Track and throttle Graph API rate limits: monitor request count vs limits during audit. If approaching 80%, slow down check execution with backoff. Log consumption per audit run.
- Microsoft Graph SDK (@microsoft/microsoft-graph-client) for all Graph API calls. Official SDK with built-in auth, batching, pagination, and retry. Type-safe models via @microsoft/microsoft-graph-types.
- Batch requests where possible ($batch endpoint, up to 20 per batch) to reduce HTTP round-trips during fact collection.

### Claude's Discretion
- Exact TypeScript evaluator file organization within the product directories
- Graph API error handling and retry backoff strategy
- SignalR hub naming and message format
- Audit run status state machine transitions
- Test structure and mocking approach for Graph API calls

### Deferred Ideas (OUT OF SCOPE)
- NIST 800-207 / 800-53 / CSF 2.0 evaluators -- Phase 3 (Compliance Framework Mapping)
- Tenant onboarding and OAuth consent flow -- Phase 4 (Tenant Onboarding)
- Dashboard drill-down and filtering -- Phase 5 (Dashboard and Findings UX)
- Scheduled automated scans -- Phase 6 (Scheduling, Reporting and Trending)
- Config snapshots for drift comparison -- Phase 8 (Drift Detection)
- v2 product evaluators (Exchange, Teams, SharePoint, Defender) -- v2 via PowerShell Azure Functions sidecar

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUDIT-01 | User can trigger an on-demand audit scan of a connected M365 tenant | POST /api/tenants/:tenantId/audits route, async execution with 202 response, audit run creation in tenant DB |
| AUDIT-02 | Audit engine evaluates all 29 CISA SCuBA Entra ID controls via Graph API | 16 evaluator functions ported from CisaEvaluatorRegistry.ps1 + 13 remaining AAD controls from CisaCatalogFetcher.ps1 defaults. All use Graph API v1.0 endpoints. |
| AUDIT-03 | Each finding shows pass/fail status with severity level (Critical/High/Medium/Low) | auditFindings table with rating and severity columns; static control registry maps each control ID to severity |
| AUDIT-04 | Audit engine collects tenant configuration state before evaluating (collect-then-evaluate pipeline) | TenantFactCollector.ps1 pattern ported to TypeScript; 15 Graph API data areas collected into single facts object before evaluators run |
| AUDIT-05 | Audit results are stored per tenant for historical reference | auditRuns + auditFindings tables in per-tenant database via Drizzle ORM; existing tenant middleware provides DB connection |
| AUDIT-06 | User can view detailed finding information including affected setting, current value, expected value | auditFindings table stores settingName, currentValue, expectedValue columns; evaluators populate these from facts |
| FRAME-01 | Each finding maps to its CISA SCuBA control ID with SHALL/SHOULD/MAY requirement level | Static control registry stores controlId, requirementLevel; denormalized into each finding row |
| AUTH-06 | Graph API permissions per tenant are scoped to minimum required for audit (read-only by default) | Delegated token with read-only scopes; per-check permission mapping enables transparent permission failure reporting |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @microsoft/microsoft-graph-client | ^3.0.7 | Graph API calls with auth, batching, pagination, retry | Official Microsoft SDK. BatchRequestContent/BatchResponseContent for $batch. Built-in auth providers. |
| @microsoft/microsoft-graph-types | latest | TypeScript type definitions for Graph API v1.0 entities | Official types for ConditionalAccessPolicy, Organization, Domain, etc. Intellisense for all evaluator code. |
| drizzle-orm | beta | Per-tenant database ORM (mssql-core) | Already in use from Phase 1. Required for mssqlTable, migrations, query builder. |
| hono | ^4.0.0 | API framework for audit routes | Already in use from Phase 1. Middleware chain (auth, tenant) already established. |
| zod | ^3.23.0 | Request/response validation for audit API | Already in use from Phase 1. Validate audit trigger requests, retry requests. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @microsoft/microsoft-graph-types-beta | latest | Beta Graph API types (PIM role eligibility endpoints) | Only for beta endpoints used in PIM/role evaluators (MS.AAD.7.2v1) |
| @microsoft/signalr | latest | Client-side SignalR connection (frontend) | Frontend only -- for receiving real-time audit progress updates |
| jsonwebtoken | ^9.0.0 | Generate JWT for SignalR REST API auth | Server-side only -- sign JWTs with SignalR AccessKey to push messages via REST API |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @microsoft/microsoft-graph-client | Raw fetch to Graph API | Lose built-in retry, pagination, auth provider, batch support. Not worth it. |
| SignalR REST API (direct) | @azure/web-pubsub SDK | Web PubSub is a different Azure service. SignalR is already provisioned. REST API is simple for server-push. |
| Static TypeScript registry | DB-stored control catalog | DB adds migration friction per control update. Static TypeScript objects version with code, type-safe, zero I/O. |

**Installation:**
```bash
pnpm add @microsoft/microsoft-graph-client @microsoft/microsoft-graph-types @microsoft/microsoft-graph-types-beta jsonwebtoken --filter @omzig/api
pnpm add -D @types/jsonwebtoken --filter @omzig/api
pnpm add @microsoft/signalr --filter web
```

## Architecture Patterns

### Recommended Project Structure
```
packages/audit/
  src/
    index.ts                       # Public API: runAudit(), retryCheck()
    types.ts                       # AuditFacts, EvaluatorResult, ControlDefinition, etc.
    registry/
      control-registry.ts          # Static array of all ControlDefinition objects
      entra-id-controls.ts         # 29 CISA SCuBA Entra ID control definitions
    collectors/
      fact-collector.ts            # Orchestrates all data area collectors
      graph-client.ts              # Graph SDK client factory (delegated token auth)
      batch-helper.ts              # $batch request grouping and execution
      areas/
        conditional-access.ts      # CA policies, named locations
        authentication-methods.ts  # Auth methods policy, MFA registration
        authorization-policy.ts    # User defaults, guest settings, admin consent
        directory-roles.ts         # Global admin count, role assignments
        devices.ts                 # Managed devices, compliance state
        licenses.ts                # Subscribed SKUs, feature flags
        domains.ts                 # Verified domains, password policy
        organization.ts            # Tenant info
        security-defaults.ts       # Security defaults state
        pim-roles.ts               # PIM eligibility (beta endpoint)
        app-registrations.ts       # Application count
        sensitivity-labels.ts      # Information protection labels
    evaluators/
      entra-id/
        aad-1-legacy-auth.ts       # MS.AAD.1.1v1
        aad-2-risk-policies.ts     # MS.AAD.2.1v1, MS.AAD.2.3v1
        aad-3-mfa.ts               # MS.AAD.3.1v1 through MS.AAD.3.8v1
        aad-4-logging.ts           # MS.AAD.4.1v1
        aad-5-applications.ts      # MS.AAD.5.1v1 through MS.AAD.5.4v1
        aad-6-passwords.ts         # MS.AAD.6.1v1
        aad-7-privileged-roles.ts  # MS.AAD.7.1v1 through MS.AAD.7.9v1
        aad-8-guest-access.ts      # MS.AAD.8.1v1 through MS.AAD.8.3v1
        index.ts                   # Re-exports all entra-id evaluators
      types.ts                     # Evaluator function signature type
    pipeline/
      audit-runner.ts              # Main pipeline: collect -> evaluate -> persist
      progress-emitter.ts          # SignalR progress push
      rate-limiter.ts              # Graph API rate limit tracker
      token-manager.ts             # Delegated token refresh logic

apps/api/src/
  routes/
    audits.ts                      # POST /api/tenants/:tenantId/audits, GET, retry
  services/
    signalr.ts                     # SignalR REST API client (JWT signing, push)
```

### Pattern 1: Evaluator Function Signature
**What:** Each evaluator is a pure function that takes a facts snapshot and returns a structured result.
**When to use:** Every CISA SCuBA control check.
**Example:**
```typescript
// Source: Direct port from CisaEvaluatorRegistry.ps1
import type { AuditFacts } from '../types';

export interface EvaluatorResult {
  rating: 'pass' | 'fail' | 'warn' | 'na';
  message: string;
  action?: string;
  settingName?: string;
  currentValue?: string;
  expectedValue?: string;
  requiredPermission?: string;
}

export type EvaluatorFn = (facts: AuditFacts) => EvaluatorResult;

// Example evaluator: MS.AAD.1.1v1 - Legacy authentication SHALL be blocked
export const evaluateAAD_1_1: EvaluatorFn = (facts) => {
  if (!facts.conditionalAccess.available) {
    return {
      rating: 'fail',
      message: 'Could not retrieve CA policies.',
      requiredPermission: 'Policy.Read.All',
    };
  }

  const legacyBlock = facts.conditionalAccess.policies.some((pol) => {
    if (pol.state === 'disabled') return false;
    const hasLegacy = pol.conditions?.clientAppTypes?.some(
      (t) => t === 'exchangeActiveSync' || t === 'other',
    );
    const blocks = pol.grantControls?.builtInControls?.includes('block');
    return hasLegacy && blocks;
  });

  if (legacyBlock) {
    return {
      rating: 'pass',
      message: 'A CA policy blocks legacy authentication.',
      settingName: 'Legacy Auth CA Policy',
      currentValue: 'Blocked',
      expectedValue: 'Blocked',
    };
  }

  return {
    rating: 'fail',
    message: 'No CA policy found that blocks legacy authentication.',
    action: 'Create a CA policy targeting legacy client app types with a Block grant control.',
    settingName: 'Legacy Auth CA Policy',
    currentValue: 'Not blocked',
    expectedValue: 'Blocked',
  };
};
```

### Pattern 2: Collect-All-First Pipeline
**What:** All Graph API data is collected into a single typed `AuditFacts` object before any evaluators run.
**When to use:** Every audit execution.
**Example:**
```typescript
// Source: Port of TenantFactCollector.ps1 pattern
export interface AuditFacts {
  organization: { available: boolean; tenantId?: string; displayName?: string; primaryDomain?: string; error?: string };
  conditionalAccess: { available: boolean; policies: ConditionalAccessPolicy[]; totalPolicies: number; error?: string };
  namedLocations: { available: boolean; locations: NamedLocation[]; error?: string };
  mfa: { available: boolean; totalUsers: number; registeredUsers: number; percentage: number; error?: string };
  authMethods: { available: boolean; migrationState?: string; smsEnabled: boolean; voiceEnabled: boolean; error?: string };
  authorizationPolicy: { available: boolean; defaultUserRoleAllowedToCreateApps: boolean; allowInvitesFrom?: string; guestUserRoleId?: string; error?: string };
  adminConsentPolicy: { available: boolean; enabled: boolean; error?: string };
  passwordPolicy: { available: boolean; passwordValidityPeriodInDays?: number; error?: string };
  adminRoles: { available: boolean; globalAdminCount: number; error?: string };
  roleAssignments: { available: boolean; totalAssignments: number; eligibleAssignments: number; error?: string };
  devices: { available: boolean; totalDevices: number; compliantDevices: number; error?: string };
  licenses: { available: boolean; hasQualifyingSku: boolean; hasP2: boolean; hasDefenderO365: boolean; licenses: LicenseInfo[]; error?: string };
  securityDefaults: { available: boolean; enabled: boolean; error?: string };
  domains: { available: boolean; totalDomains: number; customDomainCount: number; error?: string };
  appRegistrations: { available: boolean; totalApps: number; error?: string };
  sensitivityLabels: { available: boolean; totalLabels: number; error?: string };
}

async function collectFacts(graphClient: Client, progressFn: (msg: string) => void): Promise<AuditFacts> {
  const facts = createEmptyFacts();

  // Batch 1: Independent endpoints (up to 20 per batch)
  progressFn('Collecting tenant configuration...');
  const batch1Results = await executeBatch(graphClient, [
    { id: 'org', url: '/organization?$select=id,displayName,verifiedDomains' },
    { id: 'caPolicies', url: '/identity/conditionalAccess/policies?$select=id,displayName,state,conditions,grantControls,sessionControls&$top=100' },
    { id: 'namedLocations', url: '/identity/conditionalAccess/namedLocations?$select=id,displayName,isTrusted&$top=100' },
    { id: 'subscribedSkus', url: '/subscribedSkus' },
    { id: 'secDefaults', url: '/policies/identitySecurityDefaultsEnforcementPolicy' },
    { id: 'domains', url: '/domains?$select=id,isDefault,isVerified,passwordValidityPeriodInDays,passwordNotificationWindowInDays' },
    { id: 'authMethodsPolicy', url: '/policies/authenticationMethodsPolicy' },
    { id: 'authzPolicy', url: '/policies/authorizationPolicy' },
    { id: 'consentPolicy', url: '/policies/adminConsentRequestPolicy' },
    { id: 'directoryRoles', url: '/directoryRoles?$select=id,displayName&$top=100' },
    { id: 'apps', url: '/applications?$top=1&$count=true&$select=id' },
    { id: 'sensitivityLabels', url: '/security/informationProtection/sensitivityLabels?$top=100&$select=id,name' },
  ]);

  // Parse batch1 results into facts...

  // Batch 2: Dependent calls (need results from batch 1)
  // e.g., Global Admin members (need role ID from batch 1)
  // MFA registration details, PIM role assignments, devices
  progressFn('Collecting user and device data...');
  // ...

  return facts;
}
```

### Pattern 3: Async Audit Execution with SignalR Progress
**What:** POST returns 202 immediately, backend runs audit asynchronously, pushes progress via SignalR REST API.
**When to use:** Every audit trigger.
**Example:**
```typescript
// Route handler
app.post('/api/tenants/:tenantId/audits', withTenantDb(), async (c) => {
  const tenantId = c.req.param('tenantId');
  const auditId = crypto.randomUUID();
  const triggeredBy = (c.get('jwtPayload') as any).oid;
  const tenantDb = c.get('tenantDb');

  // Insert pending audit run
  await tenantDb.insert(auditRuns).values({
    id: auditId,
    tenantId,
    triggeredBy,
    status: 'running',
    startedAt: new Date(),
    totalChecks: 29,
  });

  // Fire-and-forget: run audit in background
  // (using setImmediate or similar to not block response)
  runAuditPipeline(auditId, tenantId, tenantDb).catch(console.error);

  return c.json({ data: { auditId, status: 'running' } }, 202);
});
```

### Pattern 4: SignalR REST API Push (Serverless Mode)
**What:** Server pushes progress messages to connected clients via Azure SignalR REST API.
**When to use:** During audit execution for real-time progress updates.
**Example:**
```typescript
// Source: Azure SignalR data-plane REST API v1
// POST /api/v1/hubs/{hub}/users/{userId}
// Auth: JWT signed with SignalR AccessKey (HS256)

import jwt from 'jsonwebtoken';

async function pushProgress(userId: string, message: AuditProgressMessage): Promise<void> {
  const hubName = 'audit';
  const endpoint = process.env.SIGNALR_ENDPOINT; // e.g., https://sigr-omzig-dev.service.signalr.net
  const accessKey = process.env.SIGNALR_ACCESS_KEY;

  const url = `${endpoint}/api/v1/hubs/${hubName}/users/${userId}`;

  const token = jwt.sign({}, accessKey, {
    audience: url,
    expiresIn: '5m',
    algorithm: 'HS256',
  });

  await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      target: 'auditProgress',
      arguments: [message],
    }),
  });
}

interface AuditProgressMessage {
  auditId: string;
  tenantId: string;
  completed: number;
  total: number;
  currentCheck: string;
  status: 'running' | 'complete' | 'error';
}
```

### Pattern 5: Static Control Registry
**What:** Control definitions as TypeScript objects, not DB rows.
**When to use:** Defining control metadata (ID, description, severity, requirement level).
**Example:**
```typescript
export interface ControlDefinition {
  id: string;                    // e.g., 'MS.AAD.1.1v1'
  product: string;               // e.g., 'AAD'
  description: string;           // Human-readable description
  requirementLevel: 'SHALL' | 'SHALL NOT' | 'SHOULD' | 'SHOULD NOT' | 'MAY';
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  nist80053: string;             // e.g., 'AC-7'
  evaluator: EvaluatorFn;        // The actual check function
  requiredPermissions: string[];  // Graph permissions needed
}

// entra-id-controls.ts
export const ENTRA_ID_CONTROLS: ControlDefinition[] = [
  {
    id: 'MS.AAD.1.1v1',
    product: 'AAD',
    description: 'Legacy authentication SHALL be blocked.',
    requirementLevel: 'SHALL',
    severity: 'Critical',
    nist80053: 'AC-7',
    evaluator: evaluateAAD_1_1,
    requiredPermissions: ['Policy.Read.All'],
  },
  // ... 28 more
];
```

### Anti-Patterns to Avoid
- **Interleaved collection and evaluation:** Do NOT call Graph API inside evaluators. Collect all facts first, then evaluate. This is the proven ScubaGear pattern and the locked decision.
- **Storing control definitions in the database:** Static TypeScript objects are type-safe, version with code, and require zero I/O. DB storage adds migration friction for every control update.
- **Synchronous audit execution:** Audits take 10-30 seconds depending on tenant size. Synchronous execution blocks the HTTP connection. Use 202 + SignalR progress.
- **Using Application permissions for audit:** Delegated permissions are the locked decision. Application permissions require admin-only consent and grant broader access than needed.
- **Hardcoding Graph API URLs:** Use the Graph SDK client methods where possible. For $batch requests, construct Request objects with relative URLs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Graph API authentication | Custom token management | `@microsoft/microsoft-graph-client` AuthProvider | SDK handles token injection, refresh token flow, error handling |
| Graph API pagination | Manual @odata.nextLink following | SDK PageIterator or manual iteration with batch | Edge cases with empty pages, delta links, throttling |
| Graph API batching | Custom $batch POST construction | `BatchRequestContent` / `BatchResponseContent` classes | SDK handles 20-per-batch limit splitting, response correlation by ID |
| Graph API retry/throttle | Custom 429 handler | SDK middleware pipeline with RetryHandler | Built-in exponential backoff, Retry-After header respect |
| SignalR client connection | Custom WebSocket management | `@microsoft/signalr` HubConnectionBuilder | Auto-reconnect, transport negotiation, hub protocol |
| UUID generation | Custom ID generation | `crypto.randomUUID()` | Native Node.js, RFC 4122 compliant, no dependency |

**Key insight:** The Microsoft Graph SDK already handles authentication, retry, pagination, and batching. Rolling custom solutions would miss edge cases around throttling (429 with Retry-After), pagination (empty pages, $count inconsistencies), and auth token refresh timing.

## Common Pitfalls

### Pitfall 1: Graph API $batch Response Status Codes
**What goes wrong:** Developers check only the outer $batch response (always 200) and miss per-request failures inside the batch.
**Why it happens:** $batch always returns HTTP 200 at the batch level. Individual requests inside the batch can fail with 401, 403, 404, 429, etc.
**How to avoid:** Always check `BatchResponseContent.getResponseById(id)` status code for EACH request in the batch. If status >= 400, treat that data area as unavailable in facts.
**Warning signs:** Evaluators returning "pass" when data was actually not retrieved (facts area shows `available: true` incorrectly).

### Pitfall 2: PIM Endpoints Require Entra ID P2
**What goes wrong:** PIM role eligibility/assignment endpoints return 403 for tenants without Entra ID P2 licensing.
**Why it happens:** MS.AAD.7.2v1 (PIM assignments) uses `/roleManagement/directory/roleEligibilityScheduleInstances` which requires P2.
**How to avoid:** Wrap PIM-specific calls in try/catch. If 403/404, set `facts.roleAssignments.available = false` and mark PIM evaluators as `na` with a message about P2 requirement. The PowerShell evaluators already handle this pattern.
**Warning signs:** Audit fails entirely because one batch request fails and crashes the pipeline.

### Pitfall 3: Sensitivity Labels Beta Endpoint
**What goes wrong:** The sensitivity labels endpoint is on the `beta` API version, not v1.0.
**Why it happens:** `/security/informationProtection/sensitivityLabels` exists only in beta Graph API.
**How to avoid:** Use `beta` version for this specific call. Cannot be batched with v1.0 requests (different base URL). Make it a standalone call outside the main batch.
**Warning signs:** 404 error from Graph API when using v1.0 base URL for sensitivity labels.

### Pitfall 4: Async Execution and Tenant DB Connection Lifetime
**What goes wrong:** The tenant DB connection opened in middleware gets closed in the `finally` block BEFORE the async audit pipeline completes.
**Why it happens:** The `withTenantDb()` middleware opens a connection per-request and closes it when the handler returns. But the audit runs asynchronously after the 202 response.
**How to avoid:** The async audit pipeline must open its OWN tenant DB connection using `getTenantDb(databaseName)` and close it when done. Do NOT use the middleware-provided `tenantDb` for async work. Pass `databaseName` to the background task, not the DB instance.
**Warning signs:** SQL connection errors during audit execution, "connection pool closed" errors.

### Pitfall 5: Graph API Report Endpoints Require Specific Permissions
**What goes wrong:** MFA registration details endpoint (`/reports/authenticationMethods/userRegistrationDetails`) requires `UserAuthenticationMethod.Read.All`, which is a separate permission from `Policy.Read.All`.
**Why it happens:** Different Graph API resource types require different permission scopes. Missing any one scope causes a 403 for that specific endpoint.
**How to avoid:** Map every Graph API endpoint to its required permission. Use per-check permission mapping (locked decision) so users see exactly which scope is missing.
**Warning signs:** 403 errors on specific data areas that worked in testing but fail in production tenants with different consent.

### Pitfall 6: Authorization Policy Returns Object, Not Collection
**What goes wrong:** `/policies/authorizationPolicy` returns a single object, not a `{ value: [...] }` collection.
**Why it happens:** Some Graph API endpoints return singleton resources instead of collections. Standard Graph SDK collection handling doesn't apply.
**How to avoid:** Handle each response type correctly in the batch response parsing. Check if the response is a collection (has `value` array) or a singleton object.
**Warning signs:** "Cannot read property 'value' of undefined" errors when parsing authorization policy response.

### Pitfall 7: MFA Registration Data Pagination
**What goes wrong:** `userRegistrationDetails` can return thousands of rows for large tenants, but $batch doesn't support pagination within batch responses.
**Why it happens:** Large tenants have many users. The endpoint returns paginated results with @odata.nextLink.
**How to avoid:** Exclude MFA registration from $batch requests. Make it a standalone paginated call using the Graph SDK PageIterator or manual @odata.nextLink following. Set a reasonable $top (e.g., 999) and follow all pages.
**Warning signs:** MFA percentage shows 0% or incorrect numbers because only the first page of results was processed.

## Code Examples

### Graph SDK Client Factory with Delegated Token
```typescript
// Source: @microsoft/microsoft-graph-client documentation
import { Client } from '@microsoft/microsoft-graph-client';

function createGraphClient(accessToken: string): Client {
  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });
}
```

### $batch Request Execution
```typescript
// Source: Microsoft Learn - Batch requests with SDKs
import {
  BatchRequestContent,
  BatchRequestStep,
  BatchResponseContent,
} from '@microsoft/microsoft-graph-client';

async function executeBatch(
  client: Client,
  requests: Array<{ id: string; url: string; method?: string }>
): Promise<Map<string, any>> {
  const steps: BatchRequestStep[] = requests.map((req) => ({
    id: req.id,
    request: new Request(`https://graph.microsoft.com/v1.0${req.url}`, {
      method: req.method ?? 'GET',
    }),
  }));

  const batchContent = new BatchRequestContent(steps);
  const content = await batchContent.getContent();

  const batchResponse = await client.api('/$batch').post(content);
  const responseContent = new BatchResponseContent(batchResponse);

  const results = new Map<string, any>();
  for (const req of requests) {
    const response = responseContent.getResponseById(req.id);
    if (response.ok) {
      results.set(req.id, await response.json());
    } else {
      results.set(req.id, { error: true, status: response.status });
    }
  }

  return results;
}
```

### Drizzle ORM auditFindings Table Definition
```typescript
// Source: Existing project patterns (drizzle-orm@beta, mssql-core)
import { sql } from 'drizzle-orm';
import {
  mssqlTable,
  varchar,
  nvarchar,
  int,
  datetime2,
} from 'drizzle-orm/mssql-core';

export const auditFindings = mssqlTable('audit_findings', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  auditRunId: varchar('audit_run_id', { length: 36 }).notNull(),
  controlId: varchar('control_id', { length: 30 }).notNull(),       // e.g., 'MS.AAD.1.1v1'
  product: varchar('product', { length: 20 }).notNull(),             // e.g., 'AAD'
  description: nvarchar('description', { length: 500 }).notNull(),
  requirementLevel: varchar('requirement_level', { length: 15 }).notNull(), // SHALL/SHOULD/MAY
  severity: varchar('severity', { length: 10 }).notNull(),           // Critical/High/Medium/Low
  rating: varchar('rating', { length: 10 }).notNull(),               // pass/fail/warn/na
  message: nvarchar('message', { length: 2000 }).notNull(),
  action: nvarchar('action', { length: 2000 }),
  settingName: nvarchar('setting_name', { length: 200 }),
  currentValue: nvarchar('current_value', { length: 1000 }),
  expectedValue: nvarchar('expected_value', { length: 1000 }),
  requiredPermission: varchar('required_permission', { length: 100 }),
  nist80053: varchar('nist_800_53', { length: 50 }),
  createdAt: datetime2('created_at').notNull().default(sql`GETDATE()`),
});
```

### Audit Run Status State Machine
```typescript
// Recommended state transitions:
// pending -> running -> completed | failed
// Individual findings: can be retried -> updates in-place

type AuditRunStatus = 'pending' | 'running' | 'completed' | 'failed';

// Status transitions:
// 1. POST /audits -> creates run with status 'pending'
// 2. Pipeline starts -> update to 'running', set startedAt
// 3. All checks complete -> update to 'completed', set completedAt, update counts
// 4. Pipeline crashes -> update to 'failed', set completedAt, store error in summary

// Individual check retry:
// POST /audits/:auditId/checks/:controlId/retry
// -> Re-runs single evaluator with fresh facts for that data area
// -> Updates the existing finding row (upsert by auditRunId + controlId)
// -> Recalculates audit run summary counts
```

### SignalR Negotiate Endpoint (Frontend Connection)
```typescript
// API route: GET /api/signalr/negotiate
// Returns connection info for frontend @microsoft/signalr client

app.get('/api/signalr/negotiate', async (c) => {
  const userId = (c.get('jwtPayload') as any).oid;
  const endpoint = process.env.SIGNALR_ENDPOINT;
  const accessKey = process.env.SIGNALR_ACCESS_KEY;
  const hubName = 'audit';

  const hubUrl = `${endpoint}/client/?hub=${hubName}`;

  const token = jwt.sign(
    { 'nameid': userId },
    accessKey,
    { audience: hubUrl, expiresIn: '1h', algorithm: 'HS256' }
  );

  return c.json({
    data: {
      url: hubUrl,
      accessToken: token,
    }
  });
});
```

## Graph API Permissions Map

### Required Delegated Scopes for Entra ID Audit
| Graph Endpoint | Permission | Used By (Control IDs) |
|----------------|-----------|----------------------|
| `/organization` | `Organization.Read.All` | Tenant info for all checks |
| `/identity/conditionalAccess/policies` | `Policy.Read.All` | MS.AAD.1.1v1, 2.1v1, 2.3v1, 3.1v1, 3.6v1, 3.7v1, 3.8v1 |
| `/identity/conditionalAccess/namedLocations` | `Policy.Read.All` | Named location analysis |
| `/reports/authenticationMethods/userRegistrationDetails` | `UserAuthenticationMethod.Read.All` | MS.AAD.3.2v1 |
| `/policies/authenticationMethodsPolicy` | `Policy.Read.All` | MS.AAD.3.4v1, 3.5v1 |
| `/policies/authorizationPolicy` | `Policy.Read.All` | MS.AAD.5.1v1, 8.1v1, 8.2v1 |
| `/policies/adminConsentRequestPolicy` | `Policy.Read.All` | MS.AAD.5.3v1 |
| `/policies/identitySecurityDefaultsEnforcementPolicy` | `Policy.Read.All` | Security defaults check |
| `/domains` | `Domain.Read.All` | MS.AAD.6.1v1 (password policy) |
| `/directoryRoles` + `/directoryRoles/{id}/members` | `Directory.Read.All` | MS.AAD.7.1v1 |
| `/roleManagement/directory/roleAssignmentScheduleInstances` | `RoleManagement.Read.Directory` | MS.AAD.7.2v1 |
| `/roleManagement/directory/roleEligibilityScheduleInstances` | `RoleManagement.Read.Directory` | MS.AAD.7.2v1 (PIM) |
| `/subscribedSkus` | `Organization.Read.All` | License checks for P2/Defender |
| `/deviceManagement/managedDevices` | `DeviceManagementManagedDevices.Read.All` | Device compliance checks |
| `/applications` | `Application.Read.All` | MS.AAD.5.* app registration checks |
| (beta) `/security/informationProtection/sensitivityLabels` | `InformationProtectionPolicy.Read` | Sensitivity label checks |

### Minimum Scopes for Full Entra ID Audit
```
Policy.Read.All
Directory.Read.All
Organization.Read.All
Domain.Read.All
UserAuthenticationMethod.Read.All
RoleManagement.Read.Directory
DeviceManagementManagedDevices.Read.All
Application.Read.All
InformationProtectionPolicy.Read
```

## Evaluator Port Reference

### Complete Control-to-Evaluator Mapping (29 Entra ID Controls)
| Control ID | Description | Has PowerShell Evaluator | Port Complexity | Notes |
|------------|-------------|------------------------|-----------------|-------|
| MS.AAD.1.1v1 | Block legacy auth | Yes (lines 14-44) | Low | CA policy check |
| MS.AAD.2.1v1 | Block high-risk users | Yes (lines 47-68) | Low | CA policy + P2 check |
| MS.AAD.2.3v1 | Block high-risk sign-ins | Yes (lines 71-92) | Low | Same pattern as 2.1 |
| MS.AAD.3.1v1 | Require MFA all users | Yes (lines 95-118) | Low | CA policy + auth strength |
| MS.AAD.3.2v1 | Alternative MFA method | Yes (lines 121-133) | Low | MFA registration % |
| MS.AAD.3.3v1 | Alt MFA enforced | No (default only) | Medium | Needs new evaluator logic |
| MS.AAD.3.4v1 | Auth methods migration | Yes (lines 136-149) | Low | Migration state check |
| MS.AAD.3.5v1 | No SMS/Voice MFA | Yes (lines 152-164) | Low | Auth methods check |
| MS.AAD.3.6v1 | Admin phishing-resistant MFA | Yes (lines 167-196) | Low | CA + role targeting |
| MS.AAD.3.7v1 | Managed devices SHOULD | Yes (lines 199-222) | Low | CA compliantDevice check |
| MS.AAD.3.8v1 | Managed devices for MFA reg | No (default only) | Medium | Needs new evaluator |
| MS.AAD.4.1v1 | Security logs to SIEM | No (default only) | Medium | Check diagnostic settings |
| MS.AAD.5.1v1 | Only admins register apps | Yes (lines 225-233) | Low | Authorization policy |
| MS.AAD.5.2v1 | Only admins consent | No (default only) | Medium | Permission grant policy |
| MS.AAD.5.3v1 | Admin consent workflow | Yes (lines 237-246) | Low | Consent request policy |
| MS.AAD.5.4v1 | No group owner consent | No (default only) | Medium | Permission grant policy |
| MS.AAD.6.1v1 | Passwords never expire | Yes (lines 249-260) | Low | Domain password policy |
| MS.AAD.7.1v1 | 2-8 global admins | Yes (lines 263-276) | Low | Role member count |
| MS.AAD.7.2v1 | PIM for privileged users | Yes (lines 279-291) | Low | PIM eligibility check |
| MS.AAD.7.3v1 | GA activation needs approval | No (default only) | Medium | PIM policy settings |
| MS.AAD.7.4v1 | Monthly role audit | No (default only) | Low | Advisory/manual check |
| MS.AAD.7.5v1 | No permanent active assignments | No (default only) | Medium | PIM assignment types |
| MS.AAD.7.6v1 | MFA for privileged activation | No (default only) | Medium | PIM policy settings |
| MS.AAD.7.7v1 | No assignments outside PIM | No (default only) | Medium | Compare PIM vs direct |
| MS.AAD.7.8v1 | Alert on privileged activation | No (default only) | Low | Advisory/manual check |
| MS.AAD.7.9v1 | GA activation needs approval | No (default only) | Medium | PIM policy (same as 7.3) |
| MS.AAD.8.1v1 | Restrict guest access | Yes (lines 294-308) | Low | Guest role ID check |
| MS.AAD.8.2v1 | Admin-only guest invites | Yes (lines 311-321) | Low | Invite policy check |
| MS.AAD.8.3v1 | Restrict guest user access | No (default only) | Low | Guest role ID check (same data as 8.1) |

**Summary:** 16 controls have complete evaluator logic in PowerShell (direct port). 13 controls need new evaluator logic but all use facts data areas that are already collected. Most "new" evaluators for PIM controls (7.3-7.9) require PIM policy endpoints that may need beta API and P2 licensing.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PowerShell Run-Audit Azure Function | TypeScript pipeline in Container App | Phase 2 (now) | Single runtime, no cold start, co-located with API |
| Synchronous audit (wait for response) | Async with 202 + SignalR progress | Phase 2 (now) | Non-blocking, real-time UX, scalable |
| No per-tenant result storage | auditRuns + auditFindings in tenant DB | Phase 2 (now) | Historical tracking, comparison, trending |
| Single batch fetch | Multi-batch with rate limit tracking | Phase 2 (now) | Handles large tenants, avoids throttling |

**Deprecated/outdated:**
- The existing `functions/Run-Audit/run.ps1` Azure Function remains as a reference implementation but is NOT the production path for Phase 2. The TypeScript pipeline replaces it for Entra ID controls.
- The `apps/web/src/lib/types.ts` frontend types (AuditCheck, AuditEnvelope, etc.) need updating to match the new backend schema. The old types don't have severity, settingName, currentValue, expectedValue fields.

## Open Questions

1. **Token Storage Format for Delegated Tokens**
   - What we know: Key Vault stores encrypted tenant tokens via `storeTenantToken()`. Phase 1 established the pattern.
   - What's unclear: For Phase 2, we need to store a refresh token (not just an access token). The refresh token needs the full MSAL token cache serialized (access + refresh + account info). This is technically Phase 4 (onboarding) responsibility.
   - Recommendation: For Phase 2, accept an access token directly in the audit trigger request (passed from frontend where user is already authenticated with delegated permissions to the target tenant). Defer refresh token management to Phase 4. The audit route can accept the token as a request body parameter or use the existing JWT-based auth flow.

2. **Async Pipeline Error Handling Edge Case**
   - What we know: If the pipeline crashes after some findings are persisted, the audit run should be marked as 'failed' with partial results.
   - What's unclear: How to handle the case where the DB connection itself fails during the async pipeline (e.g., elastic pool throttling).
   - Recommendation: Wrap the entire async pipeline in try/catch. On crash, attempt to update the audit run status to 'failed'. If even that fails, log the error. The frontend should poll/receive status via SignalR and show "unknown" if no update arrives within a timeout.

3. **Frontend Token Passing for Phase 2**
   - What we know: Phase 4 handles tenant onboarding and token storage. Phase 2 needs a way to get a Graph token for the target tenant.
   - What's unclear: How does the frontend obtain a delegated Graph token for the target tenant in Phase 2 (before Phase 4 onboarding exists)?
   - Recommendation: For Phase 2, the frontend can use MSAL to acquire a token for the target tenant using the same user session. The `accessToken` is passed to the audit API endpoint in the request body. This is a pragmatic approach that works before the full onboarding flow exists.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^2.0.0 |
| Config file | `apps/api/vitest.config.ts` (existing) |
| Quick run command | `pnpm test --filter @omzig/api` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUDIT-01 | POST /api/tenants/:tenantId/audits returns 202 with auditId | unit | `pnpm vitest run src/__tests__/audit-routes.test.ts -t "trigger audit"` | No -- Wave 0 |
| AUDIT-02 | All 29 Entra ID evaluators produce correct ratings | unit | `pnpm vitest run packages/audit/src/__tests__/evaluators.test.ts` | No -- Wave 0 |
| AUDIT-03 | Findings include rating + severity | unit | `pnpm vitest run packages/audit/src/__tests__/evaluators.test.ts -t "severity"` | No -- Wave 0 |
| AUDIT-04 | Fact collector produces complete AuditFacts object | unit | `pnpm vitest run packages/audit/src/__tests__/fact-collector.test.ts` | No -- Wave 0 |
| AUDIT-05 | Audit results persisted in tenant DB | integration | `pnpm vitest run src/__tests__/audit-persistence.test.ts` | No -- Wave 0 |
| AUDIT-06 | Findings include settingName, currentValue, expectedValue | unit | `pnpm vitest run packages/audit/src/__tests__/evaluators.test.ts -t "detail"` | No -- Wave 0 |
| FRAME-01 | Findings include controlId + requirementLevel | unit | `pnpm vitest run packages/audit/src/__tests__/evaluators.test.ts -t "control metadata"` | No -- Wave 0 |
| AUTH-06 | Failed checks report required Graph permission | unit | `pnpm vitest run packages/audit/src/__tests__/evaluators.test.ts -t "permission"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm vitest run --filter @omzig/api`
- **Per wave merge:** `pnpm test` (full monorepo suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/audit/vitest.config.ts` -- test config for audit package
- [ ] `packages/audit/src/__tests__/evaluators.test.ts` -- covers AUDIT-02, AUDIT-03, AUDIT-06, FRAME-01, AUTH-06
- [ ] `packages/audit/src/__tests__/fact-collector.test.ts` -- covers AUDIT-04
- [ ] `apps/api/src/__tests__/audit-routes.test.ts` -- covers AUDIT-01
- [ ] `apps/api/src/__tests__/audit-persistence.test.ts` -- covers AUDIT-05
- [ ] Graph API response mocks (fixtures for batch responses, CA policies, auth methods, etc.)
- [ ] Mock Graph client factory for unit tests (inject pre-built responses instead of real API calls)

### Evaluator Testing Strategy
Each evaluator is a pure function `(facts: AuditFacts) => EvaluatorResult`. Testing approach:
1. Create typed `AuditFacts` fixtures with known state (e.g., facts with legacy auth blocked, facts without)
2. Call evaluator function directly with fixture
3. Assert rating, message, settingName, currentValue, expectedValue
4. No Graph API mocking needed at the evaluator level -- evaluators only consume facts

This makes evaluator tests fast, deterministic, and independent of Graph API availability.

## Sources

### Primary (HIGH confidence)
- Project codebase: `scripts/audit/CisaEvaluatorRegistry.ps1` -- complete evaluator logic for 16 Entra ID controls
- Project codebase: `scripts/audit/TenantFactCollector.ps1` -- complete fact collection for 15 Graph API data areas
- Project codebase: `scripts/audit/CisaCatalogFetcher.ps1` -- complete control catalog with 29 Entra ID control definitions
- Project codebase: `packages/db/src/tenant/schema.ts` -- existing auditRuns stub table
- Project codebase: `apps/api/src/middleware/tenant.ts` -- per-request tenant DB pattern
- [Microsoft Learn: Batch requests with SDKs](https://learn.microsoft.com/en-us/graph/sdks/batch-requests) -- TypeScript $batch pattern with BatchRequestContent/BatchResponseContent
- [Microsoft Learn: Azure SignalR REST API reference](https://learn.microsoft.com/en-us/azure/azure-signalr/signalr-reference-data-plane-rest-api) -- REST API endpoints for serverless push
- [Microsoft Learn: Graph API Conditional Access permissions](https://learn.microsoft.com/en-us/graph/api/conditionalaccesspolicy-get?view=graph-rest-1.0) -- Policy.Read.All minimum scope
- [npm: @microsoft/microsoft-graph-client](https://www.npmjs.com/package/@microsoft/microsoft-graph-client) -- SDK version ^3.0.7
- [npm: @microsoft/microsoft-graph-types](https://www.npmjs.com/package/@microsoft/microsoft-graph-types) -- TypeScript type definitions

### Secondary (MEDIUM confidence)
- [Microsoft Learn: Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference) -- full delegated scope list
- [Microsoft Learn: Service mode in Azure SignalR](https://learn.microsoft.com/en-us/azure/azure-signalr/concept-service-mode) -- serverless mode behavior
- [Microsoft Learn: JSON batching overview](https://learn.microsoft.com/en-us/graph/json-batching) -- 20-per-batch limit, batch semantics

### Tertiary (LOW confidence)
- None. All findings verified against official documentation or existing project code.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries are official Microsoft SDKs or already established in the project
- Architecture: HIGH -- proven PowerShell pipeline being ported 1:1 to TypeScript with same patterns
- Pitfalls: HIGH -- documented from direct codebase analysis of evaluators and Graph API endpoint behavior
- Evaluator logic: HIGH -- 16 of 29 evaluators have working PowerShell code as direct port source
- SignalR integration: MEDIUM -- REST API pattern is documented but no existing project code to reference
- Token management: MEDIUM -- Phase 2 needs pragmatic approach before Phase 4 onboarding flow exists

**Research date:** 2026-03-11
**Valid until:** 2026-04-10 (stable -- Graph API v1.0 and SDK are mature)
