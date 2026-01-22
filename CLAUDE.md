# Omzig M365 Zero Trust Deployment – Claude Code Instructions

## Goal
Build an Azure Marketplace **Managed Application** that:
- Deploys and configures a full Microsoft 365 environment
- Implements NSA Zero Trust across all 7 pillars
- Enforces HIPAA-aligned controls where selected
- Enables Microsoft Defender (mailboxes + devices)
- Uses a Marketplace wizard (createUiDefinition.json) instead of raw JSON
- Is repeatable across tenants and re-sellable to MSPs

## Tech Stack
- IaC: Azure Bicep (preferred), ARM only as build output
- Orchestration: Azure Functions (PowerShell 7 or C#)
- M365 config: Microsoft Graph API
- Marketplace UI: createUiDefinition.json
- CI/CD: Azure DevOps YAML pipelines
- Management-at-scale: Azure Lighthouse

## How you should work
1. **Always plan before coding**.
   - When asked to build something non-trivial, first:
     - Read `PROJECT.md`, `ARCHITECTURE.md`, and relevant files.
     - Propose a step-by-step plan in `TASKS.md`.
     - Wait for confirmation before large changes.

2. **Respect this structure**
   - `bicep/` for Bicep modules and `main.bicep`
   - `functions/` for Azure Functions
   - `ui/` for createUiDefinition.json
   - `pipelines/` for CI/CD YAML
   - `docs/` for NSA/HIPAA mapping and explanations

3. **Coding conventions**
   - Bicep:
     - Parameterize location, names, SKUs.
     - Use `@description`, `@allowed`, etc.
     - Use outputs for cross-module references.
   - Functions:
     - Use managed identity for Graph.
     - Log clearly; no secrets in logs.
   - No secrets in repo; assume Key Vault.

4. **Security/compliance**
   - Treat NSA Zero Trust docs (summarized in `docs/NSA-ZERO-TRUST.md`) as requirements.
   - For HIPAA:
     - Ensure encryption at rest & in transit.
     - Audit logging for access to PHI.
     - Longer retention defaults (e.g., 7 years) when HIPAA is selected.

5. **What to prioritize first**
   - Phase 1: Bicep skeleton + main.bicep.
   - Phase 2: Identity & security pillars.
   - Phase 3: createUiDefinition.json wizard.
   - Phase 4: Azure Functions orchestration.
   - Phase 5: Marketplace packaging (mainTemplate.json + UI).
   - Phase 6: Pipelines and docs.

6. **Before you say something is “done”**
   - For Bicep: `az bicep build` and `az deployment what-if` must pass (assume commands available).
   - For Functions: basic happy-path test documented.
   - Update `TASKS.md` and relevant docs.
