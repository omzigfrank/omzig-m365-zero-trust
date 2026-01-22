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

## CRITICAL: Break-Glass Admin Setup

> **WARNING: CA004 (Require Compliant Device) can cause COMPLETE TENANT LOCKOUT if enabled without proper safeguards.**

Before enabling any device compliance policies, you MUST:

### 1. Create a Break-Glass Admin Account

A break-glass account is an emergency access account that bypasses conditional access policies:

- Create a cloud-only account (e.g., `breakglass@yourdomain.onmicrosoft.com`)
- Assign Global Administrator role
- Use a strong, unique password stored securely offline
- Do NOT enroll this account's devices in Intune
- Do NOT require MFA (or use FIDO2 key stored in a safe)

### 2. Add to Break-Glass Security Group

The `Deploy-Identity` function automatically creates a `ZeroTrust-BreakGlass-Admins` security group. Add your break-glass account to this group:

```powershell
# Get the break-glass group ID
$groupId = az rest --method GET `
  --url "https://graph.microsoft.com/v1.0/groups?`$filter=displayName eq 'ZeroTrust-BreakGlass-Admins'" `
  --query "value[0].id" -o tsv

# Get the break-glass user ID
$userId = az rest --method GET `
  --url "https://graph.microsoft.com/v1.0/users?`$filter=userPrincipalName eq 'breakglass@yourdomain.onmicrosoft.com'" `
  --query "value[0].id" -o tsv

# Add user to group
$body = @{ '@odata.id' = "https://graph.microsoft.com/v1.0/directoryObjects/$userId" } | ConvertTo-Json
$body | Out-File "add-member.json" -Encoding utf8

az rest --method POST `
  --url "https://graph.microsoft.com/v1.0/groups/$groupId/members/`$ref" `
  --body "@add-member.json"

Remove-Item "add-member.json"
```

### 3. Enroll Devices in Intune BEFORE Enabling CA004

CA004 requires devices to be compliant. A device can only be compliant if:
- It is enrolled in Microsoft Intune
- It passes all compliance policy checks

**If no devices are enrolled, NO user can sign in when CA004 is enabled.**

To enroll a Windows device:
1. Go to **Settings > Accounts > Access work or school**
2. Click **Connect**
3. Sign in with your work account
4. Follow prompts to enroll in device management

### 4. Use Safe Policy Enablement

The `enable-policies.ps1` script has safety features:

```powershell
# Safe: Enables all policies EXCEPT CA004
.\enable-policies.ps1

# Only after devices are enrolled and break-glass is configured:
.\enable-policies.ps1 -IncludeCA004
```

The script will:
- Check for Intune enrolled devices
- Verify break-glass group exists and has members
- Require explicit "yes" confirmation before enabling CA004

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

This creates:
- **6 Conditional Access policies** in **Report-Only** mode
- **ZeroTrust-BreakGlass-Admins** security group (for CA004 exclusion)

| Policy | Description | Exclusions |
|--------|-------------|------------|
| CA001-Block-Legacy-Auth | Blocks legacy authentication protocols | None |
| CA002-Require-MFA-All-Users | Requires MFA for all users | Guests |
| CA003-Require-MFA-Admins | Requires MFA for admin roles | None |
| CA004-Require-Compliant-Device | Requires device compliance | **ZeroTrust-BreakGlass-Admins** |
| CA005-Block-High-Risk-Users | Blocks users flagged as high risk | None |
| CA006-MFA-Risky-SignIn | Requires MFA for risky sign-ins | None |

> **Important:** CA004 automatically excludes the `ZeroTrust-BreakGlass-Admins` group to prevent lockout. Add your break-glass admin account to this group before enabling CA004!

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

> **Note:** The `ZeroTrust-BreakGlass-Admins` group is automatically created by the `Deploy-Identity` function. If you need to create it manually, use Step 6.1.

### Step 6.1: Create Break-Glass Admin Group (CRITICAL)

This group is excluded from CA004 (device compliance) to prevent lockout:

```powershell
$breakGlass = @{
    displayName = "ZeroTrust-BreakGlass-Admins"
    description = "Emergency access group excluded from device compliance policies. Add break-glass admin accounts here to prevent lockout."
    mailEnabled = $false
    mailNickname = "ZeroTrustBreakGlass"
    securityEnabled = $true
} | ConvertTo-Json

$breakGlass | Out-File "group-break-glass.json" -Encoding utf8

az rest --method POST `
  --url "https://graph.microsoft.com/v1.0/groups" `
  --body "@group-break-glass.json"

Remove-Item "group-break-glass.json"
```

**IMPORTANT:** Add at least one break-glass admin account to this group before enabling CA004!

### Step 6.2: Create MFA Exclusion Group

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

> **CRITICAL:** Follow this process carefully to avoid lockout. CA004 is intentionally handled separately due to its lockout risk.

### Step 7.1: Pre-Flight Checklist

Before enabling any policies, verify:

- [ ] Break-glass admin account exists
- [ ] Break-glass account is in `ZeroTrust-BreakGlass-Admins` group
- [ ] At least one device is enrolled in Intune (if planning to enable CA004)
- [ ] You have tested sign-in with the break-glass account

```powershell
# Verify break-glass group has members
$groupId = az rest --method GET `
  --url "https://graph.microsoft.com/v1.0/groups?`$filter=displayName eq 'ZeroTrust-BreakGlass-Admins'" `
  --query "value[0].id" -o tsv

az rest --method GET `
  --url "https://graph.microsoft.com/v1.0/groups/$groupId/members" `
  --query "value[].displayName" -o table

# Verify Intune enrolled devices (required for CA004)
az rest --method GET `
  --url "https://graph.microsoft.com/v1.0/deviceManagement/managedDevices" `
  --query "value[].{Name:deviceName,Compliance:complianceState,User:userPrincipalName}" -o table
```

### Step 7.2: List All Policies

```powershell
az rest --method GET `
  --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" `
  --query "value[?contains(displayName,'CA00')].{Name:displayName,State:state,ID:id}" `
  -o table
```

### Step 7.3: Enable Safe Policies (Recommended Method)

Use the `enable-policies.ps1` script which has built-in safety checks:

```powershell
# Enable all policies EXCEPT CA004 (safe default)
.\enable-policies.ps1

# Output:
# =============================================
#   Zero Trust CA Policy Enablement Script
# =============================================
#
#   Enabling CA001-Block-Legacy-Auth... OK
#   Enabling CA002-Require-MFA-All-Users... OK
#   Enabling CA003-Require-MFA-Admins... OK
#   SKIP: CA004-Require-Compliant-Device (use -IncludeCA004 to enable)
#   Enabling CA005-Block-High-Risk-Users... OK
#   Enabling CA006-MFA-Risky-SignIn... OK
```

### Step 7.4: Enable CA004 (After Device Enrollment)

Only enable CA004 after:
1. Devices are enrolled in Intune
2. Devices pass compliance checks
3. Break-glass account is configured

```powershell
# Enable CA004 with safety checks
.\enable-policies.ps1 -IncludeCA004

# The script will:
# 1. Check for Intune enrolled devices (blocks if none found)
# 2. Verify break-glass group exists and has members
# 3. Require you to type "yes" to confirm
```

### Step 7.5: Manual Policy Enablement (Alternative)

If you prefer manual enablement (NOT recommended for CA004):

```powershell
# Enable a single policy by ID
$policyId = "YOUR_POLICY_ID"
$enableBody = '{"state":"enabled"}'
$enableBody | Out-File "enable-body.json" -Encoding utf8

az rest --method PATCH `
  --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies/$policyId" `
  --body "@enable-body.json"

Remove-Item "enable-body.json"
```

### Step 7.6: Verify All Policies Are Enabled

```powershell
az rest --method GET `
  --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" `
  --query "value[].{Name:displayName,State:state}" -o table
```

Expected output after safe enablement:
```
Name                             State
-------------------------------  --------------------------
CA001-Block-Legacy-Auth          enabled
CA002-Require-MFA-All-Users      enabled
CA003-Require-MFA-Admins         enabled
CA004-Require-Compliant-Device   enabledForReportingButNotEnforced  # Still in report-only
CA005-Block-High-Risk-Users      enabled
CA006-MFA-Risky-SignIn           enabled
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
| **Locked out of tenant** | CA004 enabled without Intune devices | See [Lockout Recovery](#lockout-recovery-ca004) |
| Sign-in error 53000 | Device not compliant | Enroll device in Intune or use break-glass account |

### Lockout Recovery (CA004)

If you enabled CA004 without enrolled Intune devices and are locked out:

#### Option 1: Use Break-Glass Account (If Configured)

1. Sign in with your break-glass admin account
2. Navigate to **Entra ID > Protection > Conditional Access**
3. Find **CA004-Require-Compliant-Device**
4. Change state to **Report-Only** or **Off**

#### Option 2: Use Azure CLI with Service Principal

If you have a service principal configured:

```powershell
# Login with service principal
az login --service-principal -u $appId -p $secret --tenant $tenantId

# Delete CA004
az rest --method DELETE `
  --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies/CA004_POLICY_ID"
```

#### Option 3: Use Azure CLI from Another Machine

If you can access Azure CLI from a different tenant/subscription:

```powershell
# Login to the affected tenant
az login --tenant YOUR_TENANT_ID

# List CA policies to find CA004's ID
az rest --method GET `
  --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" `
  --query "value[?displayName=='CA004-Require-Compliant-Device'].id" -o tsv

# Delete the policy (replace with actual ID)
az rest --method DELETE `
  --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies/POLICY_ID_HERE"
```

#### Option 4: Contact Microsoft Support

If all else fails:
1. Open a support case with Microsoft
2. Request emergency tenant access
3. Provide proof of tenant ownership

#### Post-Recovery Steps

After regaining access:

1. **Create a break-glass account** if you don't have one
2. **Add it to the exclusion group**: `ZeroTrust-BreakGlass-Admins`
3. **Enroll devices in Intune** before re-enabling CA004
4. **Clear browser cache** - old tokens may still enforce the deleted policy
5. **Test thoroughly** in Report-Only mode before enabling

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

### Infrastructure
- [ ] Azure CLI installed and logged in
- [ ] Subscription selected
- [ ] Repository cloned
- [ ] Bicep templates deployed
- [ ] Managed identity created
- [ ] Graph API permissions granted (5 permissions)
- [ ] Function App created
- [ ] Function code deployed

### Policies & Groups
- [ ] CA policies created (6 policies in Report-Only mode)
- [ ] Named locations created (2 locations)
- [ ] Security groups created (4 groups including break-glass)

### Break-Glass Setup (CRITICAL)
- [ ] Break-glass admin account created
- [ ] Break-glass account added to `ZeroTrust-BreakGlass-Admins` group
- [ ] Break-glass account tested (can sign in successfully)

### Device Compliance (Before CA004)
- [ ] At least one device enrolled in Intune
- [ ] Device passes compliance checks
- [ ] Verified with `enable-policies.ps1 -IncludeCA004` pre-flight checks

### Policy Enablement
- [ ] Safe policies enabled (CA001-003, CA005-006) via `enable-policies.ps1`
- [ ] CA004 enabled only after device enrollment
- [ ] Validation tests passed

---

## Support

- **GitHub Issues**: https://github.com/omzigfrank/omzig-m365-zero-trust/issues
- **Documentation**: See `/docs` folder
