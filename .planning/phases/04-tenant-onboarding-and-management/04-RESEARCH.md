# Phase 4: Tenant Onboarding and Management - Research

**Researched:** 2026-03-11
**Domain:** Multi-tenant OAuth consent, GDAP delegated admin, Azure SQL elastic pool provisioning, multi-tenant dashboard UX
**Confidence:** HIGH

## Summary

Phase 4 transforms the platform from a single-tenant audit tool into a multi-tenant MSP management platform. The core technical challenges are: (1) implementing a multi-tenant Entra ID admin consent flow where client admins grant read-only Graph API permissions via a shareable consent link, (2) GDAP/Lighthouse onboarding where MSPs enter their existing delegated admin relationship ID and the platform verifies it, (3) programmatic Azure SQL database provisioning within the existing elastic pool, and (4) a hybrid card-grid/table dashboard for managing many tenants at a glance.

The existing codebase has strong foundations for this phase: the control-plane schema already has `tenants`, `tenantUserAccess`, and `setupWizardState` tables; the Key Vault service has `storeTenantToken()`/`getTenantToken()` ready; the `withTenantDb()` middleware already handles per-tenant database connections with access verification; the tenant routes are stubbed at 501; and `migrateTenantDb()` is ready to apply schema to new databases. The main gaps are: the `tenants` table needs `status` and `connectionMethod` columns; the API needs OAuth callback handling with `@azure/msal-node` ConfidentialClientApplication for server-side token exchange; GDAP verification requires calls to the Microsoft Graph GDAP API (`/tenantRelationships/delegatedAdminRelationships`); and the frontend needs three new pages (`/tenants`, `/tenants/new`, `/tenants/:id`).

**Primary recommendation:** Use `@azure/msal-node` ConfidentialClientApplication for server-side OAuth authorization code exchange, the Microsoft Graph v1.0 GDAP API for relationship verification, T-SQL `CREATE DATABASE ... SERVICE_OBJECTIVE = ELASTIC_POOL` for tenant DB provisioning, and reuse existing audit page components within the `/tenants/:id` detail view.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Full-page wizard at `/tenants/new` with 5 steps: Tenant Details, Connection Method, Connect & Verify, Provisioning, Complete
- Uses existing `setupWizardState` table for step tracking and resume
- Full auto-provision after consent: DB + tokens + access + first audit, all automatic
- Shareable consent link: MSP generates a unique consent URL from the wizard, client admin clicks and grants permissions
- OAuth callback notifies the MSP's wizard to advance to provisioning step
- Stores refresh token encrypted in Key Vault via existing `storeTenantToken()`
- GDAP: MSP enters relationship ID, platform verifies via Graph API call, auto-detects client tenant ID
- Both OAuth and GDAP converge to same token model via `storeTenantToken(tenantId, token)`
- Track connection method on tenant record (`connectionMethod: 'oauth' | 'gdap'`)
- Hybrid dashboard: default card grid with toggle to data table view at `/tenants`
- Each tenant card shows: overall compliance score, per-framework mini scores, last audit timestamp, critical findings count, health indicator
- Health thresholds: Green >= 70%, Yellow 40-69%, Red < 40%, Gray (no audit), Orange (token expired)
- Tenant detail at `/tenants/:id` sets tenant context (X-Tenant-Id), shows full compliance dashboard from Phase 3
- Breadcrumb navigation back to `/tenants`
- Soft delete with name-typing confirm modal, 30-day retention, hard purge via scheduled job
- 5-state lifecycle: pending -> active -> needs_reauth -> suspended -> purged
- Abandoned wizards (pending > 24h) cleaned up by scheduled job

### Claude's Discretion
- Exact Entra ID app registration configuration for OAuth consent
- Graph API scopes list for the consent prompt
- GDAP relationship verification approach (Partner Center API vs direct Graph test)
- Wizard step component structure and state management
- Table view column configuration and sorting
- Hard purge job implementation details (timer trigger, batch processing)
- API route structure for new tenant management endpoints

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TENANT-01 | MSP can onboard a client tenant via OAuth consent flow (client admin grants permissions) | Admin consent endpoint, MSAL Node.js ConfidentialClientApplication, authorization code exchange, shareable consent link pattern |
| TENANT-02 | MSP can onboard a client tenant via GDAP/Lighthouse delegated admin relationship | Graph API v1.0 GDAP endpoints, delegatedAdminRelationship resource, status verification, access assignment listing |
| TENANT-03 | Multi-tenant dashboard shows all connected tenants with compliance scores and health status | Hybrid card-grid/table layout, health score calculation from framework scores, tenant list API endpoint |
| TENANT-04 | MSP can click into any tenant from dashboard to view detailed findings | Tenant context switching via X-Tenant-Id, route `/tenants/:id`, reuse Phase 3 audit components |
| TENANT-07 | MSP can remove a client tenant and all associated data is deleted | Soft delete with 30-day retention, hard purge job (DROP DATABASE, Key Vault secret deletion) |
| TENANT-08 | Per-tenant database isolation -- each client tenant's data stored in separate Azure SQL database within Elastic Pool | T-SQL CREATE DATABASE with ELASTIC_POOL service objective, migrateTenantDb() for schema application |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @azure/msal-node | ^2.x or ^3.x | Server-side OAuth token exchange | Microsoft's official Node.js auth library for Entra ID; handles authorization code flow, token caching, refresh |
| @azure/msal-browser | ^3.27.0 | Frontend OAuth redirect handling | Already in use; handles consent redirect callbacks |
| hono | ^4.0.0 | API routes for tenant management | Already in use; Hono routes pattern established |
| drizzle-orm | beta | Schema for new columns, queries | Already in use; mssql-core support |
| mssql | ^11.0.0 | T-SQL execution for DB provisioning | Already in use; needed for CREATE DATABASE statements |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @azure/keyvault-secrets | ^4.0.0 | Token storage and deletion | Already in use; storeTenantToken/getTenantToken |
| @microsoft/signalr | ^8.0.0 | Real-time provisioning progress | Already in use; push onboarding progress to wizard |
| zod | ^3.23.0 | Request validation for tenant endpoints | Already in use in API |
| lucide-react | ^0.468.0 | Icons for dashboard cards | Already in use |
| recharts | ^3.8.0 | Mini score visualizations on cards | Already in use for radar chart |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @azure/msal-node | Raw OAuth HTTP calls | MSAL handles token caching, refresh, PKCE, error handling; raw calls would be fragile |
| Graph API for GDAP | Partner Center API | Graph API v1.0 has GDAP endpoints directly; Partner Center API requires separate auth context and SDK |
| T-SQL CREATE DATABASE | Azure Management SDK | T-SQL is simpler, no extra SDK needed, works with existing mssql connection |

**Installation:**
```bash
pnpm add @azure/msal-node --filter @omzig/api
```

Note: All other dependencies are already installed. `@azure/msal-node` is the only new package needed.

## Architecture Patterns

### Recommended Project Structure
```
apps/api/src/
  routes/
    tenants.ts          # Replace 501 stubs with full CRUD + onboarding
    oauth-callback.ts   # New: OAuth consent callback handler
  services/
    tenant-provisioning.ts  # New: DB creation, migration, token storage
    oauth-consent.ts        # New: Consent URL generation, code exchange
    gdap-verification.ts    # New: GDAP relationship verification via Graph
    keyvault.ts             # Existing: storeTenantToken, getTenantToken
    signalr.ts              # Existing: push provisioning progress

apps/web/src/
  app/
    tenants/
      page.tsx              # Multi-tenant dashboard (card grid + table toggle)
      new/
        page.tsx            # Onboarding wizard (5 steps)
      [id]/
        page.tsx            # Tenant detail (wraps existing audit components)
  components/
    tenants/
      TenantCard.tsx        # Dashboard card (scores, health dot, last audit)
      TenantTable.tsx       # Table view alternative
      TenantGrid.tsx        # Card grid container with "Add Tenant" card
      HealthDot.tsx         # Colored status indicator
      OnboardingWizard.tsx  # 5-step wizard container
      WizardStepTenantDetails.tsx
      WizardStepConnectionMethod.tsx
      WizardStepConnectVerify.tsx
      WizardStepProvisioning.tsx
      WizardStepComplete.tsx
      RemoveTenantModal.tsx # Confirm modal with name-typing
  hooks/
    useTenants.ts           # Fetch tenant list, health scores
    useOnboarding.ts        # Wizard state management
  lib/
    tenant-api.ts           # API client for tenant endpoints
```

### Pattern 1: OAuth Admin Consent Flow (Server-Side)

**What:** Multi-tenant Entra ID admin consent using authorization code flow with MSAL Node.js ConfidentialClientApplication on the server side.

**When to use:** When client admin needs to grant read-only Graph API permissions to the MSP's application for their tenant.

**Flow:**
1. MSP clicks "OAuth Consent" in wizard step 2
2. Backend generates a consent URL with `@azure/msal-node` using the admin consent endpoint
3. MSP copies/shares the URL with client admin (or clicks it themselves if they have admin access)
4. Client admin opens URL, authenticates, reviews permissions, grants consent
5. Entra ID redirects to the backend's callback endpoint with authorization code
6. Backend exchanges code for tokens using `ConfidentialClientApplication.acquireTokenByCode()`
7. Backend stores refresh token in Key Vault via `storeTenantToken()`
8. Backend notifies wizard via SignalR to advance to provisioning step

**Consent URL format:**
```
https://login.microsoftonline.com/organizations/v2.0/adminconsent
  ?client_id={APP_CLIENT_ID}
  &scope=https://graph.microsoft.com/.default
  &redirect_uri={API_BASE_URL}/api/oauth/callback
  &state={encrypted_state_with_wizard_session_id}
```

**MSAL Node.js server-side example:**
```typescript
// Source: https://learn.microsoft.com/en-us/entra/identity-platform/v2-admin-consent
// Source: https://github.com/AzureAD/microsoft-authentication-library-for-js
import { ConfidentialClientApplication } from '@azure/msal-node';

const msalConfig = {
  auth: {
    clientId: process.env.OAUTH_CLIENT_ID!,
    clientSecret: process.env.OAUTH_CLIENT_SECRET!,
    authority: 'https://login.microsoftonline.com/organizations',
  },
};

const cca = new ConfidentialClientApplication(msalConfig);

// Step 1: Generate consent URL
function buildConsentUrl(state: string): string {
  return `https://login.microsoftonline.com/organizations/v2.0/adminconsent`
    + `?client_id=${process.env.OAUTH_CLIENT_ID}`
    + `&scope=https://graph.microsoft.com/.default`
    + `&redirect_uri=${encodeURIComponent(process.env.OAUTH_REDIRECT_URI!)}`
    + `&state=${encodeURIComponent(state)}`;
}

// Step 2: Exchange authorization code for tokens (in callback handler)
async function exchangeCodeForTokens(code: string) {
  const result = await cca.acquireTokenByCode({
    code,
    redirectUri: process.env.OAUTH_REDIRECT_URI!,
    scopes: ['https://graph.microsoft.com/.default'],
  });
  // result.accessToken, result.account.tenantId, etc.
  return result;
}
```

**Important:** The admin consent endpoint (`/v2.0/adminconsent`) and the authorization code endpoint (`/v2.0/authorize`) are related but different. Admin consent grants org-wide permissions. After admin consent, a separate authorization code flow is needed to get tokens. Alternatively, use client credentials flow (app-only) after admin consent is granted, which avoids the need for refresh tokens entirely.

### Pattern 2: Client Credentials Flow (Post-Consent)

**What:** After admin consent is granted (service principal created in customer tenant), use client credentials flow with the app's own credentials to get app-only tokens for Graph API access.

**When to use:** This is the recommended pattern for service-to-service Graph API calls after admin consent. No user context needed, no refresh tokens to manage.

**Flow:**
```typescript
// After admin consent, use client credentials to get app-only token
const result = await cca.acquireTokenByClientCredential({
  scopes: ['https://graph.microsoft.com/.default'],
  azureRegion: 'AUTO_DISCOVER',
  // For multi-tenant: specify the customer tenant ID
  authority: `https://login.microsoftonline.com/${customerTenantId}`,
});
// result.accessToken -- app-only token for Graph API
```

**Advantages over refresh tokens:**
- No refresh token management (tokens don't expire the same way)
- No user context needed (pure application permissions)
- Works automatically after admin consent creates service principal
- MSAL handles token caching and renewal

**What to store in Key Vault:** Store the customer tenant ID (not tokens). The app uses its own client credentials + the customer tenant ID to get fresh tokens on demand.

**CRITICAL DECISION:** This approach (client credentials after admin consent) vs. storing refresh tokens. Client credentials is simpler and more reliable for server-side auditing, but requires Application permissions in the app registration (not Delegated). The existing CONTEXT.md mentions storing refresh tokens, so implement the delegated flow but consider client credentials as the primary approach since the audit pipeline runs server-side without user context.

### Pattern 3: GDAP Relationship Verification via Graph API

**What:** Verify a GDAP delegated admin relationship using the Microsoft Graph v1.0 GDAP API.

**When to use:** When MSP enters their GDAP relationship ID from Partner Center.

**Recommendation:** Use Graph API directly (not Partner Center API). The Graph API v1.0 has full GDAP support and the app likely already has Graph permissions. Partner Center API requires separate authentication.

```typescript
// Source: https://learn.microsoft.com/en-us/graph/api/resources/delegatedadminrelationship
// GET /tenantRelationships/delegatedAdminRelationships/{id}

interface GdapRelationship {
  id: string;
  displayName: string;
  status: 'created' | 'approvalPending' | 'approved' | 'activating' | 'active'
    | 'expiring' | 'expired' | 'terminationRequested' | 'terminating' | 'terminated';
  customer: {
    tenantId: string;
    displayName: string;
  };
  accessDetails: {
    unifiedRoles: Array<{
      roleDefinitionId: string;
    }>;
  };
  duration: string;
  endDateTime: string;
}

async function verifyGdapRelationship(relationshipId: string, accessToken: string) {
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/tenantRelationships/delegatedAdminRelationships/${relationshipId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) throw new Error(`GDAP relationship not found: ${response.status}`);

  const relationship: GdapRelationship = await response.json();

  // Verify it's active
  if (relationship.status !== 'active') {
    throw new Error(`GDAP relationship status is "${relationship.status}", must be "active"`);
  }

  return {
    customerTenantId: relationship.customer.tenantId,
    customerDisplayName: relationship.customer.displayName,
    roles: relationship.accessDetails.unifiedRoles,
    expiresAt: relationship.endDateTime,
  };
}
```

**Required Graph permission:** `DelegatedAdminRelationship.Read.All` or `DelegatedAdminRelationship.ReadWrite.All` (Application or Delegated).

### Pattern 4: Tenant Database Provisioning

**What:** Create a new Azure SQL database in the existing elastic pool and apply tenant schema.

**When to use:** During auto-provisioning step of onboarding wizard.

```typescript
// Source: https://learn.microsoft.com/en-us/azure/azure-sql/database/elastic-pool-manage
import mssql from 'mssql';
import { migrateTenantDb } from '@omzig/db';

async function provisionTenantDatabase(tenantId: string): Promise<string> {
  // Generate opaque database name (per Phase 1 decision)
  const dbName = `tenant_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

  // Connect to master database to create new DB
  const masterConfig = buildConfig('master');
  const masterPool = new mssql.ConnectionPool(masterConfig);
  await masterPool.connect();

  try {
    const elasticPoolName = process.env.ELASTIC_POOL_NAME!;
    // T-SQL to create database in elastic pool
    await masterPool.request().query(
      `CREATE DATABASE [${dbName}] (SERVICE_OBJECTIVE = ELASTIC_POOL (name = [${elasticPoolName}]))`
    );
  } finally {
    await masterPool.close();
  }

  // Apply tenant schema migrations
  await migrateTenantDb(dbName);

  return dbName;
}
```

**Key considerations:**
- Must connect to `master` database to execute `CREATE DATABASE`
- The elastic pool must already exist (provisioned in Phase 1 infra)
- `migrateTenantDb()` already exists in `@omzig/db` and applies the tenant schema
- Database names should be opaque (not contain customer info) per Phase 1 decisions

### Pattern 5: Tenant Status Lifecycle State Machine

**What:** Manage the 5-state tenant lifecycle with clear transition rules.

```
pending ──> active ──> needs_reauth ──> active (re-authorize)
              │                           │
              └──> suspended ──> purged   └──> suspended ──> purged
```

**Transition rules:**
| From | To | Trigger |
|------|----|---------|
| (new) | pending | Wizard started, tenant record created |
| pending | active | Provisioning complete (DB + tokens + first audit) |
| pending | (deleted) | Abandoned wizard cleanup (>24h) |
| active | needs_reauth | Token refresh fails or token revoked |
| active | suspended | MSP soft-deletes tenant |
| needs_reauth | active | MSP re-authorizes (new consent or new GDAP token) |
| needs_reauth | suspended | MSP soft-deletes tenant |
| suspended | purged | Hard purge job (30 days after deletedAt) |

### Anti-Patterns to Avoid

- **Single admin consent endpoint for everything:** Don't mix user login and tenant onboarding consent in the same flow. The MSP logs in via the existing MSAL browser flow. The client admin consent is a separate, shareable link using the admin consent endpoint.
- **Storing access tokens instead of using client credentials:** Access tokens expire in ~1 hour. Store the customer tenant ID and use client credentials flow to get fresh tokens on demand. If using delegated flow, store refresh tokens (not access tokens).
- **Blocking the wizard on DB creation:** Database provisioning can take 10-30 seconds. Use SignalR to push progress updates to the wizard so it doesn't appear frozen.
- **Creating the tenant DB before consent succeeds:** Don't create the database until you have confirmed credentials. Otherwise you have orphaned databases.
- **Hardcoding Graph API scopes:** Define scopes in a config constant so they can be updated without code changes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OAuth token exchange | Raw HTTP POST to /token endpoint | @azure/msal-node ConfidentialClientApplication | Handles PKCE, token validation, caching, refresh, error codes |
| GDAP verification | Custom Partner Center API integration | Graph API v1.0 /tenantRelationships/delegatedAdminRelationships | Already in Graph API, same auth context, well-documented |
| Database provisioning retries | Custom retry loop for CREATE DATABASE | mssql with explicit error handling | Azure SQL may return 40544 (elastic pool quota) or 40549 (in progress) |
| Wizard state persistence | Custom localStorage state management | Existing setupWizardState table + API | Already built in Phase 1, handles step tracking and resume |
| Token encryption | Custom AES encryption for Key Vault | Existing storeTenantToken() / getTenantToken() | Already built with RSA-OAEP envelope encryption |
| Tenant access verification | Custom middleware for tenant routes | Existing withTenantDb() middleware | Already handles tenant lookup, access check, DB connection lifecycle |

**Key insight:** Phase 1 and Phase 2 built the foundational infrastructure specifically for this phase. The control-plane schema, Key Vault service, tenant middleware, and migration runner are all ready. The main work is wiring them together with the OAuth/GDAP flows and building the frontend.

## Common Pitfalls

### Pitfall 1: Admin Consent vs. Authorization Code Confusion
**What goes wrong:** Developers confuse the admin consent endpoint (`/v2.0/adminconsent`) with the authorization code endpoint (`/v2.0/authorize`). Admin consent only grants permissions; it doesn't return tokens.
**Why it happens:** The admin consent response includes `admin_consent=True` and `tenant={id}` but no authorization code.
**How to avoid:** After admin consent succeeds, use client credentials flow (`acquireTokenByClientCredential`) with the returned tenant ID to get tokens. OR use the authorization code flow (`/v2.0/authorize` with `prompt=admin_consent`) which combines consent + code return.
**Warning signs:** Callback handler receives `admin_consent=True` but tries to exchange a non-existent code.

**Recommended approach:** Use the authorization code flow with `prompt=admin_consent` parameter. This combines consent and code exchange in one redirect:
```
GET https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize
  ?client_id={id}
  &response_type=code
  &redirect_uri={uri}
  &scope=https://graph.microsoft.com/.default offline_access
  &state={state}
  &prompt=admin_consent
```

### Pitfall 2: Multi-Tenant App Registration Misconfiguration
**What goes wrong:** The Entra app registration isn't configured as multi-tenant, so consent from other tenants fails.
**Why it happens:** Default app registrations are single-tenant.
**How to avoid:** Set `signInAudience` to `AzureADMultipleOrgs` in the app registration manifest. Ensure Application permissions (not just Delegated) are configured for the Graph scopes needed by the audit engine.
**Warning signs:** Client admin gets "AADSTS50020: User account from identity provider does not exist in tenant."

### Pitfall 3: Elastic Pool Database Quota Exhaustion
**What goes wrong:** `CREATE DATABASE` fails with error 40544 ("The database has reached its size quota").
**Why it happens:** Azure SQL elastic pools have DTU/vCore and database count limits. The Basic tier elastic pool supports up to 500 databases.
**How to avoid:** Monitor elastic pool utilization. Check database count before provisioning. Return a clear error ("Maximum tenant capacity reached") rather than a cryptic SQL error.
**Warning signs:** Onboarding wizard fails at provisioning step with SQL error.

### Pitfall 4: GDAP Relationship Not Active
**What goes wrong:** MSP enters a GDAP relationship ID that exists but is in `approvalPending` or `expired` status.
**Why it happens:** The customer hasn't approved yet, or the relationship expired.
**How to avoid:** Check `status === 'active'` and show a clear message explaining what the MSP needs to do (e.g., "Ask your customer to approve the GDAP request in Partner Center").
**Warning signs:** Graph API returns the relationship but audit pipeline gets 403 when calling Graph on behalf of the customer.

### Pitfall 5: Race Condition in Wizard Resume
**What goes wrong:** Two browser tabs resume the same wizard, causing duplicate tenant provisioning.
**Why it happens:** setupWizardState doesn't have concurrency protection.
**How to avoid:** Use optimistic locking on the setupWizardState row (check updatedAt before advancing step). Make provisioning idempotent -- if DB already exists, skip creation.
**Warning signs:** Duplicate tenant records or duplicate databases in elastic pool.

### Pitfall 6: OAuth State Parameter Tampering
**What goes wrong:** Attacker modifies the state parameter in the OAuth callback to hijack the onboarding session.
**Why it happens:** State is passed through the browser redirect and can be intercepted.
**How to avoid:** Encrypt the state parameter with HMAC or use a server-side session ID that maps to the wizard state. Verify HMAC on callback. Include a nonce/timestamp to prevent replay.
**Warning signs:** Callback processes consent for the wrong wizard session.

### Pitfall 7: Soft Delete Not Filtering in Dashboard Queries
**What goes wrong:** Deleted tenants still appear in the multi-tenant dashboard.
**Why it happens:** Dashboard query forgets to filter `isDeleted = false`.
**How to avoid:** The existing `withTenantDb()` middleware already checks `tenant.isDeleted`, but the dashboard list endpoint is separate (doesn't use that middleware). Always include `.where(eq(tenants.isDeleted, false))` in list queries.
**Warning signs:** Deleted tenants appear with "suspended" badge in dashboard.

## Code Examples

### Tenant Schema Extension (New Columns)

```typescript
// Source: Existing schema at packages/db/src/control-plane/schema.ts
// Add these columns to the existing tenants table

export const tenants = mssqlTable('tenants', {
  // ... existing columns ...
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  // 'pending' | 'active' | 'needs_reauth' | 'suspended' | 'purged'
  connectionMethod: varchar('connection_method', { length: 10 }),
  // 'oauth' | 'gdap' | null (set during onboarding)
  primaryDomain: nvarchar('primary_domain', { length: 255 }),
  contactEmail: nvarchar('contact_email', { length: 320 }),
  lastAuditAt: datetime2('last_audit_at'),
  lastAuditScore: int('last_audit_score'), // 0-100 average across frameworks
});
```

### Tenant List API Response Shape

```typescript
// GET /api/tenants -- List all tenants for the user's org
interface TenantSummary {
  id: string;
  displayName: string;
  m365TenantId: string;
  status: 'pending' | 'active' | 'needs_reauth' | 'suspended';
  connectionMethod: 'oauth' | 'gdap' | null;
  primaryDomain: string | null;
  health: 'green' | 'yellow' | 'red' | 'gray' | 'orange';
  overallScore: number | null; // 0-100 average of all frameworks
  frameworkScores: {
    AAD?: number;  // CISA SCuBA
    ZTA?: number;  // NIST 800-207
    '80053'?: number; // NIST 800-53
    CSF?: number;  // NIST CSF 2.0
  } | null;
  lastAuditAt: string | null; // ISO 8601
  criticalFindingsCount: number;
  createdAt: string;
}
```

### OAuth Callback Route

```typescript
// Source: https://learn.microsoft.com/en-us/entra/identity-platform/v2-admin-consent
// apps/api/src/routes/oauth-callback.ts

oauthRoutes.get('/oauth/callback', async (c) => {
  const adminConsent = c.req.query('admin_consent');
  const tenantId = c.req.query('tenant');
  const error = c.req.query('error');
  const state = c.req.query('state');

  if (error) {
    // Redirect to frontend with error
    return c.redirect(`${FRONTEND_URL}/tenants/new?error=${error}&state=${state}`);
  }

  if (adminConsent === 'True' && tenantId) {
    // Verify state HMAC
    const sessionId = verifyAndDecryptState(state);

    // Store the customer tenant ID -- will use client credentials to get tokens
    // OR: if using auth code flow, exchange the code here

    // Notify wizard via SignalR
    await pushOnboardingProgress(sessionId, {
      step: 'consent_granted',
      customerTenantId: tenantId,
    });

    // Redirect back to wizard
    return c.redirect(`${FRONTEND_URL}/tenants/new?consent=success&state=${state}`);
  }

  return c.redirect(`${FRONTEND_URL}/tenants/new?error=unknown`);
});
```

### Health Score Calculation

```typescript
// Matches maturity threshold pattern from Phase 3
function calculateHealth(
  overallScore: number | null,
  status: string,
): 'green' | 'yellow' | 'red' | 'gray' | 'orange' {
  if (status === 'needs_reauth') return 'orange';
  if (overallScore === null) return 'gray';
  if (overallScore >= 70) return 'green';
  if (overallScore >= 40) return 'yellow';
  return 'red';
}
```

### Tenant Provisioning Service

```typescript
// apps/api/src/services/tenant-provisioning.ts
import mssql from 'mssql';
import { migrateTenantDb, getControlPlaneDb, tenants, tenantUserAccess } from '@omzig/db';
import { storeTenantToken } from './keyvault.js';
import { eq } from 'drizzle-orm';

interface ProvisioningResult {
  databaseName: string;
  tenantId: string;
}

export async function provisionTenant(
  tenantId: string,
  m365TenantId: string,
  tokenOrCredential: string,
  userId: string,
): Promise<ProvisioningResult> {
  const db = await getControlPlaneDb();

  // Step 1: Create database in elastic pool
  const dbName = `t_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const masterPool = new mssql.ConnectionPool(buildMasterConfig());
  await masterPool.connect();
  try {
    await masterPool.request().query(
      `CREATE DATABASE [${dbName}] (SERVICE_OBJECTIVE = ELASTIC_POOL (name = [${process.env.ELASTIC_POOL_NAME}]))`
    );
  } finally {
    await masterPool.close();
  }

  // Step 2: Apply tenant schema
  await migrateTenantDb(dbName);

  // Step 3: Store token in Key Vault
  await storeTenantToken(tenantId, tokenOrCredential);

  // Step 4: Update tenant record
  await db.update(tenants)
    .set({
      databaseName: dbName,
      tokenSecretName: `tenant-token-${tenantId}`,
      status: 'active',
    })
    .where(eq(tenants.id, tenantId));

  // Step 5: Grant access to the onboarding user
  await db.insert(tenantUserAccess).values({
    id: crypto.randomUUID(),
    userId,
    tenantId,
    roleOverride: null, // Uses base role
    grantedBy: userId,
  });

  return { databaseName: dbName, tenantId };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| DAP (Delegated Admin Privileges) | GDAP (Granular Delegated Admin) | 2023 | Partners must use GDAP; DAP deprecated. Roles are least-privilege, time-bound. |
| ADAL (Azure AD Auth Library) | MSAL (Microsoft Auth Library) | 2020-2023 | ADAL fully retired. MSAL is the only supported auth library. |
| App-only refresh tokens | Client credentials flow | Current | For server-side apps, client credentials is preferred over refresh token management. |
| Partner Center SDK (.NET only) | Graph API v1.0 GDAP endpoints | 2023 | GDAP APIs are now in Graph v1.0, no need for separate Partner Center SDK. |
| Single-tenant app registrations | Multi-tenant with admin consent | Current | Multi-tenant apps use `/organizations` authority; admin consent creates service principal in customer tenant. |

**Deprecated/outdated:**
- DAP (Delegated Admin Privileges): Fully deprecated in favor of GDAP. Do not implement DAP support.
- ADAL: Fully retired. All auth must use MSAL.
- Azure AD Graph API: Retired June 2023. Use Microsoft Graph API.

## Open Questions

1. **Client Credentials vs. Delegated (Refresh Token) for Graph API Access**
   - What we know: The CONTEXT.md specifies storing refresh tokens. Client credentials flow is simpler for server-side access and doesn't require refresh token management.
   - What's unclear: Whether the audit pipeline needs user-delegated permissions or can work with app-only permissions. The existing audit pipeline accepts an `accessToken` parameter.
   - Recommendation: Implement both paths. OAuth consent stores the customer tenant ID; the audit pipeline uses client credentials with that tenant ID to get fresh tokens. GDAP uses delegated tokens from the partner context. Both converge at the token level.

2. **Entra App Registration: Single App vs. Separate Consent App**
   - What we know: The existing app registration handles MSP user login (single-tenant). Tenant onboarding needs a multi-tenant app registration.
   - What's unclear: Whether to use the same app registration (changed to multi-tenant) or a separate app registration specifically for customer consent.
   - Recommendation: Use a **separate** multi-tenant app registration for customer consent. This keeps the MSP login app single-tenant (more secure) and the consent app multi-tenant. Store the consent app's client ID/secret as environment variables.

3. **Hard Purge Job Runtime**
   - What we know: Needs to run periodically to drop databases and delete Key Vault secrets for tenants suspended > 30 days.
   - What's unclear: Whether to use Azure Functions timer trigger (already in the stack) or a background task in the API process.
   - Recommendation: Azure Functions timer trigger is the right choice. The existing `functions/` directory has the pattern. But for Phase 4 scope, implement a simple API endpoint (`POST /api/admin/purge`) that can be called manually or via cron. Timer trigger can be Phase 6 (scheduled scans phase).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.x |
| Config file | `apps/api/vitest.config.ts`, `apps/web/vitest.config.ts` |
| Quick run command | `pnpm --filter @omzig/api test` |
| Full suite command | `pnpm -r test` |

### Phase Requirements --> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TENANT-01 | OAuth consent URL generation and callback handling | unit | `pnpm --filter @omzig/api vitest run src/__tests__/oauth-consent.test.ts -x` | No - Wave 0 |
| TENANT-01 | Token exchange and storage in Key Vault | unit | `pnpm --filter @omzig/api vitest run src/__tests__/tenant-provisioning.test.ts -x` | No - Wave 0 |
| TENANT-02 | GDAP relationship verification and tenant ID extraction | unit | `pnpm --filter @omzig/api vitest run src/__tests__/gdap-verification.test.ts -x` | No - Wave 0 |
| TENANT-03 | Tenant list endpoint returns tenants with scores and health | unit | `pnpm --filter @omzig/api vitest run src/__tests__/tenant-routes.test.ts -x` | No - Wave 0 |
| TENANT-04 | Tenant detail page renders with correct tenant context | unit | `pnpm --filter @omzig/web vitest run src/__tests__/TenantDetail.test.tsx -x` | No - Wave 0 |
| TENANT-07 | Soft delete sets isDeleted/deletedAt, hides from dashboard | unit | `pnpm --filter @omzig/api vitest run src/__tests__/tenant-routes.test.ts -x` | No - Wave 0 |
| TENANT-08 | Tenant DB provisioning creates DB and applies migrations | unit | `pnpm --filter @omzig/api vitest run src/__tests__/tenant-provisioning.test.ts -x` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @omzig/api test && pnpm --filter @omzig/web test`
- **Per wave merge:** `pnpm -r test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/api/src/__tests__/oauth-consent.test.ts` -- covers TENANT-01 (consent URL, callback, token exchange)
- [ ] `apps/api/src/__tests__/gdap-verification.test.ts` -- covers TENANT-02 (relationship lookup, status check)
- [ ] `apps/api/src/__tests__/tenant-routes.test.ts` -- covers TENANT-03, TENANT-07 (CRUD, list with scores, soft delete)
- [ ] `apps/api/src/__tests__/tenant-provisioning.test.ts` -- covers TENANT-01, TENANT-08 (DB creation, migration, token storage)
- [ ] `apps/web/src/__tests__/TenantDetail.test.tsx` -- covers TENANT-04 (tenant context, audit component reuse)
- [ ] `apps/web/src/__tests__/TenantDashboard.test.tsx` -- covers TENANT-03 (card grid, table toggle, health dots)

## Graph API Scopes for Audit (Read-Only)

The multi-tenant consent app needs these Application permissions (admin consent required):

| Permission | Purpose | Type |
|------------|---------|------|
| Directory.Read.All | Read directory data (users, groups, roles) | Application |
| Policy.Read.All | Read Conditional Access and other policies | Application |
| Reports.Read.All | Read usage and audit reports | Application |
| SecurityEvents.Read.All | Read security events and alerts | Application |
| DeviceManagementConfiguration.Read.All | Read Intune device configuration | Application |
| DeviceManagementManagedDevices.Read.All | Read managed device info | Application |
| IdentityRiskyUser.Read.All | Read risky user detections | Application |
| AuditLog.Read.All | Read audit log entries | Application |
| Organization.Read.All | Read organization settings | Application |
| RoleManagement.Read.Directory | Read directory role assignments | Application |
| DelegatedAdminRelationship.Read.All | Read GDAP relationships (for GDAP verification) | Application |

**For the `/.default` scope:** When using `https://graph.microsoft.com/.default` in the admin consent request, all Application permissions configured in the app registration will be requested. This is the simplest approach.

## Sources

### Primary (HIGH confidence)
- [Microsoft identity platform admin consent protocols](https://learn.microsoft.com/en-us/entra/identity-platform/v2-admin-consent) - Admin consent endpoint format, parameters, response handling
- [delegatedAdminRelationship resource type (Graph v1.0)](https://learn.microsoft.com/en-us/graph/api/resources/delegatedadminrelationship?view=graph-rest-1.0) - GDAP API properties, status values, customer tenant ID
- [GDAP API overview (Graph v1.0)](https://learn.microsoft.com/en-us/graph/api/resources/delegatedadminrelationships-api-overview?view=graph-rest-1.0) - GDAP workflow, API endpoints, permissions
- [Azure SQL elastic pool management](https://learn.microsoft.com/en-us/azure/azure-sql/database/elastic-pool-manage?view=azuresql) - T-SQL CREATE DATABASE with elastic pool
- [MSAL Node.js ConfidentialClientApplication](https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/initialize-confidential-client-application.md) - Server-side auth code exchange

### Secondary (MEDIUM confidence)
- [Convert single-tenant to multi-tenant](https://learn.microsoft.com/en-us/entra/identity-platform/howto-convert-app-to-be-multi-tenant) - Multi-tenant app registration setup
- [OAuth 2.0 authorization code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow) - Token exchange, refresh token handling
- [Authentication flow support in MSAL](https://learn.microsoft.com/en-us/entra/identity-platform/msal-authentication-flows) - Flow types and MSAL support

### Tertiary (LOW confidence)
- None -- all findings verified with official Microsoft documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries are either already in use or are Microsoft's official SDK
- Architecture: HIGH - Patterns follow existing codebase conventions (Hono routes, Drizzle schema, Key Vault service, withTenantDb middleware)
- OAuth/GDAP flow: HIGH - Verified with official Microsoft documentation (admin consent endpoint, GDAP Graph API)
- Database provisioning: HIGH - T-SQL CREATE DATABASE with elastic pool is the standard approach
- Pitfalls: HIGH - Based on official docs warnings and known Entra ID/Azure SQL behaviors

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (30 days -- stable APIs, well-documented)
