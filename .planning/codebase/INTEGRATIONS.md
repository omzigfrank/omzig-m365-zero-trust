# External Integrations

**Analysis Date:** 2026-03-23

## APIs & External Services

**Microsoft Graph API:**
- Used for: M365 tenant auditing (Conditional Access, devices, security, sensitivity labels, roles, PIM)
- SDK (TypeScript): `@microsoft/microsoft-graph-client` v3 in `packages/audit/src/collectors/graph-client.ts`
- SDK (PowerShell): `Microsoft.Graph.*` modules in `functions/requirements.psd1`
- API versions: v1.0 for Conditional Access and Security; beta for Intune/Device Management and Identity Protection
- Auth (TypeScript path): Delegated access token obtained via MSAL; passed to `Client.init()` in `packages/audit/src/collectors/graph-client.ts`
- Auth (PowerShell path): Managed identity via `Connect-MgGraph -Identity` in Azure Functions
- Scopes (client audit): `Directory.Read.All`, `Policy.Read.All`, `DeviceManagementManagedDevices.Read.All`, `Reports.Read.All`, `Domain.Read.All`, `Application.Read.All`, `RoleManagement.Read.Directory`, `UserAuthenticationMethod.Read.All`, `InformationProtectionPolicy.Read` — defined in `apps/web/src/lib/msal.ts`
- Scopes (server functions): `Policy.ReadWrite.ConditionalAccess`, `DeviceManagementConfiguration.ReadWrite.All`, `SecurityEvents.ReadWrite.All`, `InformationProtectionPolicy.ReadWrite.All`

**Microsoft GDAP (Granular Delegated Admin Privileges):**
- Used for: MSP onboarding — verifying delegated admin relationships to customer M365 tenants
- Implementation: `apps/api/src/services/gdap-verification.ts`
- API endpoint: Graph API v1.0 `/tenantRelationships/delegatedAdminRelationships/{id}`
- Auth: Uses MSP's Graph token (from `Authorization` header) to query the relationship

**Microsoft Entra ID (OAuth 2.0 / OIDC):**
- Used for: MSP user authentication (frontend) and multi-tenant admin consent (tenant onboarding)
- Frontend auth: MSAL browser (`@azure/msal-browser` v3, `@azure/msal-react` v2) in `apps/web/src/lib/msal.ts`
  - Flow: Authorization Code + PKCE (public client)
  - Authority: `https://login.microsoftonline.com/{NEXT_PUBLIC_AZURE_TENANT_ID}`
  - Token cache: `sessionStorage`
- Admin consent flow: MSAL Node (`@azure/msal-node` v5, `ConfidentialClientApplication`) in `apps/api/src/services/oauth-consent.ts`
  - Flow: Authorization Code with `prompt=admin_consent` against `/organizations/oauth2/v2.0/authorize`
  - State signed with HMAC-SHA256 to prevent tampering
  - Code exchange via `acquireTokenByCode`
  - Env vars: `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `OAUTH_REDIRECT_URI`
- JWT validation (API): Hono `verifyWithJwks` against Entra JWKS endpoint in `apps/api/src/middleware/auth.ts`
  - JWKS URI: `https://login.microsoftonline.com/{tenantId}/discovery/v2.0/keys`
  - Algorithm: RS256; Audience: `AZURE_CLIENT_ID`

## Data Storage

**Databases:**
- Provider: Azure SQL (MSSQL)
- Client: `mssql` v11 via Drizzle ORM (`drizzle-orm/node-mssql`) in `packages/db/src/connection.ts`
- Architecture: Two-database model
  - **Control plane DB** (`CONTROL_PLANE_DB_NAME`): Singleton connection pool; stores organizations, users, tenants, wizard state. Schema in `packages/db/src/control-plane/schema.ts`
  - **Tenant DBs** (one per customer tenant): On-demand per-request connections; isolated databases in elastic pool. Schema in `packages/db/src/tenant/schema.ts`
- Auth (production): `azure-active-directory-default` auth type using managed identity (`AZURE_CLIENT_ID`)
- Auth (development): SQL auth via `SQL_USERNAME` / `SQL_PASSWORD` env vars
- Connection env vars: `SQL_SERVER_HOST`, `SQL_SERVER_PORT` (default 1433), `CONTROL_PLANE_DB_NAME`
- Migrations: `drizzle-kit migrate` command; migration files at `packages/db/src/control-plane/migrations/`

**File Storage:**
- Azure Blob Storage — used by CI/CD pipelines to store managed app `.zip` packages (`stomzigzerotrust` account)
- Azure Functions state — Azure Storage backing (`functions/host.json`)

**Caching:**
- None (Node.js layer); Turborepo build cache (local `.turbo/`) for CI optimization

## Authentication & Identity

**Auth Provider:**
- Microsoft Entra ID (Azure Active Directory)
- Implementation approach:
  - MSP users: MSAL browser public client flow (frontend) + JWKS JWT validation (API)
  - Customer tenants: Multi-tenant admin consent flow via `ConfidentialClientApplication`
  - Azure services: `DefaultAzureCredential` (managed identity in prod, CLI/env vars in dev)
- MFA enforcement: `apps/api/src/middleware/mfa.ts` checks `amr` claim in JWT for `mfa` value
- RBAC: `apps/api/src/middleware/rbac.ts` reads `roles` claim from Entra app roles

**Secrets Management:**
- Azure Key Vault
- Client: `@azure/keyvault-secrets` + `@azure/keyvault-keys` in `apps/api/src/services/keyvault.ts`
- Uses: `DefaultAzureCredential` (managed identity)
- Env var: `KEY_VAULT_URL`
- Patterns:
  - Per-tenant tokens stored as `tenant-token-{tenantId}`
  - Sensitive column encryption: RSA-OAEP envelope encryption via Key Vault key (`KEY_VAULT_KEY_NAME`, default `omzig-encryption-key`)
  - PowerShell Functions: `Az.KeyVault` 5.x for secret access

## Monitoring & Observability

**Application Insights:**
- Configured in `functions/host.json` with `applicationInsights.samplingSettings`
- `enableLiveMetricsFilters: true`
- Log levels: Information default, Error for Host.Results, Trace for Host.Aggregator
- Deployed resource: `func-omzig-zerotrust` on Azure

**Log Analytics / Sentinel:**
- Log Analytics workspace deployed via `bicep/security/security.bicep` (`log-omzig-test-security`)
- Azure Sentinel (optional) composed in security module
- HIPAA mode: 7-year (2555 day) log retention; standard mode: 365 days

**Error Tracking:**
- Console-based structured logging in Node.js API (`[INFO]`, `[WARN]`, `[ERROR]` prefixes)
- No dedicated third-party error tracking service detected

## CI/CD & Deployment

**Hosting:**
- Azure Container Apps — API (`apps/api`) and Web (`apps/web`) via Docker
- Azure Functions (Consumption plan) — PowerShell orchestration layer
- Azure Static Web Apps — web frontend alternative (config at `apps/web/out/staticwebapp.config.json`)
- Azure Managed Application — Marketplace distribution via `managed-app/`

**CI Pipeline:**
- Azure DevOps (`pipelines/azure-pipelines.yml`)
  - Stages: Validate (Bicep + UI JSON) → Build (package ZIP) → Deploy Dev (develop branch) → Deploy Prod (main branch)
  - Pool: `ubuntu-latest`
  - Artifacts: managed app ZIP uploaded to Azure Blob Storage
- Functions pipeline: `pipelines/functions-pipeline.yml` — separate Validate → Build → Deploy Dev → Deploy Prod
- Deployment target env vars: `azureServiceConnection`, `storageAccountName`, `storageAccountNameProd`

## Real-Time Communication

**Azure SignalR Service (serverless mode):**
- Used for: Streaming audit progress updates from API to browser
- Client SDK: `@microsoft/signalr` ^8.0.0 in `apps/web`
- Server implementation: `apps/api/src/services/signalr.ts`
- Pattern:
  - Client calls `GET /api/signalr/negotiate` → receives `{ url, accessToken }` scoped to user OID
  - API pushes messages via SignalR REST API: `POST {endpoint}/api/v1/hubs/audit/users/{userId}`
  - JWT signed with HMAC-SHA256 using `SIGNALR_ACCESS_KEY`
- Env vars: `SIGNALR_ENDPOINT`, `SIGNALR_ACCESS_KEY`
- Hub name: `audit`

## Webhooks & Callbacks

**Incoming:**
- `GET /api/oauth/callback` — Entra ID admin consent redirect (`apps/api/src/routes/oauth-callback.ts`)
  - Params: `code`, `state` (HMAC-signed), `error`, `error_description`
  - Env var: `OAUTH_REDIRECT_URI` must match app registration redirect URI

**Outgoing:**
- None detected in current implementation

## Azure Marketplace Integration

**Managed Application:**
- Package: `managed-app/omzig-m365-zerotrust.zip` (contains `mainTemplate.json` + `createUiDefinition.json`)
- Marketplace wizard: `managed-app/createUiDefinition.json` (6 steps: Basics, Organization, Licensing, Security Baseline, Compliance, Review)
- Portal view: `managed-app/viewDefinition.json`
- Build script: `managed-app/build-template.ps1`
- ARM template: `managed-app/mainTemplate.json` (1,722 lines, compiled from Bicep)

## Environment Configuration

**Required env vars (API production minimum):**
- `AZURE_TENANT_ID` - MSP's Entra tenant ID
- `AZURE_CLIENT_ID` - App registration client ID
- `KEY_VAULT_URL` - Azure Key Vault URL
- `SQL_SERVER_HOST` - Azure SQL server hostname
- `CONTROL_PLANE_DB_NAME` - Control plane database name
- `SIGNALR_ENDPOINT` + `SIGNALR_ACCESS_KEY` - Azure SignalR Service
- `OAUTH_CLIENT_ID` + `OAUTH_CLIENT_SECRET` + `OAUTH_REDIRECT_URI` - Multi-tenant consent app

**Required env vars (Web build-time):**
- `NEXT_PUBLIC_MSAL_CLIENT_ID`
- `NEXT_PUBLIC_AZURE_TENANT_ID`
- `NEXT_PUBLIC_MSAL_REDIRECT_URI`
- `NEXT_PUBLIC_API_URL`

**Secrets location:**
- Azure Key Vault (runtime secrets, tenant tokens, encryption keys)
- Azure DevOps variable groups (CI/CD pipeline secrets — `azureServiceConnection`, storage names)

---

*Integration audit: 2026-03-23*
