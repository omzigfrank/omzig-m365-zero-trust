# Phase 1: Foundation and Authentication - Research

**Researched:** 2026-03-10
**Domain:** TypeScript monorepo, Azure platform services, Entra ID authentication, multi-tenant data isolation
**Confidence:** HIGH

## Summary

Phase 1 builds the foundational platform for the Omzig M365 Zero Trust Auditor: a Turborepo + pnpm monorepo hosting a Next.js frontend and Hono API backend, both deployed to Azure Container Apps. Authentication uses Microsoft Entra ID with MSAL React on the frontend and Hono JWK middleware on the backend for JWT validation. The data layer uses Azure SQL Elastic Pool with per-tenant database isolation via Drizzle ORM (MSSQL dialect). Secrets are stored in Azure Key Vault and accessed via managed identity using `@azure/identity`. Azure SignalR Service (serverless mode) provides the real-time notification channel for future phases.

The existing codebase has a working MSAL React integration (login, token acquisition, redirect flow) and a Next.js App Router structure with Tailwind CSS. These are directly reusable. The current app is a static export (`output: "export"`) targeting Azure Static Web Apps -- this must change to `output: "standalone"` for Container Apps deployment with SSR support. The existing Azure Functions (PowerShell) remain alongside the new Hono TypeScript API; they serve different purposes (event-driven workloads vs. core API).

**Primary recommendation:** Use Turborepo + pnpm workspaces with three apps (`web`, `api`, `functions`) and three shared packages (`@omzig/db`, `@omzig/shared`, `@omzig/tsconfig`). Use Drizzle ORM beta with MSSQL dialect for the data layer. Use Hono JWK middleware pointing at the Entra ID JWKS endpoint for backend token validation. Use Azure SQL TDE (enabled by default) plus application-level encryption via Key Vault for sensitive columns instead of SQL Always Encrypted (which has no Node.js/tedious driver support).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Four roles: Owner, Admin, Analyst, Read-only (expanded from original 3-role spec)
- Roles assigned via Entra ID app roles as the base level
- Per-tenant role overrides stored in the control plane database -- both upgrade and downgrade allowed
- Tenant access is explicit -- users see NO tenants until an Admin/Owner grants access
- New users join via platform invite from Admin/Owner
- Multiple Owners allowed per org (like GitHub org owners)
- Multi-org SaaS model with shared infrastructure and org-level isolation (org_id on control plane tables)
- Per-tenant databases within the elastic pool for client audit data (separate from the shared control plane DB)
- Platform-enforced MFA validation -- checks MFA claims in JWT token, defense-in-depth beyond Entra CA policies
- Per-org configurable session timeout (within platform-defined min/max bounds)
- First user triggers setup wizard -> becomes initial Owner -> creates their org
- Track "last active" per user with auto-disable after configurable inactivity period
- Full audit trail: every action logged with who, when, IP, and what changed
- Per-tenant database created automatically on onboarding (zero manual steps)
- Control plane database lives inside the elastic pool (shared with tenant DBs)
- Tenant database names are opaque/UUID-based (no PII leakage in infrastructure)
- On-demand connections (open/close per request) -- not connection pooling
- Database migrations run automatically on app startup for both control plane and tenant DBs
- Always Encrypted for sensitive columns (tenant tokens, credentials, PII)
- Azure SQL automatic backups for disaster recovery
- Health check endpoint verifies database, elastic pool, Key Vault, and all service dependencies
- Corporate/enterprise visual tone -- clean, professional, muted colors
- Light theme only for v1
- Primary brand color: blue (trust/security)
- Full technical error details shown to users (MSPs are technical)
- Graceful degradation when downstream services are unavailable

### Claude's Discretion
- Read-only user visibility into remediation guidance (recommendation: show guidance text, hide "Apply" button)
- Exact session timeout min/max bounds
- Observability dashboard layout and metrics prioritization
- Error message copywriting and tone
- Loading states and skeleton screens
- Exact setup wizard UI components and transitions

### Deferred Ideas (OUT OF SCOPE)
- API keys for programmatic access -- v2
- MSP custom branding (logo, colors) -- v2
- Dark mode -- v2
- Prometheus/OpenTelemetry external metrics endpoint -- v2
- Anomaly detection on audit results -- v2
- Per-tenant connection pooling -- revisit if on-demand connections become a bottleneck
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-01 | Next.js frontend deployed to Azure Container Apps | Next.js `output: "standalone"` + Docker multi-stage build + Container Apps Bicep module |
| INFRA-02 | Core API/audit engine runs on Azure Container Apps (Hono framework) | Hono v4.x on Node.js + Docker + Container Apps Bicep module with system-assigned managed identity |
| INFRA-03 | Event-driven workloads run on Azure Functions | Existing PowerShell Functions infrastructure already deployed; Bicep modules already exist |
| INFRA-04 | Azure SQL Elastic Pool with per-tenant databases for data isolation | Drizzle ORM (MSSQL beta) + `mssql` driver + dynamic DB connection factory + Elastic Pool Bicep |
| INFRA-05 | Azure SignalR Service (serverless mode) for real-time dashboard updates | SignalR Bicep module provisioning; client integration deferred to Phase 5 but service must exist |
| INFRA-06 | Azure Key Vault for all secrets and tenant token encryption | `@azure/keyvault-secrets` + `@azure/identity` DefaultAzureCredential + Key Vault Bicep module |
| INFRA-07 | TypeScript monorepo (Turborepo + pnpm) with shared packages | Turborepo config + pnpm workspaces + `@omzig/db`, `@omzig/shared`, `@omzig/tsconfig` packages |
| AUTH-01 | MSP admins authenticate via Microsoft Entra ID | MSAL React (existing) extended with app role claim parsing + Entra ID app registration with roles |
| AUTH-02 | MFA is enforced for all users | Platform-enforced MFA validation: check `amr` claim in JWT for `mfa` value in Hono middleware |
| AUTH-03 | App-level RBAC with roles | Entra app roles (Owner/Admin/Analyst/Read-only) + per-tenant overrides in control plane DB |
| AUTH-04 | Client tenant tokens encrypted at rest using Key Vault / Always Encrypted | Key Vault for token storage + TDE at-rest encryption (Always Encrypted not supported by tedious driver) |
| AUTH-05 | All service-to-service communication uses managed identities | System-assigned managed identity on Container Apps + RBAC role assignments for Key Vault, SQL, SignalR |
| AUTH-07 | Database access uses private endpoints | VNet integration for Container Apps + private endpoint for Azure SQL + Private DNS Zone |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 14.2.x (existing) | Frontend framework | Already in codebase; App Router with `src/app/` structure |
| Hono | 4.12.x | Backend API framework | Ultrafast, Web Standards-based, built-in JWK middleware for Entra ID token validation |
| Drizzle ORM | 1.0.0-beta.2+ | Database ORM for MSSQL | Native MSSQL support, type-safe schema, migration tooling via drizzle-kit |
| mssql (node-mssql) | 11.x | SQL Server driver | Standard Node.js driver for Azure SQL; used by Drizzle MSSQL dialect |
| Turborepo | 2.x | Monorepo orchestration | Task caching, parallel execution, dependency-aware builds |
| pnpm | 9.x | Package manager | Workspace support, symlink strategy, disk-efficient |
| @azure/msal-browser | 3.27.x (existing) | Frontend auth | Already integrated; Entra ID authentication with redirect flow |
| @azure/msal-react | 2.1.x (existing) | React auth hooks | Already integrated; MsalProvider + useAuth hook pattern |
| @azure/identity | 4.x | Azure SDK credential | DefaultAzureCredential for managed identity auth to Key Vault, SQL |
| @azure/keyvault-secrets | 4.x | Key Vault client | Secret storage and retrieval for tenant tokens, connection strings |
| @microsoft/signalr | 8.x | SignalR client | Real-time notifications on frontend |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @hono/node-server | 1.x | Hono Node.js adapter | Required to run Hono on Node.js (vs. Bun/Deno) |
| zod | 3.x | Schema validation | Request body validation in Hono routes, shared type definitions |
| tsx | 4.x | TypeScript execution | Development script runner (replaces ts-node) |
| Tailwind CSS | 3.4.x (existing) | CSS framework | Already in codebase; utility-first styling |
| clsx | 2.x (existing) | Class merging | Already in codebase; conditional CSS classes |
| lucide-react | 0.468.x (existing) | Icons | Already in codebase; enterprise-grade icon set |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Drizzle ORM | Prisma | Prisma has better MSSQL maturity but heavier runtime, less control over raw SQL, and no built-in dynamic multi-DB switching |
| Drizzle ORM | Kysely | Kysely is production-stable MSSQL but lacks built-in migration tooling; Drizzle provides generate+migrate workflow |
| Hono | Express/Fastify | Express is more mature but heavier; Hono is 12x faster, has built-in JWK middleware, smaller bundle |
| Azure SQL | PostgreSQL (Flexible Server) | PostgreSQL has better Node.js ecosystem support but Azure SQL Elastic Pool is specifically designed for per-tenant isolation SaaS pattern and is a locked decision |
| Always Encrypted | Key Vault encryption + TDE | Always Encrypted has zero Node.js driver support; Key Vault envelope encryption achieves same goal with full TypeScript compatibility |

**Installation (root):**
```bash
pnpm add -D turborepo
```

**Installation (apps/api):**
```bash
pnpm add hono @hono/node-server @azure/identity @azure/keyvault-secrets zod
pnpm add drizzle-orm@beta mssql
pnpm add -D drizzle-kit@beta @types/mssql tsx typescript
```

**Installation (apps/web):**
```bash
# Existing deps already installed; add SignalR client
pnpm add @microsoft/signalr
```

**Installation (packages/db):**
```bash
pnpm add drizzle-orm@beta mssql @azure/identity
pnpm add -D drizzle-kit@beta @types/mssql typescript
```

## Architecture Patterns

### Recommended Project Structure
```
omzig-m365-zero-trust/
├── apps/
│   ├── web/                      # Next.js frontend (moved from /web)
│   │   ├── src/
│   │   │   ├── app/              # App Router pages
│   │   │   ├── components/       # UI components
│   │   │   ├── hooks/            # React hooks (useAuth, etc.)
│   │   │   └── lib/              # Utilities (msal.ts, etc.)
│   │   ├── Dockerfile
│   │   ├── next.config.mjs
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── api/                      # Hono backend API
│       ├── src/
│       │   ├── index.ts          # Hono app entry point
│       │   ├── middleware/       # Auth, RBAC, tenant context, error handling
│       │   │   ├── auth.ts       # JWK token validation
│       │   │   ├── rbac.ts       # Role-based route protection
│       │   │   ├── tenant.ts     # Per-request tenant context
│       │   │   └── error.ts      # Global error handler
│       │   ├── routes/           # Route handlers
│       │   │   ├── auth.ts       # /api/auth/* (me, roles)
│       │   │   ├── tenants.ts    # /api/tenants/* (CRUD)
│       │   │   ├── health.ts     # /api/health (readiness + liveness)
│       │   │   └── setup.ts      # /api/setup/* (wizard state)
│       │   └── services/         # Business logic
│       │       ├── user.ts       # User management
│       │       ├── org.ts        # Organization management
│       │       └── tenant-db.ts  # Dynamic tenant DB provisioning
│       ├── Dockerfile
│       ├── drizzle.config.ts
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── db/                       # Shared database schemas + connection factory
│   │   ├── src/
│   │   │   ├── control-plane/    # Control plane schema (orgs, users, roles, tenants)
│   │   │   │   └── schema.ts
│   │   │   ├── tenant/           # Tenant DB schema (audit results, findings)
│   │   │   │   └── schema.ts
│   │   │   ├── connection.ts     # Dynamic DB connection factory
│   │   │   └── index.ts          # Package exports
│   │   ├── drizzle/              # Migration output
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   ├── shared/                   # Shared types, constants, utilities
│   │   ├── src/
│   │   │   ├── types/            # Role types, API response types
│   │   │   ├── constants/        # Role permissions, error codes
│   │   │   └── index.ts
│   │   └── package.json
│   └── tsconfig/                 # Shared TypeScript configs
│       ├── base.json
│       ├── nextjs.json
│       ├── node.json
│       └── package.json
├── bicep/                        # Existing + new Bicep modules
│   ├── main.bicep                # Existing
│   ├── platform/                 # NEW: Platform infrastructure
│   │   ├── container-apps.bicep  # Container Apps Environment + apps
│   │   ├── sql-elastic-pool.bicep # SQL Server + Elastic Pool + control plane DB
│   │   ├── keyvault.bicep        # Key Vault + access policies
│   │   ├── signalr.bicep         # SignalR Service (serverless mode)
│   │   ├── vnet.bicep            # VNet + subnets + private endpoints
│   │   ├── acr.bicep             # Azure Container Registry
│   │   └── main-platform.bicep   # Composition module
│   ├── identity/                 # Existing
│   ├── devices/                  # Existing
│   ├── security/                 # Existing
│   └── data/                     # Existing
├── functions/                    # Existing Azure Functions (PowerShell)
├── turbo.json                    # Turborepo configuration
├── pnpm-workspace.yaml           # pnpm workspace definition
├── package.json                  # Root package.json
└── .env.example                  # Environment variable template
```

### Pattern 1: Hono JWK Authentication Middleware for Entra ID
**What:** Validates Bearer tokens from MSAL React against Entra ID's JWKS endpoint
**When to use:** Every authenticated API route
**Example:**
```typescript
// Source: https://hono.dev/docs/middleware/builtin/jwk
import { Hono } from 'hono';
import { jwk } from 'hono/jwk';

const TENANT_ID = process.env.AZURE_TENANT_ID;

const app = new Hono();

// Validate Entra ID JWT tokens
app.use('/api/*', jwk({
  jwks_uri: `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`,
  alg: ['RS256'],
  verification: {
    iss: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
    aud: process.env.AZURE_CLIENT_ID,
  },
}));

// Access validated claims
app.get('/api/me', (c) => {
  const payload = c.get('jwtPayload');
  return c.json({
    name: payload.name,
    email: payload.preferred_username,
    roles: payload.roles ?? [],  // Entra app roles
  });
});
```

### Pattern 2: RBAC Middleware with Per-Tenant Overrides
**What:** Custom Hono middleware that checks app roles from JWT + per-tenant overrides from control plane DB
**When to use:** Route-level authorization for role-restricted endpoints
**Example:**
```typescript
// Custom RBAC middleware
import { createMiddleware } from 'hono/factory';
import type { Role } from '@omzig/shared';

export function requireRole(...allowedRoles: Role[]) {
  return createMiddleware(async (c, next) => {
    const payload = c.get('jwtPayload');
    const appRoles: string[] = payload.roles ?? [];

    // Check base app roles from Entra ID
    const hasBaseRole = allowedRoles.some(role => appRoles.includes(role));

    // Check per-tenant overrides if tenant context exists
    const tenantId = c.req.header('X-Tenant-Id');
    if (tenantId) {
      const override = await getTenantRoleOverride(payload.oid, tenantId);
      if (override && allowedRoles.includes(override.role)) {
        await next();
        return;
      }
    }

    if (!hasBaseRole) {
      return c.json({ error: 'Forbidden', code: 'INSUFFICIENT_ROLE' }, 403);
    }

    await next();
  });
}

// Usage on routes
app.get('/api/tenants', requireRole('Owner', 'Admin'), (c) => { ... });
app.post('/api/tenants/:id/audit', requireRole('Owner', 'Admin', 'Analyst'), (c) => { ... });
app.get('/api/tenants/:id/findings', requireRole('Owner', 'Admin', 'Analyst', 'Read-only'), (c) => { ... });
```

### Pattern 3: Dynamic Per-Tenant Database Connection
**What:** Create Drizzle ORM instances dynamically per request, connecting to the correct tenant database
**When to use:** Any API route that accesses tenant-specific audit data
**Example:**
```typescript
// packages/db/src/connection.ts
import { drizzle } from 'drizzle-orm/node-mssql';
import mssql from 'mssql';
import * as tenantSchema from './tenant/schema';

// Control plane connection (singleton)
let controlPlanePool: mssql.ConnectionPool | null = null;

export async function getControlPlaneDb() {
  if (!controlPlanePool) {
    controlPlanePool = await mssql.connect(process.env.CONTROL_PLANE_CONNECTION_STRING!);
  }
  return drizzle({ client: controlPlanePool, schema: controlPlaneSchema });
}

// Tenant DB connection (on-demand, per request)
export async function getTenantDb(tenantDbName: string) {
  // Build connection string dynamically for the specific tenant database
  const config: mssql.config = {
    server: process.env.SQL_SERVER_HOST!,
    database: tenantDbName,  // UUID-based name like "tenant_a1b2c3d4"
    authentication: {
      type: 'azure-active-directory-msi-app-service',
    },
    options: {
      encrypt: true,
      trustServerCertificate: false,
    },
  };

  const pool = await new mssql.ConnectionPool(config).connect();
  const db = drizzle({ client: pool, schema: tenantSchema });

  // Return both db and pool so caller can close the connection
  return { db, pool };
}

// Middleware pattern
export function withTenantDb() {
  return createMiddleware(async (c, next) => {
    const tenantId = c.req.header('X-Tenant-Id');
    if (!tenantId) return c.json({ error: 'Missing tenant context' }, 400);

    const tenantMeta = await lookupTenantDb(tenantId);
    const { db, pool } = await getTenantDb(tenantMeta.databaseName);

    c.set('tenantDb', db);
    try {
      await next();
    } finally {
      await pool.close();  // On-demand: close after request
    }
  });
}
```

### Pattern 4: MFA Claim Validation (Platform-Enforced)
**What:** Check JWT `amr` (authentication methods references) claim for MFA completion
**When to use:** Defense-in-depth MFA enforcement beyond Entra CA policies
**Example:**
```typescript
// middleware/mfa.ts
import { createMiddleware } from 'hono/factory';

export function requireMfa() {
  return createMiddleware(async (c, next) => {
    const payload = c.get('jwtPayload');

    // Check amr (authentication methods references) claim
    // When MFA is completed, 'mfa' appears in the amr array
    const amr: string[] = payload.amr ?? [];

    if (!amr.includes('mfa')) {
      return c.json({
        error: 'MFA Required',
        code: 'MFA_NOT_COMPLETED',
        message: 'Multi-factor authentication is required to access this platform',
      }, 403);
    }

    await next();
  });
}
```

### Pattern 5: Key Vault Secret Access via Managed Identity
**What:** Access secrets from Key Vault using DefaultAzureCredential (managed identity in production, CLI in dev)
**When to use:** Loading tenant tokens, connection strings, encryption keys
**Example:**
```typescript
// services/keyvault.ts
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';

const credential = new DefaultAzureCredential();
const vaultUrl = process.env.KEY_VAULT_URL!; // e.g., https://kv-omzig-prod.vault.azure.net

const secretClient = new SecretClient(vaultUrl, credential);

export async function getTenantToken(tenantId: string): Promise<string> {
  const secret = await secretClient.getSecret(`tenant-token-${tenantId}`);
  return secret.value!;
}

export async function storeTenantToken(tenantId: string, token: string): Promise<void> {
  await secretClient.setSecret(`tenant-token-${tenantId}`, token);
}
```

### Anti-Patterns to Avoid
- **Shared database with RLS for tenant isolation:** Per-tenant databases are a locked decision. Row-Level Security is insufficient for a security auditing tool where a bug could expose one client's security findings to another MSP client.
- **Connection pooling across tenants:** On-demand connections are a locked decision. Connection pools for many tenants with bursty workloads waste resources. Open/close per request.
- **Storing secrets in environment variables:** All secrets MUST go through Key Vault. Container Apps environment variables may contain Key Vault references, but never plaintext secrets.
- **Using `common` authority for MSAL in multi-tenant app:** The existing code uses `common` authority. For a multi-org SaaS with app roles, use tenant-specific authority or `organizations` with `accessTokenAcceptedVersion: 2` in the app registration manifest.
- **Static export for Next.js on Container Apps:** The current `output: "export"` produces static files. Container Apps needs `output: "standalone"` for SSR, API routes, and middleware support.
- **Putting Drizzle schema in the API app:** Schema belongs in `packages/db` so both the API and any future services (Functions, migration scripts) share the same type-safe schema definition.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT validation against Entra ID | Custom JWKS fetch + signature verification | Hono `jwk` middleware | Handles key rotation, caching, algorithm validation, claim verification |
| Azure credential management | Custom token acquisition logic | `@azure/identity` DefaultAzureCredential | Automatic fallback chain: managed identity -> CLI -> env vars |
| Secret storage/encryption | Custom encryption at application level | Azure Key Vault + `@azure/keyvault-secrets` | HSM-backed, audit logging, automatic rotation, FIPS 140-2 compliant |
| Database migration management | Custom SQL scripts | Drizzle Kit (`generate` + `migrate`) | Schema diffing, migration history, rollback support |
| MSAL token lifecycle | Custom token cache/refresh | `@azure/msal-browser` acquireTokenSilent | Handles cache, refresh, redirect recovery automatically |
| Request validation | Custom type checking | Zod schemas | Composable, TypeScript inference, detailed error messages |
| Monorepo build orchestration | Custom build scripts | Turborepo | Dependency graph, task caching, parallel execution |
| CSS utility framework | Custom CSS classes | Tailwind CSS (existing) | Already in codebase, consistent with existing components |

**Key insight:** Every "hand-roll" item above has edge cases that consume weeks of development. JWT key rotation alone has caused production outages at companies that built custom validation. DefaultAzureCredential's fallback chain eliminates an entire class of "works locally, fails in production" bugs.

## Common Pitfalls

### Pitfall 1: Drizzle ORM MSSQL Beta Instability
**What goes wrong:** Drizzle MSSQL support is in beta (1.0.0-beta.2). API surface may change between releases.
**Why it happens:** MSSQL was the last dialect added to Drizzle; migration tooling and query builder are newer than PostgreSQL/SQLite.
**How to avoid:** Pin exact beta versions in package.json (`"drizzle-orm": "1.0.0-beta.2"`). Run migration tests before any Drizzle version bump. Have raw SQL fallbacks for complex queries.
**Warning signs:** Type errors after `pnpm update`, migration generation producing unexpected SQL, MSSQL-specific column types not working.

### Pitfall 2: Always Encrypted Not Supported by Node.js Drivers
**What goes wrong:** The tedious driver (used by node-mssql) does not support SQL Server Always Encrypted. The `ColumnEncryption` connection option is not implemented.
**Why it happens:** Always Encrypted requires client-side encryption/decryption using column master keys. The tedious driver has not implemented this protocol.
**How to avoid:** Use Azure Key Vault for application-level encryption of sensitive values (tenant tokens, credentials). Store encrypted blobs in VARCHAR columns. Azure SQL TDE (Transparent Data Encryption, enabled by default) protects data at rest. This provides defense-in-depth: TDE for storage encryption + Key Vault for sensitive field encryption + managed identity for access control.
**Warning signs:** The CONTEXT.md specifies "Always Encrypted for sensitive columns" -- this must be adapted to the Key Vault envelope encryption pattern since the Node.js driver does not support it.

### Pitfall 3: MSAL Token Claims Type Casting
**What goes wrong:** TypeScript complains when accessing `account.idTokenClaims.roles` because the `IdTokenClaims` type does not include `roles` property.
**Why it happens:** MSAL's base type definitions use a generic `object` type for `idTokenClaims`, not including Entra-specific claim extensions.
**How to avoid:** Define a custom interface that extends `IdTokenClaims` with `roles?: string[]` and `amr?: string[]`. Cast with type assertion: `(account.idTokenClaims as ExtendedClaims).roles`.
**Warning signs:** `roles` returning `undefined` even though they appear in jwt.ms token decoder.

### Pitfall 4: Next.js Static Export Incompatible with Container Apps
**What goes wrong:** The current `next.config.mjs` has `output: "export"` which produces static HTML files. This cannot use SSR, API routes, or middleware.
**Why it happens:** The original app was deployed to Azure Static Web Apps which requires static export.
**How to avoid:** Change to `output: "standalone"` which produces a self-contained Node.js server. Use a multi-stage Docker build with `node:22-alpine` base image.
**Warning signs:** `next build` producing `out/` directory instead of `.next/standalone/`.

### Pitfall 5: Azure SQL Elastic Pool DTU/vCore Sizing
**What goes wrong:** Undersized elastic pool causes all tenant databases to throttle under load. Oversized pool wastes money.
**Why it happens:** Per-tenant databases share pool resources. Concurrent audit scans from multiple tenants can spike DTU usage.
**How to avoid:** Start with Standard tier (50 eDTUs) for development, scale based on actual usage. Monitor DTU consumption via Azure Monitor. Set per-database DTU min/max within the pool.
**Warning signs:** Slow queries, connection timeouts, `Resource ID: 1` errors in SQL logs indicating throttling.

### Pitfall 6: Hono JWK Middleware with Multi-Tenant Authority
**What goes wrong:** Using `common` or `organizations` authority in MSAL but configuring the JWK middleware with a single tenant JWKS endpoint.
**Why it happens:** If the Entra app registration allows users from multiple Entra tenants (multi-tenant app), tokens may be issued by different tenants.
**How to avoid:** For a single-tenant SaaS app (MSP's own Entra tenant): use the specific tenant ID in both MSAL authority and JWK `jwks_uri`. For multi-tenant: validate `tid` claim matches registered organizations. The SaaS model here uses a single Entra tenant (the Omzig platform tenant) so single-tenant configuration is correct.
**Warning signs:** 401 errors from JWK middleware with "invalid issuer" or "kid not found".

### Pitfall 7: Private Endpoint DNS Resolution
**What goes wrong:** Container Apps cannot resolve Azure SQL private endpoint hostname because private DNS zone is not linked to the Container Apps VNet.
**Why it happens:** Private endpoints require Private DNS Zones with A records. The DNS zone must be linked to the VNet where the client (Container Apps) runs.
**How to avoid:** Create Private DNS Zone `privatelink.database.windows.net`, link it to the Container Apps VNet, and create an A record pointing to the private endpoint IP.
**Warning signs:** Connection timeouts from Container Apps to SQL, but SQL accessible from Azure Portal Query Editor.

## Code Examples

### Turborepo Configuration
```jsonc
// turbo.json
// Source: https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository
{
  "$schema": "https://turborepo.dev/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "db:generate": {
      "cache": false
    },
    "db:migrate": {
      "cache": false
    }
  }
}
```

### pnpm Workspace Configuration
```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

### Root package.json
```json
{
  "name": "omzig-m365-zero-trust",
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "test": "turbo test"
  },
  "devDependencies": {
    "turbo": "^2.0.0"
  }
}
```

### Control Plane Database Schema
```typescript
// packages/db/src/control-plane/schema.ts
// Source: https://orm.drizzle.team/docs/get-started/mssql-new
import {
  mssqlTable, varchar, int, uniqueIdentifier, bit,
  datetime2, nvarchar
} from 'drizzle-orm/mssql-core';

export const organizations = mssqlTable('organizations', {
  id: uniqueIdentifier('id').primaryKey().defaultRandom(),
  name: nvarchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  sessionTimeoutMinutes: int('session_timeout_minutes').notNull().default(480),
  inactivityDisableDays: int('inactivity_disable_days').notNull().default(90),
  isDeleted: bit('is_deleted').notNull().default(false),
  deletedAt: datetime2('deleted_at'),
  createdAt: datetime2('created_at').notNull().defaultNow(),
  updatedAt: datetime2('updated_at').notNull().defaultNow(),
});

export const users = mssqlTable('users', {
  id: uniqueIdentifier('id').primaryKey().defaultRandom(),
  orgId: uniqueIdentifier('org_id').notNull().references(() => organizations.id),
  entraObjectId: varchar('entra_object_id', { length: 36 }).notNull().unique(),
  email: nvarchar('email', { length: 320 }).notNull(),
  displayName: nvarchar('display_name', { length: 255 }).notNull(),
  baseRole: varchar('base_role', { length: 20 }).notNull(), // Owner, Admin, Analyst, Read-only
  isActive: bit('is_active').notNull().default(true),
  lastActiveAt: datetime2('last_active_at'),
  invitedBy: uniqueIdentifier('invited_by'),
  createdAt: datetime2('created_at').notNull().defaultNow(),
  updatedAt: datetime2('updated_at').notNull().defaultNow(),
});

export const tenants = mssqlTable('tenants', {
  id: uniqueIdentifier('id').primaryKey().defaultRandom(),
  orgId: uniqueIdentifier('org_id').notNull().references(() => organizations.id),
  displayName: nvarchar('display_name', { length: 255 }).notNull(),
  tenantId: varchar('m365_tenant_id', { length: 36 }).notNull(), // M365 tenant GUID
  databaseName: varchar('database_name', { length: 128 }).notNull(), // UUID-based, opaque
  tokenSecretName: varchar('token_secret_name', { length: 255 }).notNull(), // Key Vault secret name
  isDeleted: bit('is_deleted').notNull().default(false),
  deletedAt: datetime2('deleted_at'),
  createdAt: datetime2('created_at').notNull().defaultNow(),
  updatedAt: datetime2('updated_at').notNull().defaultNow(),
});

export const tenantUserAccess = mssqlTable('tenant_user_access', {
  id: uniqueIdentifier('id').primaryKey().defaultRandom(),
  userId: uniqueIdentifier('user_id').notNull().references(() => users.id),
  tenantId: uniqueIdentifier('tenant_id').notNull().references(() => tenants.id),
  roleOverride: varchar('role_override', { length: 20 }), // null = use base role
  grantedBy: uniqueIdentifier('granted_by').notNull(),
  createdAt: datetime2('created_at').notNull().defaultNow(),
});

export const auditLog = mssqlTable('audit_log', {
  id: uniqueIdentifier('id').primaryKey().defaultRandom(),
  orgId: uniqueIdentifier('org_id').notNull(),
  userId: uniqueIdentifier('user_id').notNull(),
  action: varchar('action', { length: 100 }).notNull(),
  resourceType: varchar('resource_type', { length: 50 }).notNull(),
  resourceId: varchar('resource_id', { length: 100 }),
  details: nvarchar('details', { length: 4000 }),
  ipAddress: varchar('ip_address', { length: 45 }),
  correlationId: varchar('correlation_id', { length: 36 }),
  createdAt: datetime2('created_at').notNull().defaultNow(),
});

export const setupWizardState = mssqlTable('setup_wizard_state', {
  id: uniqueIdentifier('id').primaryKey().defaultRandom(),
  orgId: uniqueIdentifier('org_id').notNull().references(() => organizations.id),
  currentStep: int('current_step').notNull().default(1),
  totalSteps: int('total_steps').notNull().default(6),
  stepsCompleted: nvarchar('steps_completed', { length: 500 }), // JSON array of completed step numbers
  isComplete: bit('is_complete').notNull().default(false),
  updatedAt: datetime2('updated_at').notNull().defaultNow(),
});
```

### Hono API Entry Point
```typescript
// apps/api/src/index.ts
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { jwk } from 'hono/jwk';
import { requireMfa } from './middleware/mfa';
import { requireRole } from './middleware/rbac';
import { errorHandler } from './middleware/error';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { tenantRoutes } from './routes/tenants';

const app = new Hono();

// Global error handler
app.onError(errorHandler);

// CORS for frontend
app.use('*', cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  credentials: true,
}));

// Health check (unauthenticated)
app.route('/api/health', healthRoutes);

// JWT validation for all /api/* routes except health
app.use('/api/*', jwk({
  jwks_uri: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/discovery/v2.0/keys`,
  alg: ['RS256'],
  verification: {
    iss: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/v2.0`,
    aud: process.env.AZURE_CLIENT_ID,
  },
}));

// MFA enforcement
app.use('/api/*', requireMfa());

// Authenticated routes
app.route('/api/auth', authRoutes);
app.route('/api/tenants', tenantRoutes);

const port = parseInt(process.env.PORT ?? '8080', 10);
serve({ fetch: app.fetch, port });
console.log(`API server running on port ${port}`);
```

### Dockerfile for Hono API
```dockerfile
# apps/api/Dockerfile
# Source: https://dev.to/code42cate/how-to-dockerize-and-deploy-a-hono-app-4mi9
FROM node:22-alpine AS base

FROM base AS builder
WORKDIR /app
COPY package.json tsconfig.json ./
COPY src ./src
RUN npm ci && npm run build && npm prune --production

FROM base AS runner
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && adduser -S hono -u 1001
COPY --from=builder --chown=hono:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=hono:nodejs /app/dist ./dist
USER hono
EXPOSE 8080
CMD ["node", "dist/index.js"]
```

### Dockerfile for Next.js Frontend
```dockerfile
# apps/web/Dockerfile
# Source: https://nextjs.org/docs/app/getting-started/deploying
FROM node:22-alpine AS base

FROM base AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
```

### MSAL Configuration with App Roles
```typescript
// apps/web/src/lib/msal.ts (updated)
import { Configuration, LogLevel, PublicClientApplication } from "@azure/msal-browser";

const msalConfig: Configuration = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_MSAL_CLIENT_ID || "",
    // Use specific tenant, not "common" -- this is a single-tenant SaaS app
    authority: `https://login.microsoftonline.com/${process.env.NEXT_PUBLIC_AZURE_TENANT_ID}`,
    redirectUri: process.env.NEXT_PUBLIC_MSAL_REDIRECT_URI || "http://localhost:3000",
    postLogoutRedirectUri: "/",
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message) => {
        if (level === LogLevel.Error) {
          console.error("[MSAL]", message);
        }
      },
      logLevel: LogLevel.Error,
      piiLoggingEnabled: false,
    },
  },
};

// Scopes for the backend API (not Graph API directly)
export const apiScopes = [
  `api://${process.env.NEXT_PUBLIC_MSAL_CLIENT_ID}/access_as_user`,
];

export const loginRequest = {
  scopes: apiScopes,
};

export const msalInstance = new PublicClientApplication(msalConfig);

// Extended claims type for Entra app roles
export interface OmzigTokenClaims {
  roles?: string[];
  amr?: string[];
  name?: string;
  preferred_username?: string;
  oid?: string;
  tid?: string;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Express.js for Node.js APIs | Hono (Web Standards) | 2023-2024 | 12x faster, built-in middleware, multi-runtime |
| Sequelize/TypeORM for SQL | Drizzle ORM | 2024 | Type-safe, SQL-like API, better DX, lighter |
| Azure Static Web Apps for Next.js | Azure Container Apps | 2024-2025 | Full SSR support, custom containers, scaling |
| Custom JWT validation | Hono JWK middleware | 2024 | Built-in JWKS fetch, key rotation, claim validation |
| npm/yarn for monorepos | pnpm + Turborepo | 2023-2024 | Faster installs, better caching, task orchestration |
| Connection string secrets in env vars | Key Vault references + managed identity | 2023+ | Zero secrets in code, audit logging, rotation |

**Deprecated/outdated:**
- `output: "export"` in Next.js when targeting Container Apps (use `"standalone"`)
- `@azure/msal-browser` v2 (v3 is current, already in project)
- `common` authority in MSAL for SaaS apps with app roles (use tenant-specific or `organizations`)
- Direct Graph API scopes in MSAL when calling a backend API (use API-specific scopes, backend calls Graph with its own identity)

## Open Questions

1. **Drizzle ORM MSSQL Beta Stability**
   - What we know: Drizzle MSSQL support is in beta (v1.0.0-beta.2). Core CRUD and migrations work. The API is documented.
   - What's unclear: Edge cases with MSSQL-specific types (uniqueIdentifier, datetime2), transaction support, and connection pool lifecycle.
   - Recommendation: Pin exact version, write integration tests early, have raw SQL fallback for complex operations. Monitor Drizzle releases.

2. **Always Encrypted Adaptation**
   - What we know: The CONTEXT.md specifies "Always Encrypted for sensitive columns" but the tedious driver has zero support for this feature.
   - What's unclear: Whether the user considers Key Vault envelope encryption an acceptable alternative that satisfies the intent.
   - Recommendation: Implement Key Vault-based encryption for sensitive fields (tenant tokens, credentials) + TDE for at-rest encryption. This achieves the same security outcome. Flag to user that SQL Always Encrypted specifically is not viable with Node.js.

3. **Monorepo Migration Strategy**
   - What we know: The existing `/web` directory must move to `/apps/web` within the Turborepo structure.
   - What's unclear: Whether to do a big-bang migration or incremental move.
   - Recommendation: Big-bang migration in the first plan wave. The existing web app has limited code (a few pages, components, hooks). Move and verify before building new features.

4. **Control Plane DB Connection: Pool vs On-Demand**
   - What we know: Per-tenant connections are on-demand (locked decision). The control plane DB is used on every request (auth, role lookup, tenant resolution).
   - What's unclear: Whether the control plane DB should also use on-demand connections or maintain a persistent pool.
   - Recommendation: Use a persistent connection pool for the control plane DB (it handles every request) and on-demand connections only for tenant databases. This matches the "bursty audit workloads" rationale.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | none -- see Wave 0 |
| Quick run command | `pnpm --filter api test` |
| Full suite command | `pnpm test` (Turborepo runs all) |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-07 | Turborepo builds all packages and apps | smoke | `pnpm build` | -- Wave 0 |
| AUTH-01 | Entra ID JWT token accepted by Hono JWK middleware | unit | `pnpm --filter api test -- --run auth.test.ts` | -- Wave 0 |
| AUTH-02 | MFA claim validation rejects tokens without `mfa` in `amr` | unit | `pnpm --filter api test -- --run mfa.test.ts` | -- Wave 0 |
| AUTH-03 | RBAC middleware enforces role-based route access | unit | `pnpm --filter api test -- --run rbac.test.ts` | -- Wave 0 |
| AUTH-04 | Key Vault stores/retrieves tenant tokens | integration | `pnpm --filter api test -- --run keyvault.test.ts` | -- Wave 0 |
| AUTH-05 | Managed identity authenticates to Key Vault and SQL | integration | Manual verification in deployed environment | N/A |
| AUTH-07 | SQL accessible only via private endpoint | integration | Manual verification via Bicep deployment | N/A |
| INFRA-04 | Tenant DB created in elastic pool, data isolated | integration | `pnpm --filter db test -- --run tenant-isolation.test.ts` | -- Wave 0 |
| INFRA-01 | Next.js builds and serves with standalone output | smoke | `pnpm --filter web build` | -- Wave 0 |
| INFRA-02 | Hono API starts, responds to health check | smoke | `pnpm --filter api test -- --run health.test.ts` | -- Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter api test`
- **Per wave merge:** `pnpm test` (full Turborepo test pipeline)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/api/vitest.config.ts` -- Vitest configuration for API
- [ ] `packages/db/vitest.config.ts` -- Vitest configuration for DB package
- [ ] `apps/api/src/__tests__/auth.test.ts` -- JWT validation tests
- [ ] `apps/api/src/__tests__/mfa.test.ts` -- MFA claim tests
- [ ] `apps/api/src/__tests__/rbac.test.ts` -- RBAC middleware tests
- [ ] `apps/api/src/__tests__/health.test.ts` -- Health endpoint tests
- [ ] `packages/db/src/__tests__/tenant-isolation.test.ts` -- Tenant DB isolation tests
- [ ] Framework install: `pnpm add -D vitest @vitest/ui` (in api and db packages)

## Sources

### Primary (HIGH confidence)
- [Hono JWK Middleware docs](https://hono.dev/docs/middleware/builtin/jwk) - JWK configuration, claim validation, JWKS URI
- [Hono JWT Middleware docs](https://hono.dev/docs/middleware/builtin/jwt) - Algorithm support, payload access
- [Drizzle ORM MSSQL getting started](https://orm.drizzle.team/docs/get-started/mssql-new) - Schema definition, connection setup, migrations
- [Drizzle ORM MSSQL docs](https://orm.drizzle.team/docs/get-started-mssql) - Driver configuration, pool usage
- [Drizzle ORM migrations](https://orm.drizzle.team/docs/migrations) - generate, migrate, push commands
- [Azure SQL Elastic Pool overview](https://learn.microsoft.com/en-us/azure/azure-sql/database/elastic-pool-overview) - Per-tenant isolation pattern, DTU sizing
- [Azure Container Apps managed identity](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity) - System-assigned identity configuration
- [Azure Key Vault authentication](https://learn.microsoft.com/en-us/azure/key-vault/general/authentication) - DefaultAzureCredential pattern
- [Turborepo repository structure](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository) - apps/packages convention
- [Microsoft MSAL React app roles sample](https://github.com/Azure-Samples/ms-identity-javascript-react-tutorial/blob/main/5-AccessControl/1-call-api-roles/README.md) - App role configuration, claim parsing
- [Hono Node.js getting started](https://hono.dev/docs/getting-started/nodejs) - serve-static, Dockerfile, production build

### Secondary (MEDIUM confidence)
- [Tedious driver Always Encrypted limitation](https://learn.microsoft.com/en-us/answers/questions/5635585/tedious-driver-connect-sql-server-that-enabled-alw) - Confirmed no Always Encrypted support in Node.js
- [MSAL idTokenClaims roles TypeScript issue](https://github.com/AzureAD/microsoft-authentication-library-for-js/issues/3870) - Type casting workaround for roles
- [Azure SQL TDE vs Always Encrypted](https://azure.microsoft.com/en-us/blog/transparent-data-encryption-or-always-encrypted/) - When to use each approach
- [Azure SQL private endpoint with Bicep](https://learn.microsoft.com/en-us/azure/private-link/create-private-endpoint-bicep) - Private endpoint Bicep template
- [Container Apps VNet integration](https://learn.microsoft.com/en-us/azure/container-apps/how-to-use-private-endpoint) - Subnet requirements (/27 minimum)
- [Azure SignalR serverless with Functions](https://learn.microsoft.com/en-us/azure/azure-signalr/signalr-concept-azure-functions) - Negotiate function pattern

### Tertiary (LOW confidence)
- [Drizzle multi-tenant PoC with multiple databases](https://gist.github.com/gyopiazza/70919f2c97a01d1b9897057d11fb9933) - Community example of per-request DB switching; needs validation with MSSQL
- [drizzle-multitenant package](https://github.com/mateusflorez/drizzle-multitenant) - Third-party package; may not support MSSQL dialect

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified via official docs; Hono and Drizzle have official MSSQL/JWK documentation
- Architecture: HIGH - Turborepo + pnpm monorepo is well-documented; per-tenant DB pattern is Azure's recommended SaaS architecture
- Pitfalls: HIGH - Always Encrypted limitation confirmed via Microsoft Q&A and GitHub issues; MSAL type issue confirmed via GitHub issue tracker
- Data layer: MEDIUM - Drizzle MSSQL is beta; core features verified but edge cases unknown
- Private endpoints: MEDIUM - Bicep templates verified via Microsoft docs but specific Container Apps + SQL integration needs deployment testing

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (30 days -- Drizzle MSSQL beta may release new versions)
