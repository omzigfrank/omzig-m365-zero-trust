# Technology Stack

**Project:** Omzig M365 Zero Trust Auditor
**Researched:** 2026-03-10
**Overall Confidence:** HIGH -- the chosen stack aligns well with the problem domain; specific version and library recommendations verified against current sources.

---

## Recommended Stack

### Core Framework -- Frontend

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Next.js | 16.x (latest stable: 16.1) | Full-stack React framework, SSR/SSG, App Router | Already chosen. Correct call -- App Router with Server Components enables server-side Graph API calls without exposing tokens to the browser. Turbopack in 16.x makes dev fast. Azure Container Apps supports containerized Next.js well. | HIGH |
| React | 19.x | UI library | Ships with Next.js 16. Server Components and Actions are stable and production-ready. | HIGH |
| TypeScript | 5.7+ | Type safety across full stack | Non-negotiable for a security product. Catches Graph API shape mismatches at compile time. | HIGH |

### Core Framework -- Backend API

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Azure Container Apps | GA (current) | Hosts the core API/audit engine + Next.js frontend | Already chosen. Correct call -- scale-to-zero cuts cost during off-hours, built-in Dapr support for service-to-service, managed identity for Key Vault/SQL, private endpoints for data isolation. Superior to App Service for this use case because of scale-to-zero and container flexibility. | HIGH |
| Node.js | 22 LTS | Runtime for API server | LTS release, supported by Azure Functions and Container Apps. Use the same runtime across frontend and backend to share code. | HIGH |
| Hono | 4.x | Lightweight HTTP framework for API routes | Ultra-fast, runs anywhere (Container Apps, Functions, Edge). Smaller and faster than Express. Built-in TypeScript. Middleware ecosystem (CORS, auth, validation) is mature. If you want something more familiar, Fastify 5.x is the fallback -- but Hono is the better pick for a new project in 2026. | MEDIUM |

### Event-Driven / Background Processing

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Azure Functions | Runtime v4, Node.js v4 programming model | Webhook receivers, scheduled scans, remediation execution | Already chosen. Correct call -- v4 TypeScript model eliminates function.json boilerplate, supports timer triggers for scheduled scans, HTTP triggers for Graph webhook notifications. Scale-to-zero means you only pay when scanning. | HIGH |
| Azure Service Bus | Standard tier | Reliable message queue for remediation jobs | Use instead of Redis queues or Azure Queue Storage. Service Bus provides guaranteed FIFO delivery, dead-letter queues for failed remediations, sessions for per-tenant ordering, and 256 KB messages (vs 64 KB for Storage queues). Critical for remediation jobs where ordering and exactly-once delivery matter. | HIGH |

### Database

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Azure SQL Elastic Pools | General Purpose tier, 50 eDTUs starting | Per-tenant audit databases | Already chosen. Correct call for security isolation -- a bug in RLS cannot leak one tenant's compliance findings to another. Elastic Pools make per-tenant DBs cost-effective: 50 tenants averaging 1-2 eDTUs each can share a 50-eDTU pool. Use the catalog pattern (a central DB mapping tenantId -> connectionString). | HIGH |
| Azure SQL (single DB) | General Purpose | Catalog/platform database | Stores tenant metadata, user accounts, subscription info, webhook registrations. Separate from tenant audit data. | HIGH |
| Prisma ORM | 7.x | TypeScript ORM for Azure SQL | Only viable TypeScript ORM with SQL Server support -- Drizzle does NOT support SQL Server. Prisma 7 removed the Rust engine (pure TypeScript), 70% faster type-checking, and has first-class Azure SQL support via @prisma/adapter-mssql. | HIGH |

### Authentication & Authorization

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @azure/msal-browser | 4.x | Browser-side Entra ID auth (SPA flow) | Already in use (v3.x in existing code). Required for Entra ID -- no alternative. MSAL is Microsoft's official library and the only way to get delegated tokens for Graph API consent flows. Upgrade to v4 for MSAL-browser improvements. | HIGH |
| @azure/msal-node | 3.x | Server-side token acquisition | For the API backend to acquire app-only tokens for Graph API calls. Required for confidential client flows (client_credentials). | HIGH |
| App-level RBAC via Entra ID App Roles | N/A | Admin / Analyst / Read-only roles | Already chosen. Define app roles in the app registration, assign to users/groups in Entra. Token includes roles claim. Middleware validates role on each request. No need for a separate RBAC library. | HIGH |

**Why NOT Auth.js / Better Auth / NextAuth:** These are general-purpose auth libraries. This project exclusively uses Entra ID -- MSAL is the only correct choice for: (1) acquiring Graph API tokens with incremental consent, (2) handling GDAP/delegated admin flows, (3) multi-tenant app registrations, (4) app role claims. Auth.js cannot do any of these. Auth.js recently merged with Better Auth, adding further instability concerns.

### Microsoft Graph API

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @microsoft/microsoft-graph-client | 3.0.7 (stable) | HTTP client for Graph API | Stable, handles auth middleware, batching, throttle retry. The newer @microsoft/msgraph-sdk (1.0.0-preview) is still in preview -- do NOT use in production. Stick with the stable client. | HIGH |
| @microsoft/microsoft-graph-types | Latest | TypeScript types for Graph entities | Dev dependency. Provides type definitions for CA policies, Intune configs, etc. | HIGH |
| Direct REST calls via fetch | N/A | For beta endpoints and specialized queries | Some audit checks require beta endpoints (Identity Protection, advanced Intune). Use the Graph client for v1.0, direct fetch for beta with typed response interfaces. | HIGH |

### Real-Time & Communication

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Azure SignalR Service | Serverless mode | Real-time drift alerts to dashboard | Managed WebSocket service. Serverless mode means no hub server needed -- Azure Functions can send messages directly. The Next.js frontend connects via @microsoft/signalr client. This avoids running a persistent WebSocket server in Container Apps. | HIGH |
| @microsoft/signalr | 8.x | Client library for SignalR | Official Microsoft client. Auto-reconnect, fallback transports (WebSocket -> SSE -> long-polling). | HIGH |

### UI Components & Styling

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Tailwind CSS | 4.x | Utility-first CSS | Already in use (v3.x). Upgrade to v4 for OKLCH colors, @theme directive, faster builds. Dominant CSS approach for Next.js in 2026. | HIGH |
| shadcn/ui | Latest (uses Tailwind v4 + React 19) | Component library | Copy-paste components, not a dependency. Full control over component code. Dashboard templates available. Works with Tailwind v4. Use the chart components (built on Recharts) for compliance dashboards. | HIGH |
| Recharts | 2.x | Charts for compliance scores, trends | shadcn/ui chart components use Recharts under the hood. Simpler than D3, adequate for bar/line/pie/radar charts needed for compliance dashboards. No need for Tremor (acquired by Vercel, uncertain future) or Nivo (overkill). | MEDIUM |
| Lucide React | Latest | Icons | Already in use. Comprehensive icon set, tree-shakeable. | HIGH |

### Validation & Schema

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Zod | 4.x | Runtime schema validation + TypeScript type inference | Validate API payloads, audit check definitions, tenant configs. 2kb core bundle. Use z.infer<> to derive types from schemas -- single source of truth for shapes. Integrates with Prisma via zod-prisma-types for DB model validation. | HIGH |

### PDF / Report Generation

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @react-pdf/renderer | 4.x | PDF compliance reports | React component model for PDFs. Runs server-side in Container Apps. Type-safe, composable. Better than Puppeteer (heavy Chrome dependency) or jsPDF (low-level, already in codebase but limited). Replace jsPDF with this for structured compliance reports. | MEDIUM |

### Secrets & Configuration

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Azure Key Vault | GA | Secrets management | Tenant OAuth tokens, connection strings, API keys. Container Apps can reference Key Vault secrets directly via managed identity. No secrets in environment variables or code. | HIGH |
| @azure/identity | 4.x | DefaultAzureCredential for service auth | Single credential class works locally (Azure CLI) and in production (managed identity). Use for Key Vault, SQL, Service Bus auth. | HIGH |
| @azure/keyvault-secrets | 4.x | Key Vault SDK | Read/write tenant tokens to Key Vault. Combined with managed identity via @azure/identity. | HIGH |

### Monitoring & Observability

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Application Insights | GA | APM, distributed tracing, metrics | Built into Azure Container Apps and Functions. Auto-instruments Node.js. Track audit execution times, Graph API call latency, error rates per tenant. | HIGH |
| @azure/monitor-opentelemetry | 1.x | OpenTelemetry auto-instrumentation | Official Azure OpenTelemetry distro. Auto-instruments HTTP, SQL, and custom spans. Ships traces to Application Insights. | MEDIUM |

### Infrastructure as Code

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Azure Bicep | Latest | Infrastructure deployment | Already used in this repo. Continue using for Container Apps, Functions, SQL, Key Vault, SignalR, Service Bus definitions. ARM is the build output only. | HIGH |

### CI/CD

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| GitHub Actions or Azure DevOps YAML | Latest | Build, test, deploy pipelines | Existing repo uses Azure DevOps YAML -- continue with that. Add stages for: lint/type-check, unit tests, Prisma migrate, Docker build, deploy to Container Apps. | HIGH |

### Monorepo Management

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Turborepo | 2.x | Monorepo task runner | Share types, Zod schemas, and Graph API helpers between Next.js frontend, API backend, and Azure Functions. Turborepo caching dramatically speeds CI. pnpm workspaces for dependency management. Use --filter for targeted builds. | MEDIUM |
| pnpm | 9.x | Package manager | Required for Turborepo. Faster installs, strict dependency resolution, disk-efficient. Use hoisted mode for Azure Functions (no symlinks). | MEDIUM |

---

## Monorepo Structure

```
omzig-m365-zero-trust/
  apps/
    web/                    # Next.js 16 frontend (Container Apps)
    api/                    # Hono API server (Container Apps)
    functions/              # Azure Functions (webhooks, scheduled scans)
  packages/
    shared/                 # Shared types, Zod schemas, constants
    graph-client/           # Graph API client wrapper + typed helpers
    audit-engine/           # Core audit evaluation logic (framework-agnostic)
    db/                     # Prisma schema, migrations, client
  infrastructure/
    bicep/                  # Azure Bicep templates
    pipelines/              # CI/CD definitions
  turbo.json
  pnpm-workspace.yaml
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| API Framework | Hono | Express 5.x | Express is heavier, slower cold starts in Functions. Hono is 3x faster and purpose-built for modern runtimes. |
| API Framework | Hono | Fastify 5.x | Fastify is solid but heavier than Hono. For a new project in 2026, Hono's portability (runs in Functions, Container Apps, Edge) is the better bet. |
| ORM | Prisma 7 | Drizzle ORM | Drizzle does NOT support SQL Server / Azure SQL. Non-starter. |
| ORM | Prisma 7 | TypeORM | TypeORM has stale development, heavier API, worse TypeScript inference. Prisma 7's pure TS engine is faster. |
| Queue | Azure Service Bus | Azure Queue Storage | No FIFO guarantee, 64KB message limit, no dead-letter queues. Inadequate for remediation job reliability. |
| Queue | Azure Service Bus | BullMQ + Redis | Requires Azure Cache for Redis (retiring Sep 2028, migrating to Azure Managed Redis). Adds unnecessary infrastructure. Service Bus is native Azure, serverless, and triggers Functions directly. |
| Real-time | Azure SignalR Service | Raw WebSockets in Container Apps | Requires persistent connections, sticky sessions, and manual reconnection logic. SignalR Service handles all of this. Serverless mode integrates with Functions. |
| Auth | MSAL (@azure/msal-*) | Auth.js / NextAuth v5 | Cannot handle Graph API token acquisition, incremental consent, GDAP flows, or app role claims. Wrong tool for enterprise Entra ID. |
| Auth | MSAL (@azure/msal-*) | Better Auth | Same issues as Auth.js. Recently merged with Auth.js, adding confusion. No Entra ID-specific support. |
| Charts | Recharts (via shadcn/ui) | Tremor | Tremor acquired by Vercel, uncertain roadmap. Recharts via shadcn/ui gives the same result with more control. |
| Charts | Recharts (via shadcn/ui) | Nivo | Overkill for compliance dashboards. Nivo excels at exotic chart types we don't need. |
| PDF | @react-pdf/renderer | Puppeteer | Puppeteer requires headless Chrome (1GB+ container), slow, heavy. @react-pdf/renderer is lightweight and composable. |
| PDF | @react-pdf/renderer | jsPDF | Already in codebase but low-level. No component model. Hard to maintain complex compliance report layouts. |
| Hosting (Frontend) | Azure Container Apps | Azure Static Web Apps | SWA has limited Next.js 16 support (no streaming, no middleware). Container Apps runs the full Next.js server. |
| Hosting (API) | Azure Container Apps | Azure App Service | No scale-to-zero, higher base cost. Container Apps is purpose-built for containerized APIs. |
| Database | Azure SQL Elastic Pools | Cosmos DB | Compliance audit data is relational (controls map to frameworks, findings have foreign keys). Document DB adds impedance mismatch. SQL is the right model. |
| Database | Azure SQL Elastic Pools | PostgreSQL (Azure Database) | Azure SQL has better Elastic Pool support for per-tenant isolation. PostgreSQL Flexible Server pools are less mature. Prisma supports both, but Azure SQL is the better fit in the Azure ecosystem. |

---

## Graph API Permissions Matrix (Audit-Scoped)

The auditing platform needs READ-ONLY permissions for audit checks, plus limited WRITE for remediation:

| Permission | Type | Purpose | Audit / Remediation |
|------------|------|---------|---------------------|
| Policy.Read.All | Application | Read CA policies, auth methods | Audit |
| Policy.Read.ConditionalAccess | Application | Read CA policy details | Audit |
| Directory.Read.All | Application | Read directory objects, roles | Audit |
| SecurityEvents.Read.All | Application | Read security alerts, incidents | Audit |
| DeviceManagementConfiguration.Read.All | Application | Read Intune compliance policies | Audit |
| DeviceManagementManagedDevices.Read.All | Application | Read device compliance state | Audit |
| Reports.Read.All | Application | Read usage/security reports | Audit |
| AuditLog.Read.All | Application | Read audit logs | Audit |
| MailboxSettings.Read | Application | Read Exchange Online settings | Audit |
| Sites.Read.All | Application | Read SharePoint config | Audit |
| Team.ReadBasic.All | Application | Read Teams policies | Audit |
| Policy.ReadWrite.ConditionalAccess | Application | Modify CA policies | Remediation |
| DeviceManagementConfiguration.ReadWrite.All | Application | Modify Intune policies | Remediation |
| Organization.Read.All | Application | Read tenant org info | Audit |
| Domain.Read.All | Application | Read domain/DKIM/DMARC config | Audit |
| Application.Read.All | Application | Read app registrations | Audit |
| InformationProtectionPolicy.Read.All | Application | Read DLP/sensitivity labels | Audit |

**Key principle:** Audit permissions are always Application-type (app-only, no user context needed). Remediation permissions are granted only when the MSP explicitly enables remediation for a tenant.

---

## Installation

```bash
# Initialize monorepo
pnpm init
npx create-turbo@latest

# Core dependencies (apps/web)
pnpm add next@16 react@19 react-dom@19

# Auth
pnpm add @azure/msal-browser@4 @azure/msal-react@3

# Graph API
pnpm add @microsoft/microsoft-graph-client@3
pnpm add -D @microsoft/microsoft-graph-types

# UI
pnpm add tailwindcss@4 lucide-react
npx shadcn@latest init

# API (apps/api)
pnpm add hono@4
pnpm add @azure/identity@4 @azure/keyvault-secrets@4

# Database (packages/db)
pnpm add prisma@7 @prisma/client@7 @prisma/adapter-mssql
pnpm add -D prisma

# Validation
pnpm add zod@4

# Real-time
pnpm add @microsoft/signalr@8

# PDF Reports
pnpm add @react-pdf/renderer@4

# Azure Functions (apps/functions)
pnpm add @azure/functions@4

# Observability
pnpm add @azure/monitor-opentelemetry@1

# Dev dependencies (root)
pnpm add -D typescript@5.7 @types/node@22 vitest@3 @vitest/coverage-v8
```

---

## Key Version Decisions

| Package | Pinned Version | Why This Version | Upgrade Path |
|---------|---------------|------------------|--------------|
| Next.js | 16.x | Latest stable (16.1). Turbopack stable. React 19 support. | Follow major releases. |
| Prisma | 7.x | Pure TypeScript engine (no Rust). 70% faster type-checks. | Breaking changes between majors -- follow upgrade guide. |
| Zod | 4.x | 2kb core, z.xor() for exclusive unions. | Stable API, minor upgrades safe. |
| MSAL Browser | 4.x | Latest stable for Entra ID SPA flows. | Microsoft maintains. Follow their release notes. |
| Hono | 4.x | Stable, fast, multi-runtime. | Minor upgrades safe. Watch for v5. |
| @azure/functions | 4.3+ | v4 programming model (no function.json). | Follow Azure updates. |

---

## Architecture Decision: Why NOT a Unified PowerShell Backend

The existing repo has Azure Functions in PowerShell. The new auditing platform should use TypeScript throughout. Reasons:

1. **Type safety across the stack.** Graph API responses are complex nested objects. TypeScript catches shape mismatches that PowerShell silently ignores.
2. **Shared code.** Audit check definitions, Zod schemas, and Graph API helpers can be shared between frontend, API, and Functions in a TypeScript monorepo. PowerShell cannot share code with Next.js.
3. **Performance.** Node.js Functions have faster cold starts than PowerShell Functions (PowerShell loads the full .NET runtime + PS modules).
4. **Ecosystem.** npm has 2M+ packages. PowerShell Gallery is limited for web application concerns (PDF generation, real-time, validation).
5. **Hiring.** TypeScript developers are more available than PowerShell developers for web application roles.

The existing PowerShell Functions remain for the deployment tool. The new auditing platform is a separate TypeScript codebase that shares the same repo but different deployment targets.

---

## Sources

- [Next.js 16.1 Release Blog](https://nextjs.org/blog/next-16-1)
- [Next.js Deployment Guide](https://nextjs.org/docs/app/getting-started/deploying)
- [Azure Container Apps 2025 Guide](https://kunaldaskd.medium.com/azure-container-apps-your-complete-2025-guide-to-serverless-container-deployment-de6ef2ef1f1a)
- [Azure SQL Elastic Pools Multi-tenant Patterns](https://learn.microsoft.com/en-us/azure/azure-sql/database/saas-tenancy-app-design-patterns?view=azuresql)
- [Azure SQL Elastic Pool Overview](https://learn.microsoft.com/en-us/azure/azure-sql/database/elastic-pool-overview?view=azuresql)
- [Prisma ORM 7 Announcement](https://www.prisma.io/blog/announcing-prisma-orm-7-0-0)
- [Prisma SQL Server Support](https://www.prisma.io/docs/orm/overview/databases/sql-server)
- [Drizzle vs Prisma Comparison (2026)](https://www.bytebase.com/blog/drizzle-vs-prisma/)
- [Microsoft Graph SDK Installation](https://learn.microsoft.com/en-us/graph/sdks/sdk-installation)
- [Graph API Change Notifications](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks)
- [Graph API Subscription Lifecycle](https://learn.microsoft.com/en-us/graph/change-notifications-lifecycle-events)
- [Azure SignalR Service](https://azure.microsoft.com/en-us/products/signalr-service)
- [Azure Functions Node.js v4 Model](https://learn.microsoft.com/en-us/azure/azure-functions/functions-reference-node)
- [Auth.js Microsoft Entra ID Provider](https://authjs.dev/getting-started/providers/microsoft-entra-id)
- [MSAL Browser npm](https://www.npmjs.com/package/@azure/msal-browser)
- [Azure Container Apps Managed Identity](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity)
- [Azure Key Vault Secrets in Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets)
- [Zod Documentation](https://zod.dev/)
- [shadcn/ui Tailwind v4 Support](https://ui.shadcn.com/docs/tailwind-v4)
- [CISA ScubaGear](https://github.com/cisagov/ScubaGear)
- [Azure Service Bus vs Storage Queues](https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-azure-and-service-bus-queues-compared-contrasted)
- [Azure Cache for Redis Retirement Notice](https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-cache)
- [@azure/identity npm](https://www.npmjs.com/package/@azure/identity)
