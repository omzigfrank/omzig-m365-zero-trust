# Omzig M365 Zero Trust Deployment – Claude Code Instructions

## Goal
Build an Azure Marketplace **Managed Application** that:
- Deploys and configures a full Microsoft 365 environment
- Implements NSA Zero Trust across all 7 pillars
- Enforces HIPAA-aligned controls where selected
- Enables Microsoft Defender (mailboxes + devices)
- Uses a Marketplace wizard (createUiDefinition.json) instead of raw JSON
- Is repeatable across tenants and re-sellable to MSPs
- Provides complete operational setup for new M365 environments (not just security)

---

## Implementation Status Dashboard

### Overall Progress: ~70-75% Complete

| Phase | Description | Status | Completion |
|-------|-------------|--------|------------|
| Phase 1 | Bicep skeleton + main.bicep | ✅ COMPLETE | 100% |
| Phase 2 | Identity & security pillars | ✅ COMPLETE | 100% |
| Phase 3 | createUiDefinition.json wizard | ✅ COMPLETE | 100% |
| Phase 4 | Azure Functions orchestration | ✅ COMPLETE | 100% |
| Phase 5 | Marketplace packaging | ✅ COMPLETE | 100% |
| Phase 6 | Pipelines and docs | ✅ COMPLETE | 100% |
| Phase 7 | Operational setup (Exchange, SharePoint, Teams, Autopilot) | 🔲 PLANNED | 0% |
| Phase 8 | Multi-tenant management & reporting | 🔲 PLANNED | 0% |

### Component Status

#### Bicep Modules
| Module | File | Status | LOC | Notes |
|--------|------|--------|-----|-------|
| Main | `bicep/main.bicep` | ✅ Complete | 117 | Composes all modules |
| Identity | `bicep/identity/identity.bicep` | ✅ Complete | 224 | 6 CA policies, MFA, break-glass |
| Security | `bicep/security/security.bicep` | ✅ Complete | 277 | Defender, Log Analytics, Sentinel |
| Devices | `bicep/devices/devices.bicep` | ✅ Complete | 225 | Windows/iOS/Android/macOS compliance |
| Data | `bicep/data/data.bicep` | ✅ Complete | 314 | DLP, 5 sensitivity labels |
| Network | `bicep/network/network.bicep` | 🔶 Stub | 32 | NSG basics only |

#### Azure Functions
| Function | Status | LOC | Purpose |
|----------|--------|-----|---------|
| Orchestrator | ✅ Complete | 72 | Entry point, validates config |
| Deploy-Identity | ✅ Complete | 240 | CA policies via Graph API |
| Deploy-Devices | ✅ Complete | 148 | Intune compliance policies |
| Deploy-Security | ✅ Complete | 129 | Defender configuration |
| Deploy-Data | ✅ Complete | 117 | DLP and sensitivity labels |
| GraphHelper.psm1 | ✅ Complete | 189 | Shared Graph API utilities |
| Deploy-Users | 🔲 Planned | - | User provisioning |
| Deploy-Exchange | 🔲 Planned | - | Exchange Online config |
| Deploy-Autopilot | 🔲 Planned | - | Device enrollment |
| Deploy-Collaboration | 🔲 Planned | - | SharePoint/Teams |
| Deploy-Lighthouse | 🔲 Planned | - | Multi-tenant setup |
| Reports/* | 🔲 Planned | - | Reporting functions |
| Generate-Documentation | 🔲 Planned | - | Doc generation |

#### Marketplace & UI
| Component | Status | Notes |
|-----------|--------|-------|
| createUiDefinition.json | ✅ Complete | 6 wizard steps |
| mainTemplate.json | ✅ Complete | 1,722 lines ARM |
| viewDefinition.json | ✅ Complete | Portal view |
| build-template.ps1 | ✅ Complete | Build script |

#### CI/CD Pipelines
| Pipeline | Status | Stages |
|----------|--------|--------|
| azure-pipelines.yml | ✅ Complete | Validate → Build → Deploy Dev → Deploy Prod |
| functions-pipeline.yml | ✅ Complete | Validate → Build → Deploy Dev → Deploy Prod |

#### Documentation
| Document | Status | Size |
|----------|--------|------|
| NSA-ZERO-TRUST.md | ✅ Complete | 7.6 KB |
| HIPAA-CONTROLS.md | ✅ Complete | 5.9 KB |
| DEPLOYMENT-GUIDE.md | ✅ Complete | 26 KB |
| MARKETPLACE-GUIDE.md | ✅ Complete | 15 KB |
| README.md | ✅ Complete | 10.9 KB |

#### Deployed Resources (Test Environment)
- ✅ Managed Identity: `id-omzig-test-graph`
- ✅ Log Analytics: `log-omzig-test-security`
- ✅ Storage Account: `stomzigzerotrust`
- ✅ Function App: `func-omzig-zerotrust`
- ✅ 6 CA Policies (Report-Only mode)

---

## Tech Stack

### Core Technologies
| Category | Technology | Version/Notes |
|----------|-----------|---------------|
| IaC | Azure Bicep | Preferred; ARM only as build output |
| Orchestration | Azure Functions | PowerShell 7.4+ or C# |
| M365 Config | Microsoft Graph API | v1.0 and beta endpoints |
| Marketplace UI | createUiDefinition.json | Azure Portal wizard |
| CI/CD | Azure DevOps YAML | Multi-stage pipelines |
| Management-at-scale | Azure Lighthouse | GDAP for MSPs |

### PowerShell Modules (requirements.psd1)
```powershell
@{
    'Az.Accounts' = '2.*'
    'Az.Resources' = '6.*'
    'Az.Functions' = '4.*'
    'Microsoft.Graph.Authentication' = '2.*'
    'Microsoft.Graph.Identity.SignIns' = '2.*'
    'Microsoft.Graph.Identity.DirectoryManagement' = '2.*'
    'Microsoft.Graph.DeviceManagement' = '2.*'
    'Microsoft.Graph.Security' = '2.*'
    'Microsoft.Graph.Users' = '2.*'
    'Microsoft.Graph.Groups' = '2.*'
    'Microsoft.Graph.Reports' = '2.*'
    'ExchangeOnlineManagement' = '3.*'
    'MicrosoftTeams' = '5.*'
    'PnP.PowerShell' = '2.*'  # SharePoint Online
}
```

### Graph API Versions
| API Area | Version | Reason |
|----------|---------|--------|
| Conditional Access | v1.0 | Stable, production-ready |
| Intune/Device Management | beta | Some features not in v1.0 |
| Security/Defender | v1.0 | Stable |
| Reports | v1.0 | Stable |
| Identity Protection | beta | Risk detection features |

### Azure Services Used
- Azure Functions (Consumption plan)
- Azure Key Vault (secrets management)
- Azure Log Analytics (monitoring)
- Azure Sentinel (SIEM, optional)
- Azure Storage (function state)
- Application Insights (telemetry)
- Azure Lighthouse (multi-tenant)

---

## How You Should Work

### 1. Always Plan Before Coding
When asked to build something non-trivial:
- Read `PROJECT.md`, `ARCHITECTURE.md`, and relevant files
- Propose a step-by-step plan in `TASKS.md`
- Wait for confirmation before large changes

### 2. Respect This Structure
```
omzig-m365-zero-trust/
├── bicep/                    # Bicep modules and main.bicep
│   ├── main.bicep           # Entry point
│   ├── identity/            # CA policies, MFA
│   ├── devices/             # Intune compliance
│   ├── security/            # Defender, logging
│   ├── data/                # DLP, sensitivity labels
│   ├── network/             # NSG, network security
│   └── lighthouse/          # Multi-tenant (planned)
├── functions/                # Azure Functions
│   ├── Orchestrator/        # Main entry
│   ├── Deploy-*/            # Deployment functions
│   ├── Reports/             # Reporting (planned)
│   ├── Modules/             # Shared PowerShell modules
│   └── Tests/               # Unit tests (planned)
├── ui/                       # createUiDefinition.json
├── managed-app/              # Marketplace package
├── pipelines/                # CI/CD YAML
├── docs/                     # NSA/HIPAA/compliance docs
├── templates/                # Industry compliance templates
│   └── industries/          # Legal, Financial, Education, etc.
├── scripts/                  # Utility scripts
│   ├── test-functions.ps1
│   ├── enable-policies.ps1
│   └── deploy-remaining.ps1
└── tests/                    # Integration tests (planned)
```

### 3. Coding Conventions

#### Bicep
```bicep
// Always parameterize location, names, SKUs
@description('Azure region for deployment')
param location string = resourceGroup().location

@description('Organization name prefix')
@minLength(2)
@maxLength(10)
param orgName string

@description('Security baseline level')
@allowed(['Standard', 'Enhanced', 'Maximum'])
param securityBaseline string = 'Enhanced'

// Use outputs for cross-module references
output managedIdentityId string = identity.outputs.principalId
```

#### PowerShell Functions
```powershell
# Use managed identity for Graph
Connect-MgGraph -Identity

# Log clearly; no secrets in logs
Write-Host "Creating policy: $policyName"
Write-Host "Policy ID: $($policy.Id)"  # OK to log IDs
# Write-Host "Secret: $secret"  # NEVER log secrets

# Always use try/catch with specific error handling
try {
    $result = Invoke-MgGraphRequest -Method POST -Uri $uri -Body $body
} catch {
    Write-Error "Failed to create policy: $($_.Exception.Message)"
    throw
}
```

#### Error Handling Pattern
```powershell
function Invoke-GraphWithRetry {
    param(
        [string]$Method,
        [string]$Uri,
        [object]$Body,
        [int]$MaxRetries = 3,
        [int]$RetryDelaySeconds = 5
    )

    $attempt = 0
    while ($attempt -lt $MaxRetries) {
        try {
            $attempt++
            return Invoke-MgGraphRequest -Method $Method -Uri $Uri -Body $Body
        } catch {
            if ($attempt -eq $MaxRetries) { throw }
            if ($_.Exception.Response.StatusCode -eq 429) {
                # Throttling - wait longer
                $retryAfter = $_.Exception.Response.Headers['Retry-After'] ?? 60
                Start-Sleep -Seconds $retryAfter
            } elseif ($_.Exception.Response.StatusCode -ge 500) {
                # Server error - retry with backoff
                Start-Sleep -Seconds ($RetryDelaySeconds * $attempt)
            } else {
                # Client error - don't retry
                throw
            }
        }
    }
}
```

### 4. Security/Compliance
- Treat NSA Zero Trust docs (summarized in `docs/NSA-ZERO-TRUST.md`) as requirements
- No secrets in repo; assume Key Vault for all sensitive data
- Use managed identity exclusively for Graph API authentication
- Log audit events but never log secrets, tokens, or PII

### 5. Before You Say Something Is "Done"
- **Bicep**: `az bicep build` and `az deployment what-if` must pass
- **Functions**: Basic happy-path test documented and passing
- **UI**: Schema validation via `Test-CreateUIDefinition.ps1`
- Update `TASKS.md` and relevant docs

---

## Testing Requirements

### Unit Testing (Functions)

#### Test Structure
```
functions/
├── Tests/
│   ├── Deploy-Identity.Tests.ps1
│   ├── Deploy-Devices.Tests.ps1
│   ├── Deploy-Security.Tests.ps1
│   ├── Deploy-Data.Tests.ps1
│   ├── GraphHelper.Tests.ps1
│   └── Mocks/
│       └── GraphResponses.json
```

#### Test Pattern (Pester)
```powershell
# Deploy-Identity.Tests.ps1
Describe "Deploy-Identity" {
    BeforeAll {
        # Mock Graph API calls
        Mock Invoke-MgGraphRequest {
            return @{ Id = "test-policy-id"; DisplayName = $Body.displayName }
        }
    }

    Context "When creating CA policies" {
        It "Should create CA001-Block-Legacy-Auth" {
            $config = @{ securityBaseline = "Enhanced"; hipaaEnabled = $false }
            $result = & "$PSScriptRoot/../Deploy-Identity/run.ps1" -Config $config
            $result.policies | Should -Contain "CA001-Block-Legacy-Auth"
        }

        It "Should skip CA004 when skipDeviceCompliance is true" {
            $config = @{ securityBaseline = "Enhanced"; skipDeviceCompliance = $true }
            $result = & "$PSScriptRoot/../Deploy-Identity/run.ps1" -Config $config
            $result.skipped | Should -Contain "CA004"
        }
    }

    Context "When HIPAA is enabled" {
        It "Should set shorter session timeout" {
            $config = @{ securityBaseline = "Enhanced"; hipaaEnabled = $true }
            $result = & "$PSScriptRoot/../Deploy-Identity/run.ps1" -Config $config
            # Verify HIPAA-specific settings
        }
    }
}
```

#### Running Tests
```powershell
# Run all tests
Invoke-Pester -Path ./functions/Tests -Output Detailed

# Run specific test file
Invoke-Pester -Path ./functions/Tests/Deploy-Identity.Tests.ps1

# Run with code coverage
Invoke-Pester -Path ./functions/Tests -CodeCoverage ./functions/Deploy-*/run.ps1
```

### Integration Testing

#### Test Script (test-functions.ps1)
```powershell
# Test all function endpoints with test config
$testConfig = @{
    organizationName = "TestOrg"
    primaryDomain = "testorg.onmicrosoft.com"
    adminEmail = "admin@testorg.onmicrosoft.com"
    securityBaseline = "Enhanced"
    hipaaEnabled = $false
    skipDeviceCompliance = $true  # Safe for testing
}

# Get function key
$functionKey = az functionapp keys list `
    --name "func-omzig-zerotrust" `
    --resource-group "OMZIG-ZEROTRUST" `
    --query "functionKeys.default" -o tsv

# Call orchestrator
$response = Invoke-RestMethod `
    -Uri "https://func-omzig-zerotrust.azurewebsites.net/api/Orchestrator?code=$functionKey" `
    -Method POST `
    -Body ($testConfig | ConvertTo-Json) `
    -ContentType "application/json"

# Validate response
if ($response.status -eq "Success") {
    Write-Host "✅ All functions executed successfully" -ForegroundColor Green
    $response.results | Format-Table
} else {
    Write-Host "❌ Deployment failed" -ForegroundColor Red
    $response.errors | ForEach-Object { Write-Error $_ }
}
```

### Bicep Validation
```powershell
# Syntax validation
az bicep build --file ./bicep/main.bicep

# What-if deployment
az deployment group what-if `
    --resource-group "OMZIG-ZEROTRUST" `
    --template-file ./bicep/main.bicep `
    --parameters orgName=test securityBaseline=Enhanced

# Full validation
az deployment group validate `
    --resource-group "OMZIG-ZEROTRUST" `
    --template-file ./bicep/main.bicep `
    --parameters orgName=test securityBaseline=Enhanced
```

### UI Schema Validation
```powershell
# Validate createUiDefinition.json
$ui = Get-Content ./ui/createUiDefinition.json | ConvertFrom-Json
$schema = Invoke-RestMethod "https://schema.management.azure.com/schemas/0.1.2-preview/CreateUIDefinition.MultiVm.json"

# Basic structure validation
if ($ui.'$schema' -and $ui.handler -and $ui.version -and $ui.parameters) {
    Write-Host "✅ UI definition structure is valid" -ForegroundColor Green
} else {
    Write-Error "Invalid UI definition structure"
}

# Test in Azure Portal sandbox
# https://portal.azure.com/#blade/Microsoft_Azure_CreateUIDef/SandboxBlade
```

---

## Error Handling Guidelines

### Error Categories

| Category | HTTP Code | Retry? | Action |
|----------|-----------|--------|--------|
| Throttling | 429 | Yes | Wait for Retry-After header |
| Server Error | 5xx | Yes | Exponential backoff |
| Not Found | 404 | No | Log and skip or create |
| Forbidden | 403 | No | Check permissions, fail |
| Bad Request | 400 | No | Fix request, fail |
| Conflict | 409 | Maybe | Check if resource exists |

### Standard Error Response Format
```json
{
    "status": "Failed",
    "timestamp": "2025-01-21T10:30:00Z",
    "component": "Deploy-Identity",
    "errors": [
        {
            "code": "PolicyCreationFailed",
            "message": "Failed to create CA001-Block-Legacy-Auth",
            "details": "Insufficient permissions: Policy.ReadWrite.ConditionalAccess required",
            "recoverable": true,
            "suggestion": "Grant Policy.ReadWrite.ConditionalAccess to the managed identity"
        }
    ],
    "partialResults": {
        "policiesCreated": ["CA002", "CA003"],
        "policiesFailed": ["CA001"]
    }
}
```

### Logging Standards
```powershell
# Info - Normal operations
Write-Host "[INFO] Starting Deploy-Identity..."
Write-Host "[INFO] Created policy: CA001-Block-Legacy-Auth (ID: $policyId)"

# Warning - Non-fatal issues
Write-Warning "[WARN] CA004 skipped: skipDeviceCompliance is true"
Write-Warning "[WARN] Policy already exists, skipping creation"

# Error - Failures
Write-Error "[ERROR] Failed to create policy: $($_.Exception.Message)"
Write-Error "[ERROR] Graph API returned 403: Insufficient permissions"

# Debug - Detailed troubleshooting (only in debug mode)
Write-Debug "[DEBUG] Request body: $($body | ConvertTo-Json -Depth 10)"
Write-Debug "[DEBUG] Response headers: $($response.Headers | ConvertTo-Json)"
```

### Rollback Strategy
```powershell
function Invoke-DeployWithRollback {
    param([hashtable]$Config)

    $createdResources = @()

    try {
        # Track each created resource
        $policy = New-ConditionalAccessPolicy -Config $Config
        $createdResources += @{ Type = "CAPolicy"; Id = $policy.Id }

        $compliance = New-CompliancePolicy -Config $Config
        $createdResources += @{ Type = "CompliancePolicy"; Id = $compliance.Id }

        return @{ Status = "Success"; Resources = $createdResources }
    }
    catch {
        Write-Warning "Deployment failed, initiating rollback..."

        # Rollback in reverse order
        foreach ($resource in ($createdResources | Sort-Object -Descending)) {
            try {
                Remove-Resource -Type $resource.Type -Id $resource.Id
                Write-Host "Rolled back: $($resource.Type) $($resource.Id)"
            } catch {
                Write-Error "Rollback failed for $($resource.Type): $($_.Exception.Message)"
            }
        }

        throw "Deployment failed and rolled back: $($_.Exception.Message)"
    }
}
```

---

## Troubleshooting Guide

### Common Issues and Solutions

#### 1. Graph API Permission Errors
```
Error: "Insufficient privileges to complete the operation"
```
**Solution:**
```powershell
# Check current permissions
$context = Get-MgContext
$context.Scopes

# Required permissions for each function:
# Deploy-Identity: Policy.ReadWrite.ConditionalAccess, Policy.Read.All
# Deploy-Devices: DeviceManagementConfiguration.ReadWrite.All
# Deploy-Security: SecurityEvents.ReadWrite.All
# Deploy-Data: InformationProtectionPolicy.ReadWrite.All

# Grant permissions via Azure CLI
az ad app permission add --id $appId --api 00000003-0000-0000-c000-000000000000 \
    --api-permissions 01c0a623-fc9b-48e9-b794-0756f8e8f067=Role  # Policy.ReadWrite.ConditionalAccess

az ad app permission admin-consent --id $appId
```

#### 2. CA Policy Already Exists
```
Error: "A policy with this name already exists"
```
**Solution:**
```powershell
# Check for existing policy
$existing = Get-MgIdentityConditionalAccessPolicy -Filter "displayName eq 'CA001-Block-Legacy-Auth'"

if ($existing) {
    Write-Warning "Policy exists, updating instead of creating"
    Update-MgIdentityConditionalAccessPolicy -ConditionalAccessPolicyId $existing.Id -BodyParameter $policyConfig
} else {
    New-MgIdentityConditionalAccessPolicy -BodyParameter $policyConfig
}
```

#### 3. Device Compliance Lockout
```
Issue: Users locked out after enabling CA004 (Require-Compliant-Device)
```
**Prevention:**
```powershell
# ALWAYS check before enabling CA004
$enrolledDevices = Get-MgDeviceManagementManagedDevice -Filter "complianceState eq 'compliant'"

if ($enrolledDevices.Count -eq 0) {
    Write-Error "No compliant devices found! Do NOT enable CA004."
    Write-Warning "Enroll and mark devices compliant before enabling this policy."
    return
}

# Verify break-glass group exists and is excluded
$breakGlass = Get-MgGroup -Filter "displayName eq 'Break-Glass-Admins'"
if (-not $breakGlass) {
    Write-Error "Break-glass group not found! Create it before enabling CA004."
    return
}
```

#### 4. Function App Cold Start Timeout
```
Error: "The request timed out"
```
**Solution:**
```powershell
# In host.json, increase function timeout
{
    "functionTimeout": "00:10:00",
    "extensions": {
        "http": {
            "routePrefix": "api",
            "maxOutstandingRequests": 200,
            "maxConcurrentRequests": 100
        }
    }
}

# Implement warm-up endpoint
# GET /api/health - returns immediately, keeps function warm
```

#### 5. Bicep Deployment Failures
```
Error: "Template validation failed"
```
**Diagnosis:**
```powershell
# Get detailed error
az deployment group create `
    --resource-group "OMZIG-ZEROTRUST" `
    --template-file ./bicep/main.bicep `
    --parameters orgName=test `
    --debug 2>&1 | Out-File deployment-debug.log

# Common fixes:
# 1. API version mismatch - update resource API versions
# 2. Missing required parameters - add defaults or make optional
# 3. Circular dependencies - restructure module outputs
```

#### 6. Exchange Online Connection Issues
```
Error: "Unable to connect to Exchange Online"
```
**Solution:**
```powershell
# Exchange requires certificate-based auth for automation
# 1. Create app registration with Exchange.ManageAsApp permission
# 2. Upload certificate to app registration
# 3. Grant Exchange Administrator role

Connect-ExchangeOnline `
    -CertificateThumbprint $thumbprint `
    -AppId $appId `
    -Organization "tenant.onmicrosoft.com"
```

### Debug Mode
```powershell
# Enable verbose logging in functions
$env:FUNCTIONS_WORKER_RUNTIME_DEBUG = "true"
$env:AZURE_FUNCTIONS_ENVIRONMENT = "Development"

# Enable Graph SDK debug logging
$DebugPreference = "Continue"
Connect-MgGraph -Debug

# Check function logs
az functionapp log tail --name func-omzig-zerotrust --resource-group OMZIG-ZEROTRUST
```

### Health Check Endpoints
```powershell
# Add to each function for diagnostics
function Get-FunctionHealth {
    @{
        Status = "Healthy"
        Timestamp = Get-Date -Format "o"
        GraphConnected = (Get-MgContext) -ne $null
        Permissions = (Get-MgContext).Scopes
        Environment = $env:AZURE_FUNCTIONS_ENVIRONMENT
    }
}
```

---

## Compliance Frameworks

### NSA Zero Trust (7 Pillars) - ✅ Implemented

| Pillar | Implementation | Module |
|--------|---------------|--------|
| User | CA policies, MFA, password policy, risk-based access | `identity.bicep`, `Deploy-Identity` |
| Device | Intune compliance, BitLocker, Defender | `devices.bicep`, `Deploy-Devices` |
| Network | NSG rules, network segmentation | `network.bicep` (stub) |
| Application | Defender for O365, Safe Links/Attachments | `security.bicep`, `Deploy-Security` |
| Data | DLP, sensitivity labels, encryption | `data.bicep`, `Deploy-Data` |
| Visibility | Log Analytics, Sentinel, audit logging | `security.bicep` |
| Automation | Policy orchestration, auto-remediation | `Orchestrator`, all functions |

### HIPAA Compliance - ✅ Implemented

| Safeguard | Control | Implementation |
|-----------|---------|---------------|
| Administrative | Access management | CA policies, MFA, role assignments |
| Administrative | Workforce training | (External - documentation only) |
| Administrative | Contingency plan | Break-glass accounts, DR docs |
| Physical | Facility access | (External - Azure datacenters) |
| Physical | Workstation security | Intune compliance, BitLocker |
| Technical | Access control | CA policies, MFA, device compliance |
| Technical | Audit controls | Log Analytics (7-year retention) |
| Technical | Integrity controls | Sensitivity labels, DLP |
| Technical | Transmission security | TLS enforcement, encryption |

**HIPAA-Specific Settings:**
```bicep
var hipaaSettings = hipaaEnabled ? {
    logRetentionDays: 2555  // 7 years
    sessionTimeout: 60      // 1 hour
    mfaRememberDays: 0      // Never remember
    dlpEnabled: true
    phiLabelRequired: true
} : {
    logRetentionDays: 365
    sessionTimeout: 480     // 8 hours
    mfaRememberDays: 14
    dlpEnabled: false
    phiLabelRequired: false
}
```

### SOC 2 Type II - 🔶 Partial (Future Enhancement)

| Trust Principle | Current Status | Gap |
|-----------------|----------------|-----|
| Security | ✅ Covered by Zero Trust | - |
| Availability | 🔶 Partial | Need SLA monitoring, DR testing |
| Processing Integrity | 🔶 Partial | Need data validation rules |
| Confidentiality | ✅ Covered by DLP/Labels | - |
| Privacy | 🔶 Partial | Need consent management |

**Planned Additions:**
```powershell
# SOC 2 specific controls
$soc2Controls = @{
    securityMonitoring = @{
        continuousMonitoring = $true
        alertThresholds = @{
            failedLogins = 5
            privilegedActions = "all"
            dataExfiltration = "anomaly"
        }
    }
    changeManagement = @{
        requireApproval = $true
        auditAllChanges = $true
        rollbackCapability = $true
    }
    vendorManagement = @{
        thirdPartyRiskAssessment = $true
        accessReviewFrequency = "quarterly"
    }
}
```

### FedRAMP (Moderate) - 🔲 Planned

| Control Family | Status | Notes |
|----------------|--------|-------|
| AC (Access Control) | ✅ Partial | CA policies cover most |
| AU (Audit) | ✅ Covered | Log Analytics |
| CA (Assessment) | 🔲 Planned | Need automated scanning |
| CM (Config Mgmt) | 🔶 Partial | Need baseline enforcement |
| IA (Identification) | ✅ Covered | MFA, identity management |
| IR (Incident Response) | 🔶 Partial | Need playbooks |
| SC (System Protection) | ✅ Partial | Encryption, network |
| SI (System Integrity) | 🔶 Partial | Need vulnerability mgmt |

**Planned Module:** `templates/compliance/fedramp-moderate.json`

### CMMC 2.0 (Level 2) - 🔲 Planned

| Domain | Status | Gap |
|--------|--------|-----|
| Access Control (AC) | ✅ Partial | Need CUI marking |
| Audit (AU) | ✅ Covered | - |
| Configuration Mgmt (CM) | 🔶 Partial | Need hardening baselines |
| Identification (IA) | ✅ Covered | - |
| Incident Response (IR) | 🔲 Planned | Need IR procedures |
| Maintenance (MA) | 🔲 Planned | Need maintenance windows |
| Media Protection (MP) | 🔶 Partial | USB policies needed |
| Personnel Security (PS) | 🔲 External | HR processes |
| Physical Protection (PE) | 🔲 External | Facility controls |
| Risk Assessment (RA) | 🔲 Planned | Need risk framework |
| Security Assessment (CA) | 🔲 Planned | Need scanning |
| System Protection (SC) | ✅ Partial | Encryption covered |
| System Integrity (SI) | 🔶 Partial | Need AV validation |

**Planned Module:** `templates/compliance/cmmc-level2.json`

### PCI-DSS v4.0 - 🔲 Planned (Financial Customers)

| Requirement | Status | Implementation |
|-------------|--------|---------------|
| Req 1: Firewalls | 🔶 Partial | NSG rules |
| Req 2: No defaults | ✅ Covered | Custom configs |
| Req 3: Protect CHD | 🔲 Planned | Need PAN detection |
| Req 4: Encrypt transit | ✅ Covered | TLS everywhere |
| Req 5: Anti-malware | ✅ Covered | Defender |
| Req 6: Secure systems | 🔶 Partial | Patching policies |
| Req 7: Restrict access | ✅ Covered | RBAC, CA |
| Req 8: Identify users | ✅ Covered | MFA, identity |
| Req 9: Physical access | 🔲 External | - |
| Req 10: Logging | ✅ Covered | Log Analytics |
| Req 11: Test security | 🔲 Planned | Vulnerability scans |
| Req 12: Policies | 🔲 Docs | Templates needed |

### Industry-Specific Templates

| Industry | Template | Status | Key Controls |
|----------|----------|--------|--------------|
| Healthcare | `templates/industries/healthcare.json` | ✅ Via HIPAA | PHI protection, 7yr retention |
| Legal | `templates/industries/legal.json` | 🔲 Planned | Ethical walls, matter retention |
| Financial | `templates/industries/financial.json` | 🔲 Planned | FINRA archiving, supervision |
| Education | `templates/industries/education.json` | 🔲 Planned | FERPA, student data |
| Government | `templates/industries/government.json` | 🔲 Planned | CUI, CMMC alignment |
| Retail | `templates/industries/retail.json` | 🔲 Planned | PCI-DSS, POS security |

---

## MSP Operational Setup Requirements

The following operational components are required for a complete M365 deployment. Security policies alone are insufficient—MSPs need full environment setup capabilities.

### 1. User & License Provisioning

**Module:** `functions/Deploy-Users/`
**Status:** 🔲 Planned

| Capability | Graph API | Priority |
|------------|-----------|----------|
| Bulk user creation from CSV | POST /users | High |
| License assignment by SKU | POST /users/{id}/assignLicense | High |
| Group-based licensing rules | POST /groups (assignedLicenses) | High |
| Admin role assignment | POST /directoryRoles/{id}/members | Medium |
| Dynamic group creation | POST /groups (membershipRule) | Medium |
| Guest user provisioning | POST /invitations | Low |

**Parameters to expose:**
```
- userImportMode: 'CSV' | 'Manual' | 'AzureADSync'
- defaultLicenseSku: string (e.g., 'ENTERPRISEPACK' for E3)
- autoAssignLicenses: bool
- createStandardGroups: bool (All Users, Executives, IT Staff, etc.)
- adminRoleAssignments: array of { userId, roleId }
```

**Standard groups to create:**
- `All-Users` (dynamic: all member users)
- `All-Employees` (dynamic: exclude guests)
- `Executives` (manual membership)
- `IT-Admins` (manual membership)
- `License-E3-Users` / `License-E5-Users` (for group-based licensing)

---

### 2. Exchange Online Configuration

**Module:** `functions/Deploy-Exchange/`
**Status:** 🔲 Planned

| Capability | Graph/PowerShell API | Priority |
|------------|---------------------|----------|
| Mail flow rules (transport rules) | Exchange Online PowerShell | High |
| Shared mailboxes | POST /users (mailbox type) | High |
| Distribution lists | POST /groups (mail-enabled) | High |
| DKIM configuration | Exchange Online PowerShell | High |
| DMARC guidance/validation | DNS verification | High |
| Anti-spam policy tuning | Security & Compliance | Medium |
| Quarantine policies | Security & Compliance | Medium |
| Journaling rules | Exchange Online PowerShell | Low |
| Room/resource mailboxes | POST /places | Low |

**Standard mail flow rules to create:**
```powershell
$mailFlowRules = @(
    @{
        name = "Block External Auto-Forward"
        priority = 0
        description = "Prevents data exfiltration via auto-forwarding"
        conditions = @{ messageTypeMatches = "AutoForward" }
        exceptions = @{ senderInRecipientList = "ExternalForwardingAllowed" }
        actions = @{ rejectMessageReasonText = "External auto-forwarding is disabled by policy" }
    }
    @{
        name = "External Email Warning Banner"
        priority = 1
        description = "Adds [EXTERNAL] tag to external emails"
        conditions = @{ fromScope = "NotInOrganization" }
        actions = @{
            prependSubject = "[EXTERNAL] "
            applyHtmlDisclaimerLocation = "Prepend"
            applyHtmlDisclaimerText = "<div style='background:#FFEB9C;padding:10px;'>This email originated from outside your organization. Exercise caution with links and attachments.</div>"
        }
    }
    @{
        name = "Block Executable Attachments"
        priority = 2
        description = "Blocks dangerous file types"
        conditions = @{
            attachmentExtensionMatchesWords = @("exe", "bat", "cmd", "ps1", "vbs", "js", "jar", "scr")
        }
        actions = @{ rejectMessageReasonText = "Executable attachments are blocked by policy" }
    }
    @{
        name = "Encrypt Sensitive Keywords"
        priority = 3
        description = "Auto-encrypts emails with sensitive keywords"
        conditions = @{
            subjectOrBodyContainsWords = @("confidential", "sensitive", "private", "encrypt")
        }
        actions = @{ applyOME = $true }
    }
)
```

**Standard shared mailboxes:**
```
- info@{domain} (external inquiries)
- support@{domain} (help desk)
- sales@{domain} (sales team)
- hr@{domain} (human resources)
- billing@{domain} (accounts receivable)
```

**DKIM/DMARC checklist:**
- Enable DKIM signing for all accepted domains
- Generate DKIM CNAME records for DNS
- Output DMARC record recommendation: `v=DMARC1; p=quarantine; rua=mailto:dmarc@{domain}`
- Validate SPF record exists

---

### 3. Device Enrollment & Autopilot

**Module:** `functions/Deploy-Autopilot/` (extend existing `Deploy-Devices`)
**Status:** 🔲 Planned

| Capability | Graph API | Priority |
|------------|-----------|----------|
| Autopilot deployment profiles | POST /deviceManagement/windowsAutopilotDeploymentProfiles | High |
| Enrollment restrictions | POST /deviceManagement/deviceEnrollmentConfigurations | High |
| Device categories | POST /deviceManagement/deviceCategories | Medium |
| Enrollment status page config | PATCH enrollmentStatusPage | Medium |
| Win32 app deployment | POST /deviceAppManagement/mobileApps | Medium |
| Windows Update rings | POST /deviceManagement/deviceConfigurations | Medium |
| BitLocker policies | POST /deviceManagement/intents | High |
| macOS enrollment profile | POST /deviceManagement/depOnboardingSettings | Low |
| iOS/iPadOS enrollment | POST /deviceManagement/depOnboardingSettings | Low |

**Standard Autopilot profile:**
```powershell
$autopilotProfile = @{
    displayName = "Standard User Deployment"
    description = "Zero-touch deployment for standard users"
    deviceNameTemplate = "%SERIAL%"
    deviceType = "windowsPc"
    enableWhiteGlove = $true
    extractHardwareHash = $true
    outOfBoxExperienceSettings = @{
        hidePrivacySettings = $true
        hideEULA = $true
        userType = "standard"  # Not local admin
        skipKeyboardSelectionPage = $true
        hideEscapeLink = $true
    }
    enrollmentStatusScreenSettings = @{
        hideInstallationProgress = $false
        allowDeviceUseBeforeProfileAndAppInstallComplete = $false
        blockDeviceSetupRetryByUser = $true
        allowLogCollectionOnInstallFailure = $true
        installProgressTimeoutInMinutes = 60
    }
}
```

**Standard enrollment restrictions:**
```powershell
$enrollmentRestrictions = @{
    platformRestrictions = @{
        windows = @{ platformBlocked = $false; personalDeviceEnrollmentBlocked = $true }
        iOS = @{ platformBlocked = $false; personalDeviceEnrollmentBlocked = $true }
        macOS = @{ platformBlocked = $false; personalDeviceEnrollmentBlocked = $true }
        android = @{ platformBlocked = $false; personalDeviceEnrollmentBlocked = $true }
    }
}
```

**Standard BitLocker policy:**
```powershell
$bitlockerPolicy = @{
    displayName = "Corporate BitLocker Policy"
    requireDeviceEncryption = $true
    encryptionMethod = "xtsAes256"
    startupAuthenticationRequired = $true
    startupAuthenticationTpmUsage = "required"
    recoveryOptions = @{
        enableRecoveryInformationSaveToStore = $true
        recoveryKeyUsage = "allowed"
        recoveryPasswordUsage = "required"
        hideRecoveryOptions = $false
    }
}
```

---

### 4. SharePoint & Teams Configuration

**Module:** `functions/Deploy-Collaboration/`
**Status:** 🔲 Planned

| Capability | Graph/SharePoint API | Priority |
|------------|---------------------|----------|
| SharePoint sharing policies | SharePoint Admin API | High |
| Default site collections | POST /sites | Medium |
| Teams policies (meetings, messaging) | Teams Admin PowerShell | High |
| Teams templates | POST /teams (template) | Medium |
| OneDrive Known Folder Move | Intune policy | High |
| Sensitivity label publishing to sites | Security & Compliance | Medium |
| Guest access policies | Teams Admin API | Medium |
| App permission policies | Teams Admin PowerShell | Medium |

**Standard SharePoint configuration:**
```powershell
$sharepointConfig = @{
    sharingCapability = "ExternalUserSharingOnly"  # No anonymous links
    defaultSharingLinkType = "Internal"
    preventExternalUsersFromResharing = $true
    requireAcceptingAccountMatchInvitedAccount = $true
    externalUserExpirationRequired = $true
    externalUserExpireInDays = 30
    emailAttestationRequired = $true
    emailAttestationReAuthDays = 30
    blockDownloadLinksFileType = "WebPreviewableFiles"
    # HIPAA mode adjustments
    conditionalAccessPolicy = "AllowLimitedAccess"  # Block download on unmanaged devices
}
```

**Standard Teams policies:**
```powershell
$teamsPolicies = @{
    meetingPolicy = @{
        allowAnonymousUsersToJoinMeeting = $false  # Require authentication
        allowExternalParticipantGiveRequestControl = $false
        autoAdmittedUsers = "EveryoneInCompanyExcludingGuests"
        allowCloudRecording = $true
        allowRecordingStorageOutsideRegion = $false
        allowTranscription = $true
    }
    messagingPolicy = @{
        allowUrlPreviews = $true
        allowGiphy = $false  # Disable for regulated industries
        allowMemes = $false
        allowStickers = $true
        allowUserEditMessages = $true
        allowUserDeleteMessages = $true
        allowOwnerDeleteMessages = $true
        readReceiptsEnabledType = "UserPreference"
    }
    appPermissionPolicy = @{
        defaultCatalogAppsType = "AllowedAppList"
        globalCatalogAppsType = "AllowedAppList"
        privateCatalogAppsType = "AllowedAppList"
        # Block third-party apps by default, whitelist approved
    }
}
```

**OneDrive Known Folder Move (Intune policy):**
```powershell
$kfmPolicy = @{
    displayName = "OneDrive Known Folder Move"
    omaSettings = @(
        @{
            omaUri = "./Device/Vendor/MSFT/Policy/Config/OneDriveNGSC/KFMSilentOptIn"
            value = "{TenantID}"  # Silently redirect folders
        }
        @{
            omaUri = "./Device/Vendor/MSFT/Policy/Config/OneDriveNGSC/KFMBlockOptOut"
            value = "1"  # Prevent users from opting out
        }
        @{
            omaUri = "./Device/Vendor/MSFT/Policy/Config/OneDriveNGSC/FilesOnDemandEnabled"
            value = "1"  # Enable Files on Demand
        }
    )
}
```

---

### 5. Multi-Tenant Management (GDAP/Lighthouse)

**Module:** `bicep/lighthouse/` and `functions/Deploy-Lighthouse/`
**Status:** 🔲 Planned

| Capability | API | Priority |
|------------|-----|----------|
| Azure Lighthouse onboarding | ARM delegatedResourceManagement | High |
| GDAP relationship setup | Partner Center API | High |
| Cross-tenant Log Analytics | ARM workspaces | Medium |
| Centralized alert routing | Action Groups | Medium |
| Partner admin link (PAL) | ARM managementPartner | Medium |

**Lighthouse delegation template:**
```bicep
// bicep/lighthouse/lighthouse.bicep
param mspTenantId string
param mspOfferName string = 'Omzig Managed Services'
param mspOfferDescription string = 'Zero Trust management and monitoring'

@description('Role assignments for MSP staff')
param authorizations array = [
  {
    principalId: '{msp-helpdesk-group-id}'
    principalIdDisplayName: 'MSP Help Desk'
    roleDefinitionId: 'acdd72a7-3385-48ef-bd42-f606fba81ae7'  // Reader
  }
  {
    principalId: '{msp-security-group-id}'
    principalIdDisplayName: 'MSP Security Team'
    roleDefinitionId: 'fb1c8493-542b-48eb-b624-b4c8fea62acd'  // Security Admin
  }
  {
    principalId: '{msp-admin-group-id}'
    principalIdDisplayName: 'MSP Administrators'
    roleDefinitionId: 'b24988ac-6180-42a0-ab88-20f7382dd24c'  // Contributor
  }
]

resource managedByTenant 'Microsoft.ManagedServices/registrationDefinitions@2022-10-01' = {
  name: guid(mspTenantId, mspOfferName)
  properties: {
    registrationDefinitionName: mspOfferName
    description: mspOfferDescription
    managedByTenantId: mspTenantId
    authorizations: authorizations
  }
}
```

---

### 6. Reporting & Dashboards

**Module:** `functions/Reports/`
**Status:** 🔲 Planned

| Report | Graph API | Frequency |
|--------|-----------|-----------|
| Secure Score | GET /security/secureScores | Daily |
| License utilization | GET /reports/getOffice365ActiveUserDetail | Weekly |
| MFA registration status | GET /reports/credentialUserRegistrationDetails | Daily |
| Inactive users | GET /users?$filter=signInActivity | Weekly |
| Sign-in failures | GET /auditLogs/signIns | Daily |
| Risky users | GET /identityProtection/riskyUsers | Daily |
| Device compliance | GET /deviceManagement/managedDevices | Daily |
| Storage consumption | GET /reports/getSharePointSiteUsageDetail | Weekly |
| Mailbox sizes | Exchange Online PowerShell | Weekly |

**Standard report outputs:**
```powershell
$reportConfig = @{
    securitySummary = @{
        includeSecureScore = $true
        includeMfaStatus = $true
        includeRiskyUsers = $true
        includeComplianceStatus = $true
        format = "PDF"
        schedule = "Weekly"
        recipients = @("{adminEmail}")
    }
    licenseReport = @{
        includeTotalLicenses = $true
        includeAssignedLicenses = $true
        includeUnusedLicenses = $true
        format = "CSV"
        schedule = "Monthly"
    }
    clientFacingReport = @{
        # Simplified report for client executives
        includeSecureScoreTrend = $true
        includeThreatsBlocked = $true
        includeCompliancePercentage = $true
        format = "PDF"
        schedule = "Monthly"
        branding = $true  # Include MSP logo
    }
}
```

---

### 7. Client Documentation Generation

**Module:** `functions/Generate-Documentation/`
**Status:** 🔲 Planned

| Document | Contents | Format |
|----------|----------|--------|
| As-Built | All deployed configurations | Markdown/PDF |
| Security Summary | CA policies, Defender settings, compliance status | PDF |
| Admin Runbook | Common tasks, escalation procedures | Markdown |
| Credential Handoff | Admin accounts, emergency access | Encrypted PDF |
| Compliance Attestation | HIPAA/industry controls mapping | PDF |

**As-built documentation template:**
```markdown
# {OrgName} Microsoft 365 Configuration
## Generated: {Date}

### Environment Summary
- Tenant ID: {TenantId}
- Primary Domain: {Domain}
- License Tier: {LicenseSku}
- Security Baseline: {BaselineLevel}
- HIPAA Mode: {HipaaEnabled}

### Identity Configuration
#### Conditional Access Policies
| Policy | State | Targets | Controls |
|--------|-------|---------|----------|
{ForEach CA Policy}

#### MFA Configuration
- Required for: {MfaScope}
- Allowed methods: {MfaMethods}
- Remember device: {MfaRememberDays} days

### Device Management
#### Compliance Policies
{ForEach Compliance Policy}

#### Autopilot Profiles
{ForEach Autopilot Profile}

### Data Protection
#### DLP Policies
{ForEach DLP Policy}

#### Sensitivity Labels
{ForEach Label}

### Exchange Online
#### Mail Flow Rules
{ForEach Rule}

#### Shared Mailboxes
{ForEach Mailbox}

### Appendix: Emergency Access
- Break-glass account: {BreakGlassUPN}
- Recovery procedures: See RECOVERY.md
```

---

### 8. Industry Compliance Templates

**Location:** `templates/industries/`

| Industry | Additional Controls | Module | Status |
|----------|--------------------|---------| -------|
| Healthcare (HIPAA) | PHI protection, audit logging | `hipaaEnabled` parameter | ✅ Implemented |
| Legal | Matter retention, ethical walls | `templates/industries/legal.json` | 🔲 Planned |
| Financial (FINRA/SEC) | Communication archiving, supervision | `templates/industries/financial.json` | 🔲 Planned |
| Education (FERPA) | Student data protection | `templates/industries/education.json` | 🔲 Planned |
| Government (CMMC) | CUI handling, access controls | `templates/industries/government.json` | 🔲 Planned |

**Legal industry template example:**
```json
{
  "industry": "Legal",
  "compliance": ["ABA Model Rules", "State Bar Requirements"],
  "additionalControls": {
    "retention": {
      "matterBasedRetention": true,
      "defaultRetentionYears": 7,
      "closedMatterRetentionYears": 10
    },
    "ethicalWalls": {
      "enabled": true,
      "informationBarriers": true
    },
    "eDiscovery": {
      "litigationHoldDefault": false,
      "autoHoldOnMatterCreation": true
    },
    "clientConfidentiality": {
      "externalSharingBlocked": true,
      "clientMatterLabelsRequired": true
    }
  }
}
```

---

## Graph API Permissions (Complete List)

The managed identity requires these permissions for full operational setup:

| Permission | Purpose | Type | Status |
|------------|---------|------|--------|
| User.ReadWrite.All | User provisioning | Application | 🔲 Needed |
| Group.ReadWrite.All | Group creation and licensing | Application | 🔲 Needed |
| Directory.ReadWrite.All | Role assignments | Application | 🔲 Needed |
| Policy.ReadWrite.ConditionalAccess | CA policies | Application | ✅ Granted |
| Policy.Read.All | Read all policies | Application | ✅ Granted |
| DeviceManagementConfiguration.ReadWrite.All | Intune policies | Application | ✅ Granted |
| DeviceManagementManagedDevices.ReadWrite.All | Device management | Application | ✅ Granted |
| DeviceManagementServiceConfig.ReadWrite.All | Autopilot profiles | Application | 🔲 Needed |
| SecurityEvents.ReadWrite.All | Security configuration | Application | ✅ Granted |
| Mail.ReadWrite | Exchange configuration | Application | 🔲 Needed |
| MailboxSettings.ReadWrite | Mailbox settings | Application | 🔲 Needed |
| Sites.FullControl.All | SharePoint configuration | Application | 🔲 Needed |
| Team.Create | Teams provisioning | Application | 🔲 Needed |
| TeamsAppInstallation.ReadWriteForTeam.All | Teams app management | Application | 🔲 Needed |
| Reports.Read.All | Usage reports | Application | 🔲 Needed |
| AuditLog.Read.All | Audit log access | Application | 🔲 Needed |
| InformationProtectionPolicy.Read.All | Sensitivity labels | Application | 🔲 Needed |

**Exchange Online PowerShell permissions:**
- Exchange Administrator role (for mail flow rules, transport config)
- Organization Management (for journaling, DKIM)

---

## Function App Structure (Complete)

```
functions/
├── Orchestrator/               # Main orchestration ✅
├── Deploy-Identity/            # CA policies, MFA ✅
├── Deploy-Devices/             # Intune compliance ✅
├── Deploy-Security/            # Defender config ✅
├── Deploy-Data/                # DLP, sensitivity labels ✅
├── Deploy-Users/               # User provisioning 🔲
├── Deploy-Exchange/            # Exchange Online config 🔲
├── Deploy-Autopilot/           # Device enrollment 🔲
├── Deploy-Collaboration/       # SharePoint/Teams 🔲
├── Deploy-Lighthouse/          # Multi-tenant setup 🔲
├── Reports/                    # Reporting functions 🔲
│   ├── Get-SecureScore/
│   ├── Get-LicenseUsage/
│   ├── Get-MfaStatus/
│   └── Get-ComplianceStatus/
├── Generate-Documentation/     # Doc generation 🔲
├── List-IntunePolicies/        # Utility (existing) ✅
├── Delete-IntunePolicies/      # Utility (existing) ✅
├── Get-IntuneDevices/          # Utility (existing) ✅
├── Tests/                      # Unit tests 🔲
│   ├── Deploy-Identity.Tests.ps1
│   ├── Deploy-Devices.Tests.ps1
│   └── Mocks/
├── Modules/
│   ├── GraphHelper.psm1        # Graph API utilities ✅
│   ├── ExchangeHelper.psm1     # Exchange Online utilities 🔲
│   └── ReportHelper.psm1       # Report generation utilities 🔲
├── host.json                   ✅
├── requirements.psd1           ✅
├── profile.ps1                 ✅
└── local.settings.json         ✅
```

---

## UI Wizard Updates

Current steps in `createUiDefinition.json`:
1. ✅ **Basics** - Subscription, resource group, region
2. ✅ **Organization** - Org size, domain, admin email
3. ✅ **Licensing** - M365 tier, Defender plans
4. ✅ **Security Baseline** - Standard/Enhanced/Maximum
5. ✅ **Compliance** - HIPAA toggle, DLP, labels
6. ✅ **Review** - Configuration summary

Planned additions:
1. 🔲 **Users & Licensing** (after Organization step)
   - Create standard groups toggle
   - License assignment mode
   - Admin role assignments

2. 🔲 **Email Configuration** (new step)
   - Standard mail flow rules toggle
   - Shared mailboxes list
   - DKIM/DMARC setup toggle
   - External email warning banner toggle

3. 🔲 **Devices & Enrollment** (expand existing)
   - Autopilot profile options
   - Block personal devices toggle
   - BitLocker requirements
   - Known Folder Move toggle

4. 🔲 **Collaboration** (new step)
   - SharePoint external sharing level
   - Teams guest access toggle
   - Teams meeting policies
   - Default site collections

5. 🔲 **MSP Settings** (new step, conditional)
   - Enable Lighthouse delegation
   - MSP tenant ID
   - Alert routing email
   - Reporting schedule

---

## Deployment Order

For a new M365 tenant, deploy in this order:

### 1. Identity Foundation
- Deploy-Identity (CA policies in Report-Only)
- Deploy-Users (admin accounts, break-glass)

### 2. Security Baseline
- Deploy-Security (Defender, logging)
- Deploy-Data (DLP, labels)

### 3. Operational Setup
- Deploy-Exchange (mail flow, shared mailboxes)
- Deploy-Collaboration (SharePoint, Teams policies)
- Deploy-Autopilot (device enrollment)

### 4. Enable & Validate
- Enable CA policies (use enable-policies.ps1)
- Generate as-built documentation
- Run initial compliance reports

### 5. Ongoing Management
- Deploy-Lighthouse (if MSP)
- Configure scheduled reports

---

## Critical Warnings

### Device Compliance Lockout Risk
**CA004 (Require-Compliant-Device)** is disabled by default to prevent lockouts.

Before enabling:
1. Ensure devices are enrolled in Intune
2. Verify devices show as "Compliant"
3. Confirm break-glass admin group exists and is excluded
4. Use `enable-policies.ps1` for safe enablement

### Break-Glass Account Requirements
- Create at least 2 break-glass accounts
- Exclude from ALL conditional access policies
- Use strong passwords (32+ characters)
- Store credentials in secure location (not email/OneDrive)
- Test access quarterly

### Report-Only Mode
All CA policies deploy in Report-Only mode initially:
- Monitor sign-in logs for impact
- Review "What If" analysis in Entra
- Enable policies incrementally after validation

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-15 | Initial release - Phases 1-6 complete |
| 1.1 | 2025-01-21 | Added implementation status, testing requirements, troubleshooting guide, compliance frameworks (SOC2, FedRAMP, CMMC, PCI-DSS), updated tech stack |

---

## Next Steps (Priority Order)

1. **Phase 7: Operational Setup**
   - [ ] Implement Deploy-Users function
   - [ ] Implement Deploy-Exchange function
   - [ ] Implement Deploy-Autopilot function
   - [ ] Implement Deploy-Collaboration function
   - [ ] Add corresponding UI wizard steps

2. **Phase 8: Multi-Tenant Management**
   - [ ] Implement Deploy-Lighthouse function
   - [ ] Create Lighthouse Bicep module
   - [ ] Implement reporting functions
   - [ ] Add MSP wizard step

3. **Testing & Quality**
   - [ ] Create Pester unit tests for all functions
   - [ ] Add integration test suite
   - [ ] Implement code coverage reporting

4. **Compliance Templates**
   - [ ] Create SOC 2 control mappings
   - [ ] Create FedRAMP control mappings
   - [ ] Create industry templates (Legal, Financial, Education)
