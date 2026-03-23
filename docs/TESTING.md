# Testing Guide

Complete guide for testing the Omzig M365 Zero Trust solution at every level.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Bicep Template Testing](#bicep-template-testing)
4. [Azure Functions Testing](#azure-functions-testing)
5. [Unit Testing with Pester](#unit-testing-with-pester)
6. [UI Schema Testing](#ui-schema-testing)
7. [Integration Testing](#integration-testing)
8. [End-to-End Testing](#end-to-end-testing)
9. [Validation Checklist](#validation-checklist)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

```powershell
# Azure CLI (required)
winget install Microsoft.AzureCLI

# Bicep CLI (auto-installed with az bicep commands)
az bicep install

# Pester for unit tests (PowerShell testing framework)
Install-Module -Name Pester -Force -SkipPublisherCheck

# Azure Functions Core Tools (for local function testing)
winget install Microsoft.Azure.FunctionsCoreTools
```

### Required Permissions

| Permission | Purpose |
|------------|---------|
| Azure Contributor | Deploy Bicep templates |
| Global Administrator or Security Administrator | Create CA policies, grant Graph permissions |
| Intune Administrator | Device compliance policies |

### Environment Setup

```powershell
# Login to Azure
az login

# Set your subscription
az account set --subscription "YOUR_SUBSCRIPTION_NAME"

# Verify login
az account show
```

---

## Quick Start

Run this script to execute all tests:

```powershell
# From repository root
cd C:\Users\FrankDiaz\omzig-m365-zero-trust

# 1. Validate Bicep
az bicep build --file ./bicep/main.bicep

# 2. Run unit tests
Invoke-Pester -Path ./functions/Tests -Output Detailed

# 3. Test functions (requires deployed function app)
.\test-functions.ps1

# 4. Validate UI schema
# Open: https://portal.azure.com/#blade/Microsoft_Azure_CreateUIDef/SandboxBlade
# Upload: ./ui/createUiDefinition.json
```

---

## Bicep Template Testing

### 1. Syntax Validation

Validates Bicep syntax without deploying:

```powershell
# Validate main.bicep
az bicep build --file ./bicep/main.bicep

# Validate individual modules
az bicep build --file ./bicep/identity/identity.bicep
az bicep build --file ./bicep/devices/devices.bicep
az bicep build --file ./bicep/security/security.bicep
az bicep build --file ./bicep/data/data.bicep
az bicep build --file ./bicep/network/network.bicep
```

**Expected Output:** No errors. Creates corresponding `.json` ARM template files.

### 2. What-If Deployment

Shows what would change without actually deploying:

```powershell
# Resource group deployment what-if
az deployment group what-if `
    --resource-group "OMZIG-ZEROTRUST" `
    --template-file ./bicep/main.bicep `
    --parameters orgName=test securityBaseline=Enhanced

# Subscription-level deployment what-if
az deployment sub what-if `
    --location eastus `
    --template-file ./bicep/main.bicep `
    --parameters orgName=test environmentName=dev hipaaEnabled=false securityBaseline=Enhanced
```

**Expected Output:** List of resources that would be created/modified/deleted.

### 3. Full Validation

Validates the template against Azure without deploying:

```powershell
az deployment group validate `
    --resource-group "OMZIG-ZEROTRUST" `
    --template-file ./bicep/main.bicep `
    --parameters orgName=test securityBaseline=Enhanced
```

**Expected Output:** `"provisioningState": "Succeeded"`

### 4. Build Managed App Template

Build the mainTemplate.json for Azure Marketplace:

```powershell
# Using the build script
.\managed-app\build-template.ps1 -OutputPath .\managed-app -CreateZip

# Or manually
az bicep build --file ./bicep/main.bicep --outfile ./managed-app/mainTemplate.json
```

---

## Azure Functions Testing

### 1. Get Function Key

```powershell
# Get the default function key
$functionKey = az functionapp keys list `
    --name "func-omzig-zerotrust" `
    --resource-group "OMZIG-ZEROTRUST" `
    --query "functionKeys.default" -o tsv

Write-Host "Function Key: $functionKey"
```

### 2. Test Individual Functions

#### Test Orchestrator

```powershell
$baseUrl = "https://func-omzig-zerotrust.azurewebsites.net/api"
$body = @{
    securityBaseline = "Enhanced"
    hipaaEnabled = $true
} | ConvertTo-Json

Invoke-RestMethod `
    -Uri "$baseUrl/orchestrate?code=$functionKey" `
    -Method POST `
    -Body $body `
    -ContentType "application/json" `
    -TimeoutSec 120
```

#### Test Deploy-Identity

```powershell
Invoke-RestMethod `
    -Uri "$baseUrl/deploy/identity?code=$functionKey" `
    -Method POST `
    -Body $body `
    -ContentType "application/json" `
    -TimeoutSec 300
```

#### Test Deploy-Devices

```powershell
Invoke-RestMethod `
    -Uri "$baseUrl/deploy/devices?code=$functionKey" `
    -Method POST `
    -Body $body `
    -ContentType "application/json" `
    -TimeoutSec 300
```

#### Test Deploy-Security

```powershell
Invoke-RestMethod `
    -Uri "$baseUrl/deploy/security?code=$functionKey" `
    -Method POST `
    -Body $body `
    -ContentType "application/json" `
    -TimeoutSec 300
```

#### Test Deploy-Data

```powershell
Invoke-RestMethod `
    -Uri "$baseUrl/deploy/data?code=$functionKey" `
    -Method POST `
    -Body $body `
    -ContentType "application/json" `
    -TimeoutSec 300
```

### 3. Use the Test Script

The repository includes a comprehensive test script:

```powershell
# Run all function tests
.\test-functions.ps1
```

**What it does:**
- Retrieves the function key automatically
- Calls the Orchestrator
- Calls each Deploy-* function
- Reports success/failure for each

### 4. View Function Logs

Monitor live function execution:

```powershell
# Stream live logs
az functionapp log tail `
    --name func-omzig-zerotrust `
    --resource-group OMZIG-ZEROTRUST

# View recent logs
az webapp log download `
    --name func-omzig-zerotrust `
    --resource-group OMZIG-ZEROTRUST `
    --log-file logs.zip
```

### 5. Test with Safe Configuration

Use this configuration for testing to avoid lockouts:

```powershell
$safeTestConfig = @{
    organizationName = "TestOrg"
    primaryDomain = "testorg.onmicrosoft.com"
    adminEmail = "admin@testorg.onmicrosoft.com"
    securityBaseline = "Enhanced"
    hipaaEnabled = $false
    skipDeviceCompliance = $true  # IMPORTANT: Prevents CA004 from being created
} | ConvertTo-Json

Invoke-RestMethod `
    -Uri "$baseUrl/orchestrate?code=$functionKey" `
    -Method POST `
    -Body $safeTestConfig `
    -ContentType "application/json"
```

---

## Unit Testing with Pester

### 1. Run All Unit Tests

```powershell
# Run all tests with detailed output
Invoke-Pester -Path ./functions/Tests -Output Detailed

# Run all tests with summary only
Invoke-Pester -Path ./functions/Tests -Output Minimal
```

### 2. Run Specific Test Files

```powershell
# Test Deploy-Identity function
Invoke-Pester -Path ./functions/Tests/Deploy-Identity.Tests.ps1 -Output Detailed

# Test Deploy-Devices function
Invoke-Pester -Path ./functions/Tests/Deploy-Devices.Tests.ps1 -Output Detailed
```

### 3. Run with Code Coverage

```powershell
# Generate code coverage report
Invoke-Pester -Path ./functions/Tests `
    -CodeCoverage ./functions/Deploy-*/run.ps1 `
    -Output Detailed
```

### 4. Test Specific Contexts

```powershell
# Run only HIPAA-related tests
Invoke-Pester -Path ./functions/Tests -TagFilter "HIPAA" -Output Detailed

# Run only CA policy tests
Invoke-Pester -Path ./functions/Tests -FullNameFilter "*Conditional Access*"
```

### 5. Available Test Suites

| Test File | Coverage |
|-----------|----------|
| `Deploy-Identity.Tests.ps1` | CA policies, break-glass groups, HIPAA settings |
| `Deploy-Devices.Tests.ps1` | Compliance policies, enrollment restrictions |

### 6. Understanding Test Output

```
Describing Deploy-Identity Function
  Context When creating Conditional Access policies
    [+] Should create all 6 CA policies 45ms (42ms|3ms)
    [+] Should create policies in Report-Only mode 12ms (10ms|2ms)
    [+] Should block legacy authentication in CA001 8ms (6ms|2ms)
    [+] Should require MFA for all users in CA002 7ms (5ms|2ms)

Tests completed in 1.2s
Tests Passed: 15, Failed: 0, Skipped: 0
```

---

## UI Schema Testing

### 1. Azure Portal Sandbox

Test the createUiDefinition.json wizard:

1. Navigate to: https://portal.azure.com/#blade/Microsoft_Azure_CreateUIDef/SandboxBlade
2. Click **Upload File**
3. Select `./ui/createUiDefinition.json`
4. Walk through each wizard step
5. Click **Preview Output** to see the generated parameters

### 2. Validate JSON Schema

```powershell
# Basic structure validation
$ui = Get-Content ./ui/createUiDefinition.json | ConvertFrom-Json

# Check required properties
$requiredProps = @('$schema', 'handler', 'version', 'parameters')
foreach ($prop in $requiredProps) {
    if ($ui.PSObject.Properties.Name -contains $prop) {
        Write-Host "✅ $prop exists" -ForegroundColor Green
    } else {
        Write-Host "❌ $prop missing" -ForegroundColor Red
    }
}

# Check steps count
Write-Host "Wizard steps: $($ui.parameters.steps.Count)"
```

### 3. Validate All Wizard Steps

| Step | Name | Validates |
|------|------|-----------|
| 1 | Basics | Subscription, resource group, region |
| 2 | Organization | Org name, domain, admin email |
| 3 | Licensing | M365 tier, Defender plans |
| 4 | Security Baseline | Standard/Enhanced/Maximum |
| 5 | Compliance | HIPAA, DLP, sensitivity labels |
| 6 | Review | Configuration summary |

### 4. Test Output Parameters

After running through the wizard sandbox, verify the output includes:

```json
{
  "orgName": "contoso",
  "primaryDomain": "contoso.com",
  "adminEmail": "admin@contoso.com",
  "securityBaseline": "Enhanced",
  "hipaaEnabled": true,
  "m365LicenseTier": "E5",
  "enableDefenderForEndpoint": true
}
```

---

## Integration Testing

### 1. Deploy to Test Environment

```powershell
# Create a test resource group
az group create --name "OMZIG-TEST" --location eastus

# Deploy with test parameters
az deployment group create `
    --resource-group "OMZIG-TEST" `
    --template-file ./bicep/main.bicep `
    --parameters `
        orgName=testorg `
        environmentName=test `
        securityBaseline=Standard `
        hipaaEnabled=false
```

### 2. Verify Deployed Resources

```powershell
# List all resources
az resource list --resource-group "OMZIG-TEST" --output table

# Expected resources:
# - User Assigned Managed Identity
# - Log Analytics Workspace
# - Storage Account
# - App Service Plan
# - Function App
# - Application Insights
```

### 3. Verify Graph API Permissions

```powershell
# Get managed identity principal ID
$principalId = az identity show `
    --name id-testorg-test-graph `
    --resource-group OMZIG-TEST `
    --query principalId -o tsv

# List granted permissions
az rest --method GET `
    --url "https://graph.microsoft.com/v1.0/servicePrincipals/$principalId/appRoleAssignments" `
    --query "value[].appRoleId" -o table
```

### 4. Verify CA Policies Created

```powershell
az rest --method GET `
    --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" `
    --query "value[?contains(displayName,'CA00')].{Name:displayName,State:state,ID:id}" `
    -o table
```

**Expected output:**

| Name | State | ID |
|------|-------|-----|
| CA001-Block-Legacy-Auth | enabledForReportingButNotEnforced | ... |
| CA002-Require-MFA-All-Users | enabledForReportingButNotEnforced | ... |
| CA003-Require-MFA-Admins | enabledForReportingButNotEnforced | ... |
| CA004-Require-Compliant-Device | enabledForReportingButNotEnforced | ... |
| CA005-Block-High-Risk-Users | enabledForReportingButNotEnforced | ... |
| CA006-MFA-Risky-SignIn | enabledForReportingButNotEnforced | ... |

### 5. Verify Security Groups

```powershell
az rest --method GET `
    --url "https://graph.microsoft.com/v1.0/groups" `
    --query "value[?contains(displayName,'ZeroTrust')].displayName" -o table
```

---

## End-to-End Testing

### 1. Full Deployment Test

```powershell
# 1. Deploy infrastructure
az deployment sub create `
    --location eastus `
    --template-file ./bicep/main.bicep `
    --parameters `
        orgName=e2etest `
        environmentName=test `
        hipaaEnabled=true `
        securityBaseline=Enhanced

# 2. Grant Graph permissions (see DEPLOYMENT-GUIDE.md Phase 2)

# 3. Deploy function code
cd functions
Compress-Archive -Path * -DestinationPath ..\functions.zip -Force
cd ..

az functionapp deployment source config-zip `
    --resource-group rg-e2etest-m365-test `
    --name func-e2etest-zerotrust `
    --src functions.zip

# 4. Run full deployment
$funcKey = az functionapp keys list `
    --name func-e2etest-zerotrust `
    --resource-group rg-e2etest-m365-test `
    --query "functionKeys.default" -o tsv

$body = '{"securityBaseline":"Enhanced","hipaaEnabled":true}'

Invoke-RestMethod `
    -Uri "https://func-e2etest-zerotrust.azurewebsites.net/api/orchestrate?code=$funcKey" `
    -Method POST `
    -Body $body `
    -ContentType "application/json"
```

### 2. Validate All Components

```powershell
# Create validation script
$validation = @{
    azureResources = $false
    graphPermissions = $false
    caPolicies = $false
    compliancePolicies = $false
    securityGroups = $false
}

# Check Azure resources
$resources = az resource list --resource-group "OMZIG-ZEROTRUST" -o json | ConvertFrom-Json
$validation.azureResources = $resources.Count -ge 5

# Check CA policies
$policies = az rest --method GET `
    --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" `
    --query "value[?contains(displayName,'CA00')]" -o json | ConvertFrom-Json
$validation.caPolicies = $policies.Count -ge 6

# Check security groups
$groups = az rest --method GET `
    --url "https://graph.microsoft.com/v1.0/groups" `
    --query "value[?contains(displayName,'ZeroTrust')]" -o json | ConvertFrom-Json
$validation.securityGroups = $groups.Count -ge 1

# Report
Write-Host "`n=== Validation Results ===" -ForegroundColor Cyan
foreach ($check in $validation.GetEnumerator()) {
    $status = if ($check.Value) { "✅ PASS" } else { "❌ FAIL" }
    Write-Host "$status - $($check.Key)"
}
```

### 3. Test Policy Enablement

**IMPORTANT:** Only enable policies after verifying break-glass accounts are configured.

```powershell
# Safe enablement (excludes CA004)
.\enable-policies.ps1

# After verifying Intune devices are enrolled
.\enable-policies.ps1 -IncludeCA004
```

### 4. Cleanup Test Environment

```powershell
# Delete test resource group
az group delete --name "OMZIG-TEST" --yes --no-wait

# Delete CA policies (if needed)
$policies = az rest --method GET `
    --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" `
    --query "value[?contains(displayName,'CA00')].id" -o tsv

foreach ($policyId in $policies) {
    az rest --method DELETE `
        --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies/$policyId"
    Write-Host "Deleted policy: $policyId"
}
```

---

## Validation Checklist

### Infrastructure

- [ ] Bicep syntax validation passes
- [ ] What-if shows expected resources
- [ ] Resource group created
- [ ] Managed identity created
- [ ] Log Analytics workspace created
- [ ] Function App created and running

### Permissions

- [ ] Graph API permissions granted
- [ ] Managed identity assigned to Function App
- [ ] Can query Graph API endpoints

### Conditional Access

- [ ] All 6 CA policies created
- [ ] Policies in Report-Only mode
- [ ] Break-glass group created
- [ ] Break-glass group has members
- [ ] CA004 excludes break-glass group

### Device Compliance

- [ ] Windows compliance policy created
- [ ] iOS compliance policy created
- [ ] Android compliance policy created
- [ ] macOS compliance policy created

### Security Groups

- [ ] ZeroTrust-BreakGlass-Admins exists
- [ ] ZeroTrust-MFA-Excluded exists
- [ ] ZeroTrust-CA-Pilot exists

### Functions

- [ ] Orchestrator returns success
- [ ] Deploy-Identity completes
- [ ] Deploy-Devices completes
- [ ] Deploy-Security completes
- [ ] Deploy-Data completes

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `az bicep build` fails | Invalid Bicep syntax | Check error message, fix syntax |
| Function returns 401 | Invalid or expired key | Get new key with `az functionapp keys list` |
| Function returns 403 | Missing Graph permissions | Grant required permissions (see DEPLOYMENT-GUIDE.md) |
| Function returns 500 | Internal error | Check function logs with `az functionapp log tail` |
| Pester tests fail | Missing module | Run `Install-Module Pester -Force` |
| CA policy already exists | Duplicate deployment | Delete existing policies or skip creation |

### Debug Mode

```powershell
# Enable verbose output in Azure CLI
$env:AZURE_CLI_DEBUG = 1

# Enable PowerShell verbose mode
$VerbosePreference = "Continue"

# Enable Pester diagnostic output
Invoke-Pester -Path ./functions/Tests -Output Diagnostic
```

### View Detailed Errors

```powershell
# Get deployment errors
az deployment group show `
    --resource-group "OMZIG-ZEROTRUST" `
    --name main `
    --query "properties.error"

# Get function execution errors
az monitor activity-log list `
    --resource-group "OMZIG-ZEROTRUST" `
    --status Failed `
    --output table
```

### Reset and Retry

```powershell
# Delete all CA policies
$policies = az rest --method GET `
    --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" `
    --query "value[?contains(displayName,'CA00')].id" -o tsv

foreach ($id in $policies) {
    az rest --method DELETE `
        --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies/$id"
}

# Delete all compliance policies
$compliance = az rest --method GET `
    --url "https://graph.microsoft.com/v1.0/deviceManagement/deviceCompliancePolicies" `
    --query "value[?contains(displayName,'ZeroTrust')].id" -o tsv

foreach ($id in $compliance) {
    az rest --method DELETE `
        --url "https://graph.microsoft.com/v1.0/deviceManagement/deviceCompliancePolicies/$id"
}

# Retry deployment
.\test-functions.ps1
```

---

## CI/CD Pipeline Testing

### Azure DevOps Pipeline

The repository includes CI/CD pipelines that run tests automatically:

```yaml
# pipelines/azure-pipelines.yml
stages:
  - stage: Validate
    jobs:
      - job: BicepValidation
        steps:
          - task: AzureCLI@2
            inputs:
              azureSubscription: 'your-subscription'
              scriptType: 'pscore'
              scriptLocation: 'inlineScript'
              inlineScript: |
                az bicep build --file ./bicep/main.bicep

  - stage: Test
    jobs:
      - job: UnitTests
        steps:
          - task: PowerShell@2
            inputs:
              targetType: 'inline'
              script: |
                Install-Module Pester -Force -SkipPublisherCheck
                Invoke-Pester -Path ./functions/Tests -Output Detailed -CI
```

### Run Pipeline Locally

```powershell
# Simulate pipeline stages
Write-Host "=== Validate Stage ===" -ForegroundColor Cyan
az bicep build --file ./bicep/main.bicep

Write-Host "=== Test Stage ===" -ForegroundColor Cyan
Invoke-Pester -Path ./functions/Tests -Output Detailed

Write-Host "=== Build Stage ===" -ForegroundColor Cyan
.\managed-app\build-template.ps1 -OutputPath .\managed-app -CreateZip
```

---

## Support

- **GitHub Issues**: https://github.com/omzigfrank/omzig-m365-zero-trust/issues
- **Documentation**: See `/docs` folder
- **Deployment Guide**: [DEPLOYMENT-GUIDE.md](./DEPLOYMENT-GUIDE.md)
