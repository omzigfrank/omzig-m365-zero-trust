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

## Phase 6 – Marketplace Packaging

- [x] `managed-app/mainTemplate.json` - Generated from Bicep
- [x] `managed-app/createUiDefinition.json` - Portal wizard UI
- [x] `managed-app/viewDefinition.json` - Portal view configuration
- [x] `managed-app/build-template.ps1` - Build and packaging script

---

## Phase 7 – Operational Setup (MSP Features) ✅ COMPLETE

### 7.1 User & License Provisioning
- [x] `functions/Deploy-Users/run.ps1` - User provisioning function
  - [x] Create standard security groups (All-Users, IT-Admins, Executives, etc.)
  - [x] Dynamic group creation with membership rules
  - [x] Break-glass admin account creation
  - [x] Admin role assignments
- [x] `functions/Deploy-Users/function.json` - HTTP trigger configuration

### 7.2 Exchange Online Configuration
- [x] `functions/Modules/ExchangeHelper.psm1` - Exchange Online utilities
  - [x] Certificate-based and managed identity authentication
  - [x] Mail flow rule creation
  - [x] Shared mailbox creation
  - [x] DKIM/DMARC configuration helpers
- [x] `functions/Deploy-Exchange/run.ps1` - Exchange configuration function
  - [x] Standard mail flow rules (block auto-forward, external banner, block executables, encrypt sensitive)
  - [x] HIPAA-specific PHI detection rule
  - [x] Shared mailbox documentation (info@, support@, sales@, hr@, billing@)
  - [x] DKIM setup instructions and DNS record generation
  - [x] DMARC recommendation with policy settings
  - [x] Anti-spam and anti-phishing recommendations
- [x] `functions/Deploy-Exchange/function.json` - HTTP trigger configuration

### 7.3 Device Enrollment & Autopilot
- [x] `functions/Deploy-Autopilot/run.ps1` - Autopilot configuration function
  - [x] Standard User Deployment profile (non-admin)
  - [x] IT Admin Deployment profile (admin)
  - [x] Shared Device Deployment profile (kiosk)
  - [x] Enrollment restrictions (block personal devices)
  - [x] BitLocker policy configuration
  - [x] Device categories (Corporate, Executive, Kiosk, Developer, Remote)
  - [x] OneDrive Known Folder Move documentation
- [x] `functions/Deploy-Autopilot/function.json` - HTTP trigger configuration

### 7.4 SharePoint & Teams Configuration
- [x] `functions/Deploy-Collaboration/run.ps1` - SharePoint/Teams configuration
  - [x] SharePoint sharing policies (HIPAA-aware)
  - [x] Teams meeting policies
  - [x] Teams messaging policies
  - [x] Guest access policies
  - [x] App permission policies
  - [x] Team templates documentation
  - [x] Sensitivity labels for sites/teams
- [x] `functions/Deploy-Collaboration/function.json` - HTTP trigger configuration

### 7.5 Testing Infrastructure
- [x] `functions/Tests/Deploy-Identity.Tests.ps1` - Identity function tests
  - [x] CA policy creation tests
  - [x] Break-glass group tests
  - [x] HIPAA setting tests
  - [x] Security baseline tests
- [x] `functions/Tests/Deploy-Devices.Tests.ps1` - Device function tests
  - [x] Compliance policy tests
  - [x] Platform-specific tests
  - [x] HIPAA setting tests
- [x] `functions/Tests/Mocks/GraphResponses.json` - Mock API responses

### 7.6 Reporting Module
- [x] `functions/Modules/ReportHelper.psm1` - Report generation utilities
  - [x] Get-SecureScoreReport
  - [x] Get-MfaStatusReport
  - [x] Get-LicenseUtilizationReport
  - [x] Get-DeviceComplianceReport
  - [x] Get-RiskyUsersReport
  - [x] New-ComplianceReport (comprehensive)
  - [x] Format-ReportAsMarkdown

### 7.7 Industry Compliance Templates
- [x] `templates/industries/legal.json` - Legal industry template
  - [x] Matter-based retention
  - [x] Ethical walls (information barriers)
  - [x] eDiscovery configuration
  - [x] Attorney-client privilege labels
- [x] `templates/industries/financial.json` - Financial services template
  - [x] SEC 17a-4 archiving requirements
  - [x] FINRA communication supervision
  - [x] Customer NPI protection
  - [x] Trading controls documentation
- [x] `templates/industries/education.json` - Education template
  - [x] FERPA compliance controls
  - [x] COPPA age-based restrictions
  - [x] Student vs staff policy separation
  - [x] School Data Sync configuration
- [x] `templates/industries/government.json` - Government template
  - [x] CMMC 2.0 control mapping
  - [x] NIST 800-171 requirements
  - [x] CUI handling and labeling
  - [x] Strict access controls

---

## Phase 8 – Multi-Tenant Management & Reporting (Planned)

### 8.1 Azure Lighthouse Integration
- [ ] `bicep/lighthouse/lighthouse.bicep` - Lighthouse delegation template
- [ ] `functions/Deploy-Lighthouse/run.ps1` - Multi-tenant setup function
- [ ] Cross-tenant Log Analytics configuration
- [ ] Centralized alert routing

### 8.2 Reporting Functions
- [ ] `functions/Reports/Get-SecureScore/run.ps1` - Secure Score endpoint
- [ ] `functions/Reports/Get-LicenseUsage/run.ps1` - License utilization endpoint
- [ ] `functions/Reports/Get-MfaStatus/run.ps1` - MFA registration endpoint
- [ ] `functions/Reports/Get-ComplianceStatus/run.ps1` - Compliance status endpoint

### 8.3 Documentation Generation
- [ ] `functions/Generate-Documentation/run.ps1` - As-built documentation
- [ ] As-built report template
- [ ] Security summary report template
- [ ] Compliance attestation template

### 8.4 UI Wizard Extensions
- [ ] Users & Licensing step
- [ ] Email Configuration step
- [ ] Devices & Enrollment expansion
- [ ] Collaboration step
- [ ] MSP Settings step (conditional)

---

## Pending Validation

- [x] Run `az bicep build -f bicep/main.bicep` locally
- [x] Test createUiDefinition.json in Azure Portal sandbox
- [x] Deploy to test tenant

---

## Deployment Summary (2025-01-21)

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

| Function | Endpoint | Purpose | Status |
|----------|----------|---------|--------|
| Orchestrator | /api/orchestrate | Main orchestration | ✅ Deployed |
| Deploy-Identity | /api/deploy/identity | CA policies, MFA | ✅ Deployed |
| Deploy-Devices | /api/deploy/devices | Intune compliance | ✅ Deployed |
| Deploy-Security | /api/deploy/security | Defender config | ✅ Deployed |
| Deploy-Data | /api/deploy/data | DLP, sensitivity labels | ✅ Deployed |
| Deploy-Users | /api/deploy/users | User provisioning | 🆕 New (Phase 7) |
| Deploy-Exchange | /api/deploy/exchange | Exchange Online config | 🆕 New (Phase 7) |
| Deploy-Autopilot | /api/deploy/autopilot | Device enrollment | 🆕 New (Phase 7) |
| Deploy-Collaboration | /api/deploy/collaboration | SharePoint/Teams | 🆕 New (Phase 7) |

### Graph API Permissions Granted

- Policy.ReadWrite.ConditionalAccess
- Policy.Read.All
- DeviceManagementConfiguration.ReadWrite.All
- DeviceManagementManagedDevices.ReadWrite.All
- SecurityEvents.ReadWrite.All

### Additional Permissions Needed for Phase 7

- User.ReadWrite.All (user provisioning)
- Group.ReadWrite.All (group management)
- Directory.ReadWrite.All (role assignments)
- DeviceManagementServiceConfig.ReadWrite.All (Autopilot)
- Mail.ReadWrite (Exchange configuration)
- Sites.FullControl.All (SharePoint)
- Team.Create (Teams provisioning)

### Conditional Access Policies (via Deploy-Identity)

| Policy ID | Name | Description |
|-----------|------|-------------|
| CA001 | Block-Legacy-Auth | Blocks legacy auth protocols |
| CA002 | Require-MFA-All-Users | MFA for all users |
| CA003 | Require-MFA-Admins | MFA for admin roles |
| CA004 | Require-Compliant-Device | Device compliance required |
| CA005 | Block-High-Risk-Users | Blocks high-risk users |
| CA006 | MFA-Risky-SignIn | MFA for risky sign-ins |

---

## Recent Updates (2025-01-21)

### Phase 7 Completion

1. **New Functions Created:**
   - Deploy-Users: Standard groups, break-glass accounts, role assignments
   - Deploy-Exchange: Mail flow rules, shared mailboxes, DKIM/DMARC
   - Deploy-Autopilot: Autopilot profiles, enrollment restrictions, BitLocker
   - Deploy-Collaboration: SharePoint/Teams policies

2. **New Modules Created:**
   - ExchangeHelper.psm1: Exchange Online operations
   - ReportHelper.psm1: Compliance reporting utilities

3. **Testing Infrastructure:**
   - Pester test files for Deploy-Identity and Deploy-Devices
   - Mock Graph API responses

4. **Industry Templates:**
   - Legal: Matter retention, ethical walls, eDiscovery
   - Financial: SEC 17a-4, FINRA supervision, NPI protection
   - Education: FERPA, COPPA, student/staff separation
   - Government: CMMC 2.0, NIST 800-171, CUI handling

5. **CLAUDE.md Updated:**
   - Implementation status dashboard
   - Testing requirements and patterns
   - Error handling guidelines
   - Troubleshooting guide
   - Compliance frameworks (SOC2, FedRAMP, CMMC, PCI-DSS)
   - Updated tech stack documentation

---

## Next Steps

1. **Deploy new functions** to Azure Function App
2. **Grant additional Graph permissions** for Phase 7 functions
3. **Test Phase 7 functions** in test tenant
4. **Begin Phase 8** - Lighthouse and reporting
5. **Update UI wizard** with new configuration steps
