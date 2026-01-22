# Tasks

## Phase 1 – Initial code generation (Claude)

### 1.1 Folder structure
- [x] Create directory tree: `bicep/`, `bicep/identity/`, `bicep/devices/`, `bicep/security/`, `bicep/data/`, `bicep/network/`, `ui/`, `functions/`, `pipelines/`, `docs/`

### 1.2 Bicep entry point
- [x] Create `bicep/main.bicep`:
  - [x] Define common parameters (location, environmentName, orgName, hipaaEnabled, securityBaseline)
  - [x] Add placeholder module references for identity, devices, security, data, network
  - [x] Add outputs section for deployment verification

### 1.3 Stub modules (no logic, params + empty resources)
- [x] `bicep/identity/identity.bicep` – params for MFA, Conditional Access; empty resource block
- [x] `bicep/devices/devices.bicep` – params for Intune/Defender baseline; empty resource block
- [x] `bicep/security/security.bicep` – params for Defender tiers; empty resource block
- [x] `bicep/data/data.bicep` – params for DLP/encryption options; empty resource block
- [x] `bicep/network/network.bicep` – params for NSG baseline; empty resource block

### 1.4 UI skeleton
- [x] Create `ui/createUiDefinition.json`:
  - [x] Define `$schema`, `handler`, `version`
  - [x] Add steps: Basics, Organization, Licensing, Security Baseline, Compliance, Review
  - [x] Leave elements arrays empty (wiring in Phase 3)

### 1.5 Validation
- [x] Run `az bicep build -f bicep/main.bicep` – must compile without errors
- [x] Confirm folder structure matches ARCHITECTURE.md

## Phase 2 – Identity & Security

- [x] Flesh out identity.bicep with Conditional Access + MFA params.
  - [x] Added 6 CA policy templates (block legacy auth, MFA all users, MFA admins, compliant device, block high-risk users, MFA risky sign-in)
  - [x] Added MFA configuration (methods, remember device days)
  - [x] Added password policy params (min length, expiration, SSPR)
  - [x] Created managed identity for Graph API operations
  - [x] Output CA configuration object for Azure Functions consumption
- [x] Add Defender for Office 365 config.
  - [x] Safe Attachments policy (action, redirect, timeout)
  - [x] Safe Links policy (real-time scan, track clicks)
  - [x] Anti-phishing (threshold 1-4, mailbox intelligence, spoof detection)
  - [x] Anti-spam (bulk threshold, quarantine retention)
  - [x] Defender for Cloud Apps (session policies, anomaly detection)
  - [x] Log Analytics workspace with configurable retention
  - [x] Alert rules (high severity, suspicious sign-in, malware, phishing)
  - [x] Microsoft Sentinel integration (optional)
- [x] Add HIPAA toggles impacting defaults.
  - [x] identity: Shorter session timeout (8h), no MFA remember, min 14-char passwords
  - [x] security: 7-year log retention (2555 days), stricter quarantine
  - [x] devices: No compliance grace period, 8-char device passwords, 5-min lock timeout, block developer mode
  - [x] data: Block DLP mode, auto-labeling, PHI sensitivity label, 7-year retention, block external sharing

## Phase 3 – Orchestration & Packaging

- [x] Azure Functions scaffolding.
  - [x] `functions/host.json`, `requirements.psd1`, `profile.ps1`, `local.settings.json`
  - [x] `functions/Modules/GraphHelper.psm1` - Shared Graph API utilities
  - [x] `functions/Orchestrator/` - Main orchestration function
  - [x] `functions/Deploy-Identity/` - Identity pillar configuration
  - [x] `functions/Deploy-Devices/` - Device pillar configuration
  - [x] `functions/Deploy-Security/` - Security pillar configuration
  - [x] `functions/Deploy-Data/` - Data pillar configuration
- [x] createUiDefinition.json fully wired.
  - [x] Organization step (size, domain, admin email)
  - [x] Licensing step (M365 tier, Defender plans)
  - [x] Security Baseline step (Standard/Enhanced/Maximum with descriptions)
  - [x] Compliance step (HIPAA toggle, DLP, sensitivity labels, retention)
  - [x] Review step with configuration summary
- [x] Marketplace package structure.
  - [x] `managed-app/build-template.ps1` - Build script
  - [x] `managed-app/appDefinition.json` - App definition template

## Phase 4 – CI/CD Pipelines

- [x] `pipelines/azure-pipelines.yml` - Main managed app pipeline
  - [x] Validate stage (Bicep syntax, UI schema)
  - [x] Build stage (compile Bicep, create ZIP)
  - [x] Deploy Dev stage
  - [x] Deploy Prod stage
- [x] `pipelines/functions-pipeline.yml` - Functions deployment pipeline
  - [x] Validate PowerShell syntax
  - [x] PSScriptAnalyzer checks
  - [x] Deploy to Dev/Prod Function Apps

## Phase 5 – Documentation

- [x] `docs/NSA-ZERO-TRUST.md` - Full pillar mapping with implementation details
- [x] `docs/HIPAA-CONTROLS.md` - HIPAA control mapping and gap analysis
- [x] `docs/DEPLOYMENT-GUIDE.md` - Step-by-step deployment instructions

## Pending Validation

- [x] Run `az bicep build -f bicep/main.bicep` locally
- [x] Test createUiDefinition.json in Azure Portal sandbox
- [x] Deploy to test tenant

Claude should update checkboxes as work is done.

---

## Deployment Summary (2026-01-22)

### Test Deployment Completed

**Subscription**: 2025-26 MCPP Subscription
**Resource Group**: OMZIG-ZEROTRUST
**Location**: East US

### Deployed Resources

| Resource | Type | Purpose |
|----------|------|---------|
| id-omzig-test-graph | Managed Identity | Graph API authentication |
| log-omzig-test-security | Log Analytics Workspace | Security monitoring |
| stomzigzerotrust | Storage Account | Function App storage |
| func-omzig-zerotrust | Function App | M365 configuration orchestration |
| EastUSPlan | App Service Plan | Consumption plan |
| func-omzig-zerotrust | Application Insights | Monitoring |

### Deployed Functions

| Function | Endpoint | Purpose |
|----------|----------|---------|
| Orchestrator | /api/orchestrate | Main orchestration |
| Deploy-Identity | /api/deploy/identity | CA policies, MFA |
| Deploy-Devices | /api/deploy/devices | Intune compliance |
| Deploy-Security | /api/deploy/security | Defender config |
| Deploy-Data | /api/deploy/data | DLP, sensitivity labels |

### Graph API Permissions Granted

- Policy.ReadWrite.ConditionalAccess
- Policy.Read.All
- DeviceManagementConfiguration.ReadWrite.All
- DeviceManagementManagedDevices.ReadWrite.All
- SecurityEvents.ReadWrite.All

### Conditional Access Policies (via Deploy-Identity)

| Policy ID | Name | Description |
|-----------|------|-------------|
| CA001 | Block-Legacy-Auth | Blocks legacy auth protocols |
| CA002 | Require-MFA-All-Users | MFA for all users |
| CA003 | Require-MFA-Admins | MFA for admin roles |
| CA004 | Require-Compliant-Device | Device compliance required |
| CA005 | Block-High-Risk-Users | Blocks high-risk users |
| CA006 | MFA-Risky-SignIn | MFA for risky sign-ins |

### Next Steps

1. Call orchestrator endpoint to apply M365 configuration
2. Verify CA policies in Entra admin center
3. Test with pilot users before enabling policies
