<#
.SYNOPSIS
    Enables Conditional Access policies from Report-Only to Enabled mode.
.DESCRIPTION
    This script enables ZeroTrust CA policies. CA004 (device compliance) requires
    special handling to prevent lockout.

    CRITICAL: Before enabling CA004, ensure:
    1. At least one device is enrolled in Intune
    2. A break-glass admin account exists in ZeroTrust-BreakGlass-Admins group
.PARAMETER IncludeCA004
    Include CA004-Require-Compliant-Device. Requires explicit confirmation.
.PARAMETER Force
    Skip safety checks (DANGEROUS - can cause lockout)
.EXAMPLE
    .\enable-policies.ps1
    Enables all policies EXCEPT CA004 (safe default)
.EXAMPLE
    .\enable-policies.ps1 -IncludeCA004
    Enables all policies INCLUDING CA004 (requires Intune devices)
#>

param(
    [switch]$IncludeCA004,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$az = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"

# Policy definitions — load from policy-config.json or fall back to environment variables
$configPath = Join-Path $PSScriptRoot "policy-config.json"
if (Test-Path $configPath) {
    $policyConfig = Get-Content $configPath -Raw | ConvertFrom-Json
    $policies = @()
    foreach ($p in $policyConfig) {
        $policies += @{ id = $p.id; name = $p.name; safe = $p.safe }
    }
    Write-Host "Loaded $($policies.Count) policy definitions from policy-config.json" -ForegroundColor Cyan
}
else {
    Write-Host "ERROR: policy-config.json not found at $configPath" -ForegroundColor Red
    Write-Host "Create it from policy-config.example.json with your tenant-specific policy GUIDs." -ForegroundColor Yellow
    exit 1
}

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Zero Trust CA Policy Enablement Script" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Safety checks for CA004
if ($IncludeCA004 -and -not $Force) {
    Write-Host "WARNING: CA004 (Require Compliant Device) selected!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "This policy will BLOCK ACCESS for ALL users on non-compliant devices." -ForegroundColor Yellow
    Write-Host "Before proceeding, verify:" -ForegroundColor Yellow
    Write-Host "  1. Devices are enrolled in Intune" -ForegroundColor White
    Write-Host "  2. Break-glass admin is in 'ZeroTrust-BreakGlass-Admins' group" -ForegroundColor White
    Write-Host ""

    # Check for Intune enrolled devices
    Write-Host "Checking for Intune enrolled devices..." -ForegroundColor Cyan
    try {
        $deviceCheck = & $az rest --method GET --url "https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?`$top=1" 2>&1
        $devices = $deviceCheck | ConvertFrom-Json -ErrorAction SilentlyContinue

        if (-not $devices.value -or $devices.value.Count -eq 0) {
            Write-Host ""
            Write-Host "ERROR: No devices enrolled in Intune!" -ForegroundColor Red
            Write-Host "Enabling CA004 will lock out ALL users." -ForegroundColor Red
            Write-Host ""
            Write-Host "Enroll at least one device in Intune before enabling CA004." -ForegroundColor Yellow
            Write-Host "Use -Force to override (NOT RECOMMENDED)" -ForegroundColor Yellow
            exit 1
        }
        else {
            Write-Host "  Found $($devices.value.Count)+ device(s) enrolled in Intune" -ForegroundColor Green
        }
    }
    catch {
        Write-Host "  Warning: Could not verify Intune devices. Proceed with caution." -ForegroundColor Yellow
    }

    # Check for break-glass group
    Write-Host "Checking for break-glass admin group..." -ForegroundColor Cyan
    try {
        $groupCheck = & $az rest --method GET --url "https://graph.microsoft.com/v1.0/groups?`$filter=displayName eq 'ZeroTrust-BreakGlass-Admins'" 2>&1
        $groups = $groupCheck | ConvertFrom-Json -ErrorAction SilentlyContinue

        if (-not $groups.value -or $groups.value.Count -eq 0) {
            Write-Host "  Warning: Break-glass group not found!" -ForegroundColor Yellow
            Write-Host "  Run Deploy-Identity function first to create it." -ForegroundColor Yellow
        }
        else {
            $groupId = $groups.value[0].id
            # Check if group has members
            $memberCheck = & $az rest --method GET --url "https://graph.microsoft.com/v1.0/groups/$groupId/members?`$top=1" 2>&1
            $members = $memberCheck | ConvertFrom-Json -ErrorAction SilentlyContinue

            if (-not $members.value -or $members.value.Count -eq 0) {
                Write-Host "  Warning: Break-glass group exists but has NO MEMBERS!" -ForegroundColor Yellow
                Write-Host "  Add a break-glass admin account to prevent lockout." -ForegroundColor Yellow
            }
            else {
                Write-Host "  Break-glass group found with member(s)" -ForegroundColor Green
            }
        }
    }
    catch {
        Write-Host "  Warning: Could not verify break-glass group." -ForegroundColor Yellow
    }

    Write-Host ""
    $confirm = Read-Host "Do you want to continue enabling CA004? (yes/no)"
    if ($confirm -ne "yes") {
        Write-Host "Aborted. CA004 will NOT be enabled." -ForegroundColor Yellow
        $IncludeCA004 = $false
    }
}

# Create the body file for PATCH request
$bodyFile = Join-Path $PSScriptRoot "enable-body.json"
'{"state": "enabled"}' | Out-File -FilePath $bodyFile -Encoding utf8 -Force

Write-Host ""
Write-Host "Enabling policies..." -ForegroundColor Cyan
Write-Host ""

$enabled = 0
$skipped = 0
$failed = 0

foreach ($policy in $policies) {
    # Skip CA004 unless explicitly requested
    if (-not $policy.safe -and -not $IncludeCA004) {
        Write-Host "  SKIP: $($policy.name) (use -IncludeCA004 to enable)" -ForegroundColor Yellow
        $skipped++
        continue
    }

    Write-Host "  Enabling $($policy.name)..." -NoNewline
    $url = "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies/$($policy.id)"

    try {
        & $az rest --method PATCH --url $url --body "@$bodyFile" -o none 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host " OK" -ForegroundColor Green
            $enabled++
        }
        else {
            Write-Host " FAILED" -ForegroundColor Red
            $failed++
        }
    }
    catch {
        Write-Host " ERROR: $($_.Exception.Message)" -ForegroundColor Red
        $failed++
    }
}

# Cleanup
Remove-Item -Path $bodyFile -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Summary: $enabled enabled, $skipped skipped, $failed failed" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

if ($skipped -gt 0 -and -not $IncludeCA004) {
    Write-Host ""
    Write-Host "Note: CA004 was skipped for safety. To enable it:" -ForegroundColor Yellow
    Write-Host "  1. Enroll devices in Intune" -ForegroundColor White
    Write-Host "  2. Add a break-glass admin to 'ZeroTrust-BreakGlass-Admins'" -ForegroundColor White
    Write-Host "  3. Run: .\enable-policies.ps1 -IncludeCA004" -ForegroundColor White
}
