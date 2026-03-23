# Omzig M365 Zero Trust Auditor

## What This Is

A web-based Microsoft 365 Zero Trust auditing platform that assesses tenant security configurations against NIST frameworks and CISA SCuBA standards, provides risk-scored findings with granular remediation, and monitors for configuration drift in real time. Built for managed service providers (MSPs) who need to audit, remediate, and continuously monitor multiple client tenants from a single pane of glass.

## Core Value

MSPs can see exactly where every client tenant falls short of Zero Trust compliance, fix it with confidence (auto-fix or guided steps), and know immediately when something drifts back.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Audit M365 tenant configurations against CISA SCuBA baselines (Entra ID, Exchange Online, SharePoint/OneDrive, Teams, Defender)
- [ ] Audit configurations against NIST 800-207 (Zero Trust Architecture), NIST 800-53 (Security Controls), and NIST CSF 2.0
- [ ] Score each finding with severity (Critical/High/Medium/Low) and pass/fail per control
- [ ] Calculate overall compliance scores per tenant with historical trending
- [ ] Auto-remediate safe configuration changes via Graph API with MSP approval
- [ ] Provide step-by-step guided remediation for risky changes (e.g., CA policies that could lock users out)
- [ ] Detect configuration drift in real time via Graph API webhook/change notifications
- [ ] Multi-tenant dashboard with tenant health grid (compliance scores, red/yellow/green status)
- [ ] Alert/action queue across all tenants for drift events and failed checks
- [ ] Tenant onboarding via OAuth consent flow or GDAP/Lighthouse delegated access
- [ ] Interactive drill-down from tenant → category → finding → remediation
- [ ] Exportable reports (PDF/CSV) for client-facing compliance documentation
- [ ] Entra ID authentication with app-level RBAC (Admin, Analyst, Read-only)

### Out of Scope

- Deploying new M365 environments from scratch — this tool audits and remediates existing environments
- On-premises Active Directory auditing — M365/cloud-only scope
- Non-Microsoft cloud platforms (AWS, GCP) — M365 and Azure-scoped
- Custom compliance framework authoring — ships with NIST and CISA SCuBA, extensibility deferred

## Context

- This repo already contains M365 Zero Trust deployment infrastructure (Bicep modules, Azure Functions for CA policies, Intune, Defender, DLP). The auditing tool replaces the deploy-first approach with an audit-first model: assess what's there, fix what's wrong, then monitor for drift.
- Existing work includes a Next.js + Azure Static Web Apps audit app foundation, 133 CISA SCuBA control definitions, and 35 NIST ZTA checks already defined in the codebase.
- CISA SCuBA covers: Entra ID (AAD), Exchange Online, SharePoint/OneDrive, Teams, and Defender for Office 365.
- NIST coverage spans three frameworks: 800-207 (Zero Trust Architecture), 800-53 (Security and Privacy Controls), and CSF 2.0 (Cybersecurity Framework).
- The tool itself must practice what it preaches — Zero Trust principles applied to its own infrastructure.

## Constraints

- **Security**: Per-tenant database isolation (Azure SQL Elastic Pools) — no shared tables across tenants. Managed identities for all service-to-service communication. No secrets in code. Private endpoints for data layer. Always Encrypted for sensitive columns (tenant tokens, credentials).
- **Tech Stack**: Next.js frontend, Azure Container Apps for core API/audit engine, Azure Functions for event-driven workloads (webhook receivers, scheduled scans, remediation execution). Azure SQL Elastic Pools with per-tenant databases.
- **Auth**: Entra ID with MFA enforced via Conditional Access. App-level RBAC roles: Admin, Analyst, Read-only. Managed identities everywhere — no stored secrets.
- **Graph API**: Minimum-privilege scopes per tenant. Client tenant tokens encrypted at rest. OAuth consent and GDAP/Lighthouse both supported for tenant onboarding.
- **Compliance Standards**: Must accurately map findings to NIST 800-207, NIST 800-53, NIST CSF 2.0, and all CISA SCuBA M365 product baselines.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Audit-first instead of deploy-first | MSPs need to assess existing tenants, not just deploy new ones. Audit → remediate → monitor is the natural workflow. | — Pending |
| Per-tenant databases over shared DB with RLS | Security tool must have strongest possible tenant isolation. A bug in RLS could expose one tenant's security findings to another. Elastic Pools manage cost. | — Pending |
| Split backend: Container Apps + Functions | Container Apps for stateful API/WebSocket support (real-time drift alerts). Functions for event-driven workloads (webhooks, scheduled scans). Each service plays to its strengths. | — Pending |
| Real-time drift via Graph webhooks over scheduled scans | MSPs need to know immediately when a client's CA policy gets disabled, not find out at next week's scan. Proactive > reactive. | — Pending |
| Auto-fix safe changes, guided steps for risky ones | CA policy changes can lock out entire orgs. Safe changes (e.g., enabling DKIM) auto-fix with approval. Risky changes (e.g., device compliance CA) get step-by-step guidance. | — Pending |

---
*Last updated: 2025-03-10 after initialization*
