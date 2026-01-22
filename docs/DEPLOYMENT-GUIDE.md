# Deployment Guide

Complete step-by-step guide for deploying the Omzig M365 Zero Trust solution manually.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Phase 1: Azure Infrastructure](#phase-1-azure-infrastructure)
3. [Phase 2: Grant Graph API Permissions](#phase-2-grant-graph-api-permissions)
4. [Phase 3: Deploy Azure Functions](#phase-3-deploy-azure-functions)
5. [Phase 4: Create Conditional Access Policies](#phase-4-create-conditional-access-policies)
6. [Phase 5: Create Named Locations](#phase-5-create-named-locations)
7. [Phase 6: Create Security Groups](#phase-6-create-security-groups)
8. [Phase 7: Enable Policies](#phase-7-enable-policies)
9. [Validation](#validation)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

```powershell
# Install Azure CLI (if not installed)
winget install Microsoft.AzureCLI

# Verify installation
az --version
```

### Azure Requirements

- Azure subscription with **Contributor** access
- Permission to create resource groups
- Permission to assign roles

### Microsoft 365 Requirements

| Requirement | Purpose |
|-------------|---------|
| Global Administrator or Security Administrator | Grant Graph API permissions |
| M365 E3/E5 or Business Premium | Core M365 services |
| Entra ID P1/P2 | Conditional Access, Risk-based policies |
| Microsoft Intune (optional) | Device compliance policies |
| Microsoft Defender for Office 365 (optional) | Email protection |

### Required Graph API Permissions

| Permission | Type | Purpose |
|------------|------|---------|
| Policy.ReadWrite.ConditionalAccess | Application | Create/modify CA policies |
| Policy.Read.All | Application | Read existing policies |
| DeviceManagementConfiguration.ReadWrite.All | Application | Intune configuration |
| DeviceManagementManagedDevices.ReadWrite.All | Application | Device management |
| SecurityEvents.ReadWrite.All | Application | Security configuration |

---

## Phase 1: Azure Infrastructure

### Step 1.1: Login to Azure

```powershell
az login
```

### Step 1.2: Select Subscription

```powershell
# List available subscriptions
az account list --output table

# Set the subscription
az account set --subscription "YOUR_SUBSCRIPTION_NAME"
```

### Step 1.3: Clone the Repository

```powershell
git clone https://github.com/omzigfrank/omzig-m365-zero-trust.git
cd omzig-m365-zero-trust
```

### Step 1.4: Deploy Bicep Templates

```powershell
# Deploy at subscription level
az deployment sub create `
  --location eastus `
  --template-file bicep/main.bicep `
  --parameters orgName=contoso `
               environmentName=prod `
               hipaaEnabled=true `
               securityBaseline=Enhanced
```

**Parameters:**

| Parameter | Description | Values |
|-----------|-------------|--------|
| `orgName` | Your organization name (lowercase, no spaces) | e.g., `contoso` |
| `environmentName` | Environment name | `dev`, `test`, `prod` |
| `hipaaEnabled` | Enable HIPAA compliance controls | `true`, `false` |
| `securityBaseline` | Security level | `Standard`, `Enhanced`, `Maximum` |

### Step 1.5: Verify Deployment

```powershell
# List deployed resources
az resource list --resource-group rg-contoso-m365-prod --output table
```

Expected resources:
- User Assigned Managed Identity
- Log Analytics Workspace
- Storage Account
- App Service Plan
- Function App
- Application Insights

---

## Phase 2: Grant Graph API Permissions

### Step 2.1: Get Managed Identity Principal ID

```powershell
$principalId = az identity show `
  --name id-contoso-prod-graph `
  --resource-group rg-contoso-m365-prod `
  --query principalId -o tsv

Write-Host "Principal ID: $principalId"
```

### Step 2.2: Get Microsoft Graph Service Principal

```powershell
$graphSpId = az ad sp list `
  --filter "appId eq '00000003-0000-0000-c000-000000000000'" `
  --query "[0].id" -o tsv

Write-Host "Graph SP ID: $graphSpId"
```

### Step 2.3: Grant Each Permission

Create a JSON file for each permission and assign it:

```powershell
# Permission GUIDs
$permissions = @{
    "Policy.ReadWrite.ConditionalAccess" = "01c0a623-fc9b-48e9-b794-0756f8e8f067"
    "Policy.Read.All" = "246dd0d5-5bd0-4def-940b-0421030a5b68"
    "DeviceManagementConfiguration.ReadWrite.All" = "9241abd9-d0e6-425a-bd4f-47ba86e767a4"
    "DeviceManagementManagedDevices.ReadWrite.All" = "243333ab-4d21-40cb-a475-36241daa0842"
    "SecurityEvents.ReadWrite.All" = "d903a879-88e0-4c09-b0c9-82f6a1333f84"
}

foreach ($perm in $permissions.GetEnumerator()) {
    $body = @{
        principalId = $principalId
        resourceId = $graphSpId
        appRoleId = $perm.Value
    } | ConvertTo-Json

    $body | Out-File -FilePath "temp-perm.json" -Encoding utf8

    az rest --method POST `
      --url "https://graph.microsoft.com/v1.0/servicePrincipals/$principalId/appRoleAssignments" `
      --body "@temp-perm.json"

    Write-Host "Granted: $($perm.Key)"
}

Remove-Item "temp-perm.json"
```

### Step 2.4: Verify Permissions

```powershell
az rest --method GET `
  --url "https://graph.microsoft.com/v1.0/servicePrincipals/$principalId/appRoleAssignments" `
  --query "value[].appRoleId" -o table
```

---

## Phase 3: Deploy Azure Functions

### Step 3.1: Create Storage Account (if not exists)

```powershell
az storage account create `
  --name stcontosofuncs `
  --resource-group rg-contoso-m365-prod `
  --location eastus `
  --sku Standard_LRS
```

### Step 3.2: Create Function App (if not exists)

```powershell
az functionapp create `
  --name func-contoso-zerotrust `
  --resource-group rg-contoso-m365-prod `
  --storage-account stcontosofuncs `
  --consumption-plan-location eastus `
  --runtime powershell `
  --runtime-version 7.2 `
  --functions-version 4 `
  --os-type Windows
```

### Step 3.3: Assign Managed Identity to Function App

```powershell
$identityId = az identity show `
  --name id-contoso-prod-graph `
  --resource-group rg-contoso-m365-prod `
  --query id -o tsv

az functionapp identity assign `
  --name func-contoso-zerotrust `
  --resource-group rg-contoso-m365-prod `
  --identities $identityId
```

### Step 3.4: Deploy Function Code

```powershell
# Create deployment package
cd functions
Compress-Archive -Path * -DestinationPath ..\functions.zip -Force
cd ..

# Deploy to Azure
az functionapp deployment source config-zip `
  --resource-group rg-contoso-m365-prod `
  --name func-contoso-zerotrust `
  --src functions.zip

# Clean up
Remove-Item functions.zip
```

### Step 3.5: Get Function Key

```powershell
$funcKey = az functionapp keys list `
  --name func-contoso-zerotrust `
  --resource-group rg-contoso-m365-prod `
  --query "functionKeys.default" -o tsv

Write-Host "Function Key: $funcKey"
```

---

## Phase 4: Create Conditional Access Policies

### Step 4.1: Call the Deploy-Identity Function

```powershell
$baseUrl = "https://func-contoso-zerotrust.azurewebsites.net/api"
$body = @{
    securityBaseline = "Enhanced"
    hipaaEnabled = $true
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "$baseUrl/deploy/identity?code=$funcKey" `
  -Method POST `
  -Body $body `
  -ContentType "application/json"
```

This creates 6 Conditional Access policies in **Report-Only** mode:

| Policy | Description |
|--------|-------------|
| CA001-Block-Legacy-Auth | Blocks legacy authentication protocols |
| CA002-Require-MFA-All-Users | Requires MFA for all users |
| CA003-Require-MFA-Admins | Requires MFA for admin roles |
| CA004-Require-Compliant-Device | Requires device compliance |
| CA005-Block-High-Risk-Users | Blocks users flagged as high risk |
| CA006-MFA-Risky-SignIn | Requires MFA for risky sign-ins |

### Step 4.2: Verify Policies Were Created

```powershell
az rest --method GET `
  --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" `
  --query "value[?contains(displayName,'CA00')].{Name:displayName,State:state}" `
  -o table
```

---

## Phase 5: Create Named Locations

### Step 5.1: Create Trusted Corporate IPs Location

```powershell
$trustedLocation = @{
    '@odata.type' = '#microsoft.graph.ipNamedLocation'
    displayName = 'ZeroTrust-Trusted-Corporate-IPs'
    isTrusted = $true
    ipRanges = @(
        @{ '@odata.type' = '#microsoft.graph.iPv4CidrRange'; cidrAddress = '10.0.0.0/8' }
        @{ '@odata.type' = '#microsoft.graph.iPv4CidrRange'; cidrAddress = '172.16.0.0/12' }
        @{ '@odata.type' = '#microsoft.graph.iPv4CidrRange'; cidrAddress = '192.168.0.0/16' }
        # Add your actual corporate IP ranges here
    )
} | ConvertTo-Json -Depth 5

$trustedLocation | Out-File "trusted-location.json" -Encoding utf8

az rest --method POST `
  --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/namedLocations" `
  --body "@trusted-location.json"

Remove-Item "trusted-location.json"
```

### Step 5.2: Create Blocked Countries Location

```powershell
$blockedCountries = @{
    '@odata.type' = '#microsoft.graph.countryNamedLocation'
    displayName = 'ZeroTrust-Blocked-Countries'
    countriesAndRegions = @('KP', 'IR', 'RU', 'CN', 'BY')
    includeUnknownCountriesAndRegions = $false
} | ConvertTo-Json -Depth 5

$blockedCountries | Out-File "blocked-countries.json" -Encoding utf8

az rest --method POST `
  --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/namedLocations" `
  --body "@blocked-countries.json"

Remove-Item "blocked-countries.json"
```

### Step 5.3: Create CA007 - Block High Risk Countries

```powershell
# Get the blocked countries location ID
$locationId = az rest --method GET `
  --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/namedLocations" `
  --query "value[?displayName=='ZeroTrust-Blocked-Countries'].id" -o tsv

# Get the MFA excluded group ID (created in Phase 6)
$excludeGroupId = az rest --method GET `
  --url "https://graph.microsoft.com/v1.0/groups" `
  --query "value[?displayName=='ZeroTrust-MFA-Excluded'].id" -o tsv

$ca007Policy = @{
    displayName = "CA007-Block-High-Risk-Countries"
    state = "enabled"
    conditions = @{
        users = @{
            includeUsers = @("All")
            excludeGroups = @($excludeGroupId)
        }
        applications = @{
            includeApplications = @("All")
        }
        locations = @{
            includeLocations = @($locationId)
        }
    }
    grantControls = @{
        operator = "OR"
        builtInControls = @("block")
    }
} | ConvertTo-Json -Depth 10

$ca007Policy | Out-File "ca007-policy.json" -Encoding utf8

az rest --method POST `
  --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" `
  --body "@ca007-policy.json"

Remove-Item "ca007-policy.json"
```

---

## Phase 6: Create Security Groups

### Step 6.1: Create Emergency Access Group

```powershell
$mfaExcluded = @{
    displayName = "ZeroTrust-MFA-Excluded"
    description = "Emergency access accounts excluded from MFA requirements"
    mailEnabled = $false
    mailNickname = "ZeroTrustMFAExcluded"
    securityEnabled = $true
} | ConvertTo-Json

$mfaExcluded | Out-File "group-mfa-excluded.json" -Encoding utf8

az rest --method POST `
  --url "https://graph.microsoft.com/v1.0/groups" `
  --body "@group-mfa-excluded.json"

Remove-Item "group-mfa-excluded.json"
```

### Step 6.2: Create Pilot Group

```powershell
$caPilot = @{
    displayName = "ZeroTrust-CA-Pilot"
    description = "Pilot group for testing Conditional Access policies"
    mailEnabled = $false
    mailNickname = "ZeroTrustCAPilot"
    securityEnabled = $true
} | ConvertTo-Json

$caPilot | Out-File "group-ca-pilot.json" -Encoding utf8

az rest --method POST `
  --url "https://graph.microsoft.com/v1.0/groups" `
  --body "@group-ca-pilot.json"

Remove-Item "group-ca-pilot.json"
```

### Step 6.3: Create Device Compliance Group

```powershell
$deviceCompliance = @{
    displayName = "ZeroTrust-Device-Compliance-Required"
    description = "Users requiring compliant devices"
    mailEnabled = $false
    mailNickname = "ZeroTrustDeviceCompliance"
    securityEnabled = $true
} | ConvertTo-Json

$deviceCompliance | Out-File "group-device-compliance.json" -Encoding utf8

az rest --method POST `
  --url "https://graph.microsoft.com/v1.0/groups" `
  --body "@group-device-compliance.json"

Remove-Item "group-device-compliance.json"
```

---

## Phase 7: Enable Policies

### Step 7.1: List All Policies

```powershell
az rest --method GET `
  --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" `
  --query "value[?contains(displayName,'CA00')].{Name:displayName,State:state,ID:id}" `
  -o table
```

### Step 7.2: Enable Each Policy

```powershell
# Get all policy IDs
$policies = az rest --method GET `
  --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" `
  --query "value[?contains(displayName,'CA00')].id" -o tsv

$enableBody = '{"state":"enabled"}'
$enableBody | Out-File "enable-body.json" -Encoding utf8

foreach ($policyId in $policies) {
    az rest --method PATCH `
      --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies/$policyId" `
      --body "@enable-body.json"

    Write-Host "Enabled policy: $policyId"
}

Remove-Item "enable-body.json"
```

### Step 7.3: Verify All Policies Are Enabled

```powershell
az rest --method GET `
  --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" `
  --query "value[].{Name:displayName,State:state}" -o table
```

---

## Validation

### Test 1: Verify Azure Resources

```powershell
az resource list --resource-group rg-contoso-m365-prod --output table
```

### Test 2: Verify Graph API Permissions

```powershell
az rest --method GET `
  --url "https://graph.microsoft.com/v1.0/servicePrincipals/$principalId/appRoleAssignments" `
  --query "value[].appRoleId" -o table
```

### Test 3: Verify CA Policies

```powershell
az rest --method GET `
  --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" `
  --query "value[].{Name:displayName,State:state}" -o table
```

### Test 4: Verify Named Locations

```powershell
az rest --method GET `
  --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/namedLocations" `
  --query "value[].displayName" -o table
```

### Test 5: Verify Security Groups

```powershell
az rest --method GET `
  --url "https://graph.microsoft.com/v1.0/groups" `
  --query "value[?contains(displayName,'ZeroTrust')].displayName" -o table
```

### Test 6: Call Orchestrator Function

```powershell
$response = Invoke-RestMethod `
  -Uri "$baseUrl/orchestrate?code=$funcKey" `
  -Method POST `
  -Body '{"securityBaseline":"Enhanced","hipaaEnabled":true}' `
  -ContentType "application/json"

$response | ConvertTo-Json -Depth 10
```

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Insufficient privileges" | Missing Graph API permissions | Re-run Phase 2 permission assignments |
| "BlockEveryonePolicy" error | CA policy would block all users | Add exclusion group to policy |
| Function returns 401 | Missing or invalid function key | Get new key with `az functionapp keys list` |
| Function returns 500 | Managed identity not configured | Re-run Step 3.3 identity assignment |
| Policies in Report-Only | Not enabled yet | Run Phase 7 to enable policies |

### View Function Logs

```powershell
az webapp log tail `
  --name func-contoso-zerotrust `
  --resource-group rg-contoso-m365-prod
```

### View Deployment Logs

```powershell
az deployment sub show `
  --name main `
  --query "properties.outputs"
```

### Rollback: Disable All CA Policies

```powershell
$disableBody = '{"state":"disabled"}'
$disableBody | Out-File "disable-body.json" -Encoding utf8

$policies = az rest --method GET `
  --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" `
  --query "value[?contains(displayName,'CA00')].id" -o tsv

foreach ($policyId in $policies) {
    az rest --method PATCH `
      --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies/$policyId" `
      --body "@disable-body.json"
}

Remove-Item "disable-body.json"
```

### Rollback: Delete Resource Group

```powershell
az group delete --name rg-contoso-m365-prod --yes --no-wait
```

---

## Summary Checklist

- [ ] Azure CLI installed and logged in
- [ ] Subscription selected
- [ ] Repository cloned
- [ ] Bicep templates deployed
- [ ] Managed identity created
- [ ] Graph API permissions granted (5 permissions)
- [ ] Function App created
- [ ] Function code deployed
- [ ] CA policies created (7 policies)
- [ ] Named locations created (2 locations)
- [ ] Security groups created (3 groups)
- [ ] All policies enabled
- [ ] Validation tests passed

---

## Support

- **GitHub Issues**: https://github.com/omzigfrank/omzig-m365-zero-trust/issues
- **Documentation**: See `/docs` folder
