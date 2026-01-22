# Omzig M365 Zero Trust Deployment – Project Overview

## 1. Vision

Build an Azure Marketplace **Managed Application** that can deploy and configure a complete Microsoft 365 environment (similar to Nerdio-style automation) for any tenant, with:

- NSA-aligned **Zero Trust** implementation across the key pillars (Identity, Device, Data, Visibility, Automation).
- **HIPAA-aware** configuration options for healthcare and other regulated customers.
- Deep **Microsoft Defender** integration (mail, endpoints, cloud apps).
- An **interactive deployment wizard** (no manual JSON editing).
- A design that is **repeatable and scalable** across many tenants and re-sellable to MSPs.

Primary goals:

- Use it internally at **Omzig** to standardize and accelerate secure M365 deployments.
- License / resell it to other MSPs via Azure Marketplace and CSP/ISV models.

---

## 2. Scope of the MVP

### In Scope (v1)

- Azure **Managed Application** package:
  - `mainTemplate.json` (generated from Bicep).
  - `createUiDefinition.json` (parameter collection wizard).
- Infrastructure as Code using **Bicep** for:
  - Identity/Entra ID–related configuration where supported by ARM.
  - Device and endpoint security baselines (Intune + Defender hooks where feasible).
  - Logging and monitoring (Log Analytics, basic alerts).
- Parameter-driven deployment that prompts for:
  - Tenant/organization info (name, domain, size, region).
  - M365 SKUs and Defender tiers.
  - Security baseline level (Standard / Enhanced / Maximum).
  - Compliance options (HIPAA on/off, retention).
- Initial **Microsoft Defender** configuration:
  - Defender for Office 365 (mail protection).
  - Defender for Endpoint baseline integration (agent/onboarding assumptions).
- Basic **Zero Trust–aligned** defaults:
  - MFA required (configurable).
  - Conditional Access policy templates.
  - Minimum encryption and logging baselines.
- A simple but functional **CI/CD pipeline** to:
  - Validate and build Bicep.
  - Package and publish the managed app definition to a test environment.

### Out of Scope (v1, future phases)

- Full AVD/virtual desktop automation.
- Rich SOAR playbooks and advanced incident response.
- Deep industry-specific templates beyond a couple of starter “bundles”.
- Full-blown MSP portal UI (beyond what Marketplace + Lighthouse provide).
- Co-sell readiness packaging and marketing collateral (handled later in GTM).

---

## 3. Target Users

- **Internal Omzig engineers/consultants**
  - Use the wizard to deploy secure, consistent M365 environments quickly.
  - Avoid writing or editing ARM/JSON directly.

- **External MSP partners (later phase)**
  - Consume the solution via Azure Marketplace.
  - Optionally resell as part of their managed services offering.
  - Benefit from standardized Zero Trust and compliance baselines.

---

## 4. High-Level Architecture

Core components:

- **Bicep modules** (`/bicep`)
  - `main.bicep` composing per-pillar modules.
  - Identity, devices, security, data, logging modules.

- **Managed Application package** (`/managed-app`)
  - Compiled `mainTemplate.json` (from Bicep).
  - `createUiDefinition.json` (Azure Portal wizard).

- **Orchestration** (`/functions` – later MVP phase)
  - Azure Functions for:
    - Post-deployment M365 configuration via Microsoft Graph.
    - Any steps not directly supported via ARM/Bicep.

- **Pipelines** (`/pipelines`)
  - Build pipeline: validate Bicep, compile, package.
  - Release pipeline: publish/update the managed app.

- **Docs** (`/docs`)
  - NSA Zero Trust mapping to implementation.
  - HIPAA-related configuration notes.
  - Runbooks for internal Omzig deployment.

---

## 5. MVP Success Criteria

The MVP is “good enough” when:

1. An engineer can:
   - Go to Azure portal → Marketplace → this offer.
   - Fill out the wizard (no manual JSON).
   - Deploy a working baseline M365/Defender/Zero-Trust-aligned setup into a test tenant.

2. The deployment is:
   - **Repeatable**: same inputs → same outcome.
   - **Parameterizable**: works for small and larger org sizes via parameters.
   - **Auditable**: basic logs exist for what was deployed and when.

3. Omzig can:
   - Use it internally for at least 1–2 tenants.
   - See a clear reduction in engineering effort vs. manual builds.
   - Demonstrate a credible path to packaging it for external MSPs.

---

## 6. Constraints & Assumptions

- We will lean on **Bicep + ARM** for infrastructure, and **Graph API**/Functions for gaps.
- Initial focus is **commercial Azure** tenants (not GCC High, etc.).
- HIPAA alignment is configuration-centric (encryption, logging, retention, DLP), not a full legal/compliance package.
- No secrets stored in source control; everything secret goes into **Key Vault** or Marketplace parameters.

---

## 7. Phasing (Condensed)

- **Phase 1** – Bicep skeleton & architecture wiring.
- **Phase 2** – Identity + security baselines (Zero Trust focus).
- **Phase 3** – `createUiDefinition.json` wizard.
- **Phase 4** – Functions orchestration & packaging.
- **Phase 5** – Test deployments in Omzig tenants.
- **Phase 6** – Marketplace offer definition (test environment).

This file is a high-level spec for Claude Code and humans. Detailed technical rules live in `CLAUDE.md`, and task-by-task planning in `TASKS.md`.
