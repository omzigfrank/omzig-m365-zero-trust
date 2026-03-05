<#
.SYNOPSIS
    One-time tenant setup for Omzig M365 Zero Trust deployment.
.DESCRIPTION
    Grants all required Microsoft Graph API permissions to the managed identity
    and runs a pre-deployment audit against the client tenant.

    Must be run by a Global Administrator on the client tenant.

    This script:
    1. Signs you into Azure (interactive)
    2. Finds the managed identity's service principal
    3. Dynamically resolves all 17 Graph API permissions
    4. Grants each permission (skips already-granted ones)
    5. Runs a pre-deployment audit to verify tenant readiness
.PARAMETER ResourceGroupName
    Azure resource group containing the managed app deployment.
    If omitted, auto-discovers by searching for Omzig resources.
.PARAMETER ManagedIdentityName
    Name of the user-assigned managed identity (e.g., "id-omzig-test-graph").
    If omitted, searches for identities matching "omzig".
.PARAMETER FunctionAppName
    Name of the Azure Function App. Default: "func-omzig-zerotrust".
.PARAMETER SkipAudit
    Skip calling the Pre-Deploy-Audit function after granting permissions.
.EXAMPLE
    .\setup-tenant.ps1
    # Auto-discovers managed identity, grants permissions, runs audit
.EXAMPLE
    .\setup-tenant.ps1 -ResourceGroupName "OMZIG-ZEROTRUST" -ManagedIdentityName "id-omzig-test-graph"
    # Explicit resource group and identity name
#>

param(
    [string]$ResourceGroupName,
    [string]$ManagedIdentityName,
    [string]$FunctionAppName = "func-omzig-zerotrust",
    [switch]$SkipAudit
)

$ErrorActionPreference = "Stop"

# =========================================================================
# HELPERS
# =========================================================================

function Write-Banner {
    param([string]$Text)
    $line = "=" * 50
    Write-Host ""
    Write-Host $line -ForegroundColor Cyan
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host $line -ForegroundColor Cyan
    Write-Host ""
}

function Write-CheckResult {
    param(
        [string]$Rating,
        [string]$Name,
        [string]$Message,
        [string]$Action
    )

    $pad = $Name.PadRight(32)

    switch ($Rating) {
        "pass"    { Write-Host "  [PASS]    $pad $Message" -ForegroundColor Green }
        "warn"    { Write-Host "  [WARN]    $pad $Message" -ForegroundColor Yellow }
        "fail"    { Write-Host "  [FAIL]    $pad $Message" -ForegroundColor Red }
        "blocker" { Write-Host "  [BLOCK]   $pad $Message" -ForegroundColor DarkRed }
    }

    if ($Action) {
        Write-Host "            $(' ' * 32) Action: $Action" -ForegroundColor DarkYellow
    }
}

# =========================================================================
# STEP 1: SIGN IN
# =========================================================================

Write-Banner "Omzig M365 Zero Trust - Tenant Setup"

Write-Host "Signing in to Azure..." -ForegroundColor White
Write-Host "A browser window will open. Sign in as a Global Administrator." -ForegroundColor Yellow
Write-Host ""

az login --allow-no-subscriptions --output none
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Sign-in failed. You must sign in as a Global Administrator." -ForegroundColor Red
    exit 1
}

# Get tenant info
$accountJson = az account show --output json
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Could not retrieve account info. Ensure 'az login' succeeded." -ForegroundColor Red
    exit 1
}
$account = $accountJson | ConvertFrom-Json
$tenantId = $account.tenantId
$userName = $account.user.name

Write-Host "  Tenant: $tenantId" -ForegroundColor White
Write-Host "  User:   $userName" -ForegroundColor White
Write-Host ""

# Confirm
$confirm = Read-Host "Continue with this tenant? (yes/no)"
if ($confirm -ne "yes") {
    Write-Host "Cancelled." -ForegroundColor Yellow
    exit 0
}

# =========================================================================
# STEP 2: FIND MANAGED IDENTITY
# =========================================================================

Write-Host ""
Write-Host "Locating managed identity..." -ForegroundColor White

$managedIdentitySpId = $null
$foundRg = $null
$foundName = $null

if ($ResourceGroupName -and $ManagedIdentityName) {
    # Direct lookup
    try {
        $idJson = az identity show --resource-group $ResourceGroupName --name $ManagedIdentityName --output json
        if ($LASTEXITCODE -ne 0) { throw "Identity not found" }
        $idInfo = $idJson | ConvertFrom-Json
        $managedIdentitySpId = $idInfo.principalId
        $foundRg = $ResourceGroupName
        $foundName = $ManagedIdentityName
    }
    catch {
        Write-Host "ERROR: Managed identity '$ManagedIdentityName' not found in resource group '$ResourceGroupName'." -ForegroundColor Red
        Write-Host "Verify the resource group and identity name are correct." -ForegroundColor Yellow
        exit 1
    }
}
else {
    # Auto-discover
    Write-Host "  Searching for Omzig managed identities..." -ForegroundColor DarkGray

    $identitiesJson = az identity list --output json
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Could not list managed identities. Check your Azure subscription." -ForegroundColor Red
        exit 1
    }

    $identities = $identitiesJson | ConvertFrom-Json
    $omzigIdentities = @($identities | Where-Object { $_.name -match 'omzig' })

    if ($omzigIdentities.Count -eq 0) {
        Write-Host "ERROR: No managed identities containing 'omzig' found." -ForegroundColor Red
        Write-Host "Usage: .\setup-tenant.ps1 -ResourceGroupName <rg> -ManagedIdentityName <name>" -ForegroundColor Yellow
        exit 1
    }
    elseif ($omzigIdentities.Count -eq 1) {
        $managedIdentitySpId = $omzigIdentities[0].principalId
        $foundRg = $omzigIdentities[0].resourceGroup
        $foundName = $omzigIdentities[0].name
    }
    else {
        Write-Host "  Multiple Omzig identities found:" -ForegroundColor Yellow
        for ($i = 0; $i -lt $omzigIdentities.Count; $i++) {
            Write-Host "    [$($i + 1)] $($omzigIdentities[$i].name) (RG: $($omzigIdentities[$i].resourceGroup))"
        }
        $choice = Read-Host "  Select identity (1-$($omzigIdentities.Count))"
        $idx = 0
        if (-not [int]::TryParse($choice, [ref]$idx)) {
            Write-Host "Invalid selection. Enter a number." -ForegroundColor Red
            exit 1
        }
        $idx = $idx - 1
        if ($idx -lt 0 -or $idx -ge $omzigIdentities.Count) {
            Write-Host "Invalid selection." -ForegroundColor Red
            exit 1
        }
        $managedIdentitySpId = $omzigIdentities[$idx].principalId
        $foundRg = $omzigIdentities[$idx].resourceGroup
        $foundName = $omzigIdentities[$idx].name
    }
}

if (-not $ResourceGroupName) { $ResourceGroupName = $foundRg }

Write-Host "  Found: $foundName" -ForegroundColor Green
Write-Host "  Principal ID: $managedIdentitySpId" -ForegroundColor DarkGray
Write-Host "  Resource Group: $foundRg" -ForegroundColor DarkGray

# =========================================================================
# STEP 3: FIND MICROSOFT GRAPH SERVICE PRINCIPAL
# =========================================================================

Write-Host ""
Write-Host "Resolving Microsoft Graph service principal..." -ForegroundColor White

$graphSpJson = az rest --method GET `
    --url "https://graph.microsoft.com/v1.0/servicePrincipals?`$filter=appId eq '00000003-0000-0000-c000-000000000000'&`$select=id,appRoles" `
    --output json

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Could not find Microsoft Graph service principal." -ForegroundColor Red
    Write-Host "This should not happen. Ensure you are signed in as a Global Admin." -ForegroundColor Yellow
    exit 1
}

$graphSpResult = $graphSpJson | ConvertFrom-Json
if (-not $graphSpResult.value -or $graphSpResult.value.Count -eq 0) {
    Write-Host "ERROR: Microsoft Graph service principal not found in tenant." -ForegroundColor Red
    exit 1
}
$graphSp = $graphSpResult.value[0]
$graphSpId = $graphSp.id
$allAppRoles = $graphSp.appRoles

Write-Host "  Graph SP ID: $graphSpId" -ForegroundColor DarkGray

# =========================================================================
# STEP 4: RESOLVE PERMISSION NAMES TO GUIDS (DYNAMIC)
# =========================================================================

Write-Host ""
Write-Host "Resolving permissions..." -ForegroundColor White

$requiredPermissions = @(
    "Policy.ReadWrite.ConditionalAccess",
    "Policy.Read.All",
    "DeviceManagementConfiguration.ReadWrite.All",
    "DeviceManagementManagedDevices.ReadWrite.All",
    "DeviceManagementServiceConfig.ReadWrite.All",
    "SecurityEvents.ReadWrite.All",
    "User.ReadWrite.All",
    "Group.ReadWrite.All",
    "Directory.ReadWrite.All",
    "Mail.ReadWrite",
    "MailboxSettings.ReadWrite",
    "Sites.FullControl.All",
    "Team.Create",
    "TeamsAppInstallation.ReadWriteForTeam.All",
    "Reports.Read.All",
    "AuditLog.Read.All",
    "InformationProtectionPolicy.Read.All"
)

$permissionMap = @{}
$unmatchedPermissions = @()

foreach ($permName in $requiredPermissions) {
    $matched = @($allAppRoles | Where-Object { $_.value -eq $permName -and $_.allowedMemberTypes -contains "Application" })
    if ($matched.Count -gt 0) {
        $permissionMap[$permName] = $matched[0].id
    }
    else {
        $unmatchedPermissions += $permName
    }
}

if ($unmatchedPermissions.Count -gt 0) {
    Write-Host "ERROR: Could not resolve these permission names:" -ForegroundColor Red
    $unmatchedPermissions | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host "These permissions may not exist in this tenant. Check licensing." -ForegroundColor Yellow
    exit 1
}

Write-Host "  Resolved $($permissionMap.Count)/$($requiredPermissions.Count) permissions" -ForegroundColor Green

# =========================================================================
# STEP 5: CHECK EXISTING GRANTS
# =========================================================================

Write-Host ""
Write-Host "Checking existing permission grants..." -ForegroundColor White

$existingGrantsJson = az rest --method GET `
    --url "https://graph.microsoft.com/v1.0/servicePrincipals/$graphSpId/appRoleAssignedTo?`$filter=principalId eq '$managedIdentitySpId'&`$select=appRoleId" `
    --output json

$grantedRoleIds = @()
if ($LASTEXITCODE -eq 0) {
    $existingGrants = $existingGrantsJson | ConvertFrom-Json
    if ($existingGrants.value) {
        $grantedRoleIds = @($existingGrants.value | ForEach-Object { $_.appRoleId })
    }
}

Write-Host "  Currently granted: $($grantedRoleIds.Count) permissions" -ForegroundColor DarkGray

# =========================================================================
# STEP 6: GRANT MISSING PERMISSIONS
# =========================================================================

Write-Banner "Granting Permissions"

$granted = 0
$skipped = 0
$failed = 0

foreach ($permName in $requiredPermissions) {
    $roleId = $permissionMap[$permName]

    if ($roleId -in $grantedRoleIds) {
        Write-Host "  SKIP: $permName (already granted)" -ForegroundColor DarkGray
        $skipped++
        continue
    }

    Write-Host "  Granting $permName..." -NoNewline

    $body = @{
        principalId = $managedIdentitySpId
        resourceId  = $graphSpId
        appRoleId   = $roleId
    } | ConvertTo-Json

    $bodyFile = Join-Path $env:TEMP "omzig-grant-$(New-Guid).json"
    [System.IO.File]::WriteAllText($bodyFile, $body, [System.Text.UTF8Encoding]::new($false))

    try {
        # Temporarily allow stderr capture without throwing (for 409 conflict detection)
        $prevEAP = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $grantResult = az rest --method POST `
            --url "https://graph.microsoft.com/v1.0/servicePrincipals/$graphSpId/appRoleAssignedTo" `
            --body "@$bodyFile" `
            --output none 2>&1
        $grantExitCode = $LASTEXITCODE
        $ErrorActionPreference = $prevEAP

        if ($grantExitCode -eq 0) {
            Write-Host " OK" -ForegroundColor Green
            $granted++
        }
        else {
            # Check for 409 Conflict (already exists)
            $errorText = $grantResult -join " "
            if ($errorText -match "Permission being assigned already exists") {
                Write-Host " OK (already existed)" -ForegroundColor Green
                $skipped++
            }
            else {
                Write-Host " FAILED" -ForegroundColor Red
                Write-Host "    Error: $errorText" -ForegroundColor DarkRed
                $failed++
            }
        }
    }
    catch {
        Write-Host " ERROR" -ForegroundColor Red
        Write-Host "    $($_.Exception.Message)" -ForegroundColor DarkRed
        $failed++
    }
    finally {
        Remove-Item -Path $bodyFile -Force -ErrorAction SilentlyContinue
    }
}

Write-Host ""
Write-Host "  Summary: $granted granted, $skipped skipped, $failed failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })

if ($failed -gt 0) {
    Write-Host ""
    Write-Host "WARNING: $failed permission(s) failed to grant." -ForegroundColor Red
    Write-Host "Ensure you are signed in as a Global Administrator." -ForegroundColor Yellow
    Write-Host "You can re-run this script to retry failed grants." -ForegroundColor Yellow
}

# =========================================================================
# STEP 7: RUN PRE-DEPLOYMENT AUDIT
# =========================================================================

if (-not $SkipAudit) {
    Write-Banner "Pre-Deployment Audit"

    # Get function key
    $functionKey = $null
    try {
        $keyJson = az functionapp keys list --name $FunctionAppName --resource-group $ResourceGroupName --output json
        if ($LASTEXITCODE -eq 0) {
            $keys = $keyJson | ConvertFrom-Json
            $functionKey = $keys.functionKeys.default
        }
    }
    catch {
        # Silently continue - key retrieval may fail
    }

    if (-not $functionKey) {
        Write-Host "Could not retrieve function key for $FunctionAppName." -ForegroundColor Yellow
        Write-Host "The audit function may not be deployed yet, or the function app name is different." -ForegroundColor Yellow
        Write-Host "You can run the audit manually later." -ForegroundColor Yellow
    }
    else {
        Write-Host "Calling Pre-Deploy-Audit function..." -ForegroundColor White
        Write-Host ""

        $auditBody = @{
            tenantId              = $tenantId
            managedIdentitySpId   = $managedIdentitySpId
            requiredPermissions   = $requiredPermissions
        } | ConvertTo-Json -Depth 5

        try {
            $auditResult = Invoke-RestMethod `
                -Uri "https://$FunctionAppName.azurewebsites.net/api/pre-deploy-audit?code=$functionKey" `
                -Method POST `
                -Body $auditBody `
                -ContentType "application/json" `
                -TimeoutSec 120

            # Display audit results
            if ($auditResult.checks) {
                foreach ($check in $auditResult.checks) {
                    Write-CheckResult -Rating $check.rating `
                        -Name $check.displayName `
                        -Message $check.message `
                        -Action $check.action
                }
            }

            Write-Host ""

            $readiness = $auditResult.overallReadiness
            $summary = $auditResult.summary

            $readinessColor = switch ($readiness) {
                "ready"     { "Green" }
                "caution"   { "Yellow" }
                "not-ready" { "Red" }
                "blocked"   { "DarkRed" }
                default     { "White" }
            }

            $readinessLabel = if ($readiness) { $readiness.ToUpper() } else { "UNKNOWN" }
            Write-Host "  Readiness: $readinessLabel ($($summary.pass) pass, $($summary.warn) warn, $($summary.fail) fail, $($summary.blocker) blocker)" -ForegroundColor $readinessColor
        }
        catch {
            Write-Host "Audit function call failed: $($_.Exception.Message)" -ForegroundColor Yellow
            Write-Host "The function may not be deployed yet. You can run it manually later." -ForegroundColor Yellow
        }
    }
}

# =========================================================================
# STEP 8: NEXT STEPS
# =========================================================================

Write-Banner "Next Steps"

Write-Host "  1. Review any WARN/FAIL/BLOCKER items above" -ForegroundColor White
Write-Host "  2. Deploy: POST /api/orchestrate (or via Azure Portal)" -ForegroundColor White
Write-Host "  3. Review CA policies in Entra admin center (Report-Only mode)" -ForegroundColor White
Write-Host "  4. After validation: .\enable-policies.ps1" -ForegroundColor White
Write-Host ""
Write-Host "  Re-run this script at any time to re-check permissions and audit." -ForegroundColor DarkGray
Write-Host ""
