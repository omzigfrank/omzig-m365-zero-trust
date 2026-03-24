# Technology Stack

**Analysis Date:** 2026-03-23

## Languages

**Primary:**
- TypeScript 5.7+ - All Node.js applications (`apps/api`, `apps/web`, `packages/*`)
- PowerShell 7.4+ - Azure Functions orchestration layer (`functions/`)

**Secondary:**
- Bicep - Infrastructure as Code (`bicep/`)
- JSON/ARM - Build output and Marketplace templates (`managed-app/mainTemplate.json`)

## Runtime

**Environment:**
- Node.js 22 (Alpine) - API and web containers (see `apps/api/Dockerfile`, `apps/web/Dockerfile`)
- PowerShell 7.4+ - Azure Functions worker runtime (`functions/host.json` `extensionBundle` v4.x)

**Package Manager:**
- pnpm 9.0.0 (pinned in `package.json` `packageManager` field)
- Lockfile: `pnpm-lock.yaml` present
- Workspace config: `pnpm-workspace.yaml` - includes `apps/*` and `packages/*`

## Frameworks

**Core (API):**
- Hono 4.x (`@hono/node-server`) - HTTP framework for `apps/api`; runs on Node.js server adapter
- Zod 3.23 - Request validation in `apps/api`

**Core (Web):**
- Next.js 14.x - Frontend framework for `apps/web`; configured for static export (`output: "export"`) in `apps/web/next.config.mjs`
- React 18.3 - UI library

**Styling:**
- Tailwind CSS 3.4 - Utility-first CSS
- PostCSS 8.4 - CSS processing (`apps/web/postcss.config.js`)

**Database:**
- Drizzle ORM (beta) - Used across `packages/db`, `apps/api`, `packages/audit`
- Dialect: MSSQL (`drizzle-orm/node-mssql` with `mssql` v11 client)
- Migration tool: `drizzle-kit` v0.30 (`packages/db/drizzle.config.ts`)

**Build/Monorepo:**
- Turborepo 2.x - Monorepo task orchestration (`turbo.json`, `turbo` devDependency in root `package.json`)
- TypeScript composite project references - Packages export from `dist/` with declaration files

**Testing:**
- Vitest 2.x - Test runner for all TypeScript packages and apps
- Pester - Unit test framework for PowerShell Functions (`functions/Tests/`)

## Key Dependencies

**Critical (API):**
- `@azure/identity` ^4.0.0 - `DefaultAzureCredential` for managed identity auth (Key Vault, SQL)
- `@azure/keyvault-secrets` ^4.0.0 - Secret retrieval and storage in `apps/api/src/services/keyvault.ts`
- `@azure/keyvault-keys` ^4.0.0 - RSA-OAEP envelope encryption for sensitive columns
- `@azure/msal-node` ^5.0.6 - Confidential client application for OAuth admin consent flow
- `jsonwebtoken` ^9.0.3 - JWT signing for Azure SignalR REST API authentication
- `mssql` ^11.0.0 - MSSQL client (via `packages/db`)

**Critical (Web):**
- `@azure/msal-browser` ^3.27.0 - MSAL public client for Entra ID authentication
- `@azure/msal-react` ^2.1.0 - React wrapper for MSAL
- `@microsoft/signalr` ^8.0.0 - WebSocket client for real-time audit progress streaming
- `exceljs` ^4.4.0 - Excel report export
- `jspdf` ^2.5.2 + `jspdf-autotable` ^3.8.4 - PDF report generation
- `recharts` ^3.8.0 - Charts/visualizations on audit and dashboard pages

**Critical (Audit package):**
- `@microsoft/microsoft-graph-client` ^3.0.7 - Graph API SDK for M365 data collection
- `@microsoft/microsoft-graph-types` + `@microsoft/microsoft-graph-types-beta` - Type definitions

**Critical (PowerShell Functions):**
- `Microsoft.Graph.Authentication` 2.x - Graph PowerShell SDK auth
- `Microsoft.Graph.Identity.SignIns` 2.x - Conditional Access policies
- `Microsoft.Graph.Identity.DirectoryManagement` 2.x - Roles and groups
- `Microsoft.Graph.DeviceManagement` 2.x - Intune compliance policies
- `Microsoft.Graph.Security` 2.x - Defender configuration
- `Az.Accounts` 2.x - Azure authentication
- `Az.Resources` 6.x - ARM resource management
- `Az.KeyVault` 5.x - Key Vault access from Functions

## Configuration

**Environment Variables (API - from `.env.example`):**
- `AZURE_TENANT_ID` - Entra tenant for JWT validation
- `AZURE_CLIENT_ID` - App registration client ID
- `FRONTEND_URL` - CORS allowed origin (default: `http://localhost:3000`)
- `PORT` - API server port (default: `8080`)
- `SQL_SERVER_HOST` - Azure SQL server hostname
- `CONTROL_PLANE_DB_NAME` - Control plane database name
- `KEY_VAULT_URL` - Azure Key Vault URL
- `SIGNALR_CONNECTION_STRING` - Azure SignalR Service connection string
- `OAUTH_CLIENT_ID` / `OAUTH_CLIENT_SECRET` / `OAUTH_REDIRECT_URI` - Admin consent flow credentials
- `SIGNALR_ENDPOINT` / `SIGNALR_ACCESS_KEY` - SignalR serverless push

**Environment Variables (Web - build-time ARGs in `apps/web/Dockerfile`):**
- `NEXT_PUBLIC_MSAL_CLIENT_ID` - MSAL client ID
- `NEXT_PUBLIC_AZURE_TENANT_ID` - Entra tenant for MSAL
- `NEXT_PUBLIC_MSAL_REDIRECT_URI` - OAuth redirect URI
- `NEXT_PUBLIC_API_URL` - Backend API base URL

**Build:**
- `tsconfig.json` files in each package extend `packages/tsconfig/base.json`
- Base tsconfig: ES2022 target, Node16 module resolution, strict mode, composite builds
- `turbo.json` defines build pipeline with output caching for `.next/**` and `dist/**`
- Bicep: `bicep/main.bicep` compiles to `managed-app/mainTemplate.json` via `az bicep build`

## Platform Requirements

**Development:**
- Node.js 22+, pnpm 9.0.0+
- PowerShell 7.4+ (for Functions local dev)
- Azure CLI with Bicep extension (for IaC validation)
- SQL Server (local) or Azure SQL (remote) for DB dev

**Production:**
- Azure Container Apps (API + Web, from Dockerfiles)
- Azure Functions (Consumption plan, PowerShell runtime) - `func-omzig-zerotrust`
- Azure SQL Elastic Pool (MSSQL, multi-tenant database per tenant)
- Azure Static Web Apps (alternative web hosting, `apps/web/out/staticwebapp.config.json` present)

---

*Stack analysis: 2026-03-23*
