using namespace System.Net

param($Request, $TriggerMetadata)

<#
.SYNOPSIS
    Deploys Identity pillar configuration via Microsoft Graph
.DESCRIPTION
    Creates Conditional Access policies for M365 Zero Trust
#>

$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot '..' 'Modules' 'GraphHelper.psm1') -Force

Write-Host "Deploy-Identity started"

try {
    $config = $Request.Body
    if (-not $config) {
        $config = @{
            securityBaseline = "Enhanced"
            hipaaEnabled = $false
        }
    }

    $connected = Connect-GraphWithManagedIdentity
    if (-not $connected) {
        throw "Failed to connect to Microsoft Graph"
    }

    # Read UI toggles with defaults (respect user choices)
    $requireMfa = $(if ($null -ne $config.requireMfa) { [bool]$config.requireMfa } else { $true })
    $blockLegacyAuth = $(if ($null -ne $config.blockLegacyAuth) { [bool]$config.blockLegacyAuth } else { $true })
    $requireCompliantDevice = $(if ($null -ne $config.requireCompliantDevice) { [bool]$config.requireCompliantDevice } else { $true })

    $results = @{
        conditionalAccessPolicies = @()
        skippedPolicies = @()
        breakGlassGroup = $null
    }

    # =========================================================================
    # BREAK-GLASS ADMIN GROUP
    # =========================================================================
    $breakGlassGroupName = "ZeroTrust-BreakGlass-Admins"
    $safeGroupName = Format-ODataFilterValue -Value $breakGlassGroupName
    $breakGlassGroup = $null

    try {
        Write-Host "Checking for break-glass admin group..."
        $existingGroups = Invoke-GraphRequestWithRetry -Method GET `
            -Uri "https://graph.microsoft.com/v1.0/groups?`$filter=displayName eq '$safeGroupName'"

        if ($existingGroups.value -and $existingGroups.value.Count -gt 0) {
            $breakGlassGroup = $existingGroups.value[0]
            Write-Host "Break-glass group exists: $($breakGlassGroup.id)"
        }
        else {
            Write-Host "Creating break-glass admin group..."
            $groupBody = @{
                displayName = $breakGlassGroupName
                description = "Emergency access group excluded from device compliance policies. Add break-glass admin accounts here to prevent lockout."
                mailEnabled = $false
                mailNickname = "ZeroTrustBreakGlass"
                securityEnabled = $true
            }
            $breakGlassGroup = Invoke-GraphRequestWithRetry -Method POST `
                -Uri "https://graph.microsoft.com/v1.0/groups" `
                -Body $groupBody
            Write-Host "Created break-glass group: $($breakGlassGroup.id)"
        }

        $results.breakGlassGroup = @{
            id = $breakGlassGroup.id
            displayName = $breakGlassGroupName
            status = "Ready"
        }
    }
    catch {
        Write-Host "Warning: Could not create break-glass group: $($_.Exception.Message)"
        $results.breakGlassGroup = @{
            status = "Failed"
            error = $_.Exception.Message
        }
    }

    # Define the 6 CA policies
    $caPolicies = @(
        @{
            displayName = "CA001-Block-Legacy-Auth"
            state = "enabledForReportingButNotEnforced"
            conditions = @{
                users = @{ includeUsers = @("All") }
                applications = @{ includeApplications = @("All") }
                clientAppTypes = @("exchangeActiveSync", "other")
            }
            grantControls = @{
                operator = "OR"
                builtInControls = @("block")
            }
        },
        @{
            displayName = "CA002-Require-MFA-All-Users"
            state = "enabledForReportingButNotEnforced"
            conditions = @{
                users = @{ includeUsers = @("All"); excludeUsers = @("GuestsOrExternalUsers") }
                applications = @{ includeApplications = @("All") }
            }
            grantControls = @{
                operator = "OR"
                builtInControls = @("mfa")
            }
        },
        @{
            displayName = "CA003-Require-MFA-Admins"
            state = "enabledForReportingButNotEnforced"
            conditions = @{
                users = @{
                    includeRoles = @(
                        "62e90394-69f5-4237-9190-012177145e10",  # Global Administrator
                        "194ae4cb-b126-40b2-bd5b-6091b380977d",  # Security Administrator
                        "f28a1f50-f6e7-4571-818b-6a12f2af6b6c"   # SharePoint Administrator
                    )
                }
                applications = @{ includeApplications = @("All") }
            }
            grantControls = @{
                operator = "OR"
                builtInControls = @("mfa")
            }
        },
        # =====================================================================
        # CA004 - CRITICAL WARNING
        # This policy can cause COMPLETE LOCKOUT if enabled without:
        # 1. At least one device enrolled in Intune
        # 2. A break-glass admin account in the exclusion group
        # Policy is created in Report-Only mode for safety.
        # DO NOT enable until devices are enrolled in Intune!
        # =====================================================================
        @{
            displayName = "CA004-Require-Compliant-Device"
            state = "enabledForReportingButNotEnforced"
            conditions = @{
                users = @{
                    includeUsers = @("All")
                    # Exclude break-glass admin group to prevent lockout
                    excludeGroups = $(if ($breakGlassGroup) { @($breakGlassGroup.id) } else { @() })
                }
                applications = @{ includeApplications = @("All") }
                platforms = @{ includePlatforms = @("windows", "macOS", "iOS", "android") }
            }
            grantControls = @{
                operator = "OR"
                builtInControls = @("compliantDevice")
            }
        },
        @{
            displayName = "CA005-Block-High-Risk-Users"
            state = "enabledForReportingButNotEnforced"
            conditions = @{
                users = @{ includeUsers = @("All") }
                applications = @{ includeApplications = @("All") }
                userRiskLevels = @("high")
            }
            grantControls = @{
                operator = "OR"
                builtInControls = @("block")
            }
        },
        @{
            displayName = "CA006-MFA-Risky-SignIn"
            state = "enabledForReportingButNotEnforced"
            conditions = @{
                users = @{ includeUsers = @("All") }
                applications = @{ includeApplications = @("All") }
                signInRiskLevels = @("medium", "high")
            }
            grantControls = @{
                operator = "OR"
                builtInControls = @("mfa")
            }
        }
    )

    # Build skip list based on UI toggles
    $skipPolicies = @{}
    if (-not $blockLegacyAuth) { $skipPolicies["CA001-Block-Legacy-Auth"] = "blockLegacyAuth disabled by user" }
    if (-not $requireMfa) {
        $skipPolicies["CA002-Require-MFA-All-Users"] = "requireMfa disabled by user"
        $skipPolicies["CA003-Require-MFA-Admins"] = "requireMfa disabled by user"
        $skipPolicies["CA006-MFA-Risky-SignIn"] = "requireMfa disabled by user"
    }
    if (-not $requireCompliantDevice) { $skipPolicies["CA004-Require-Compliant-Device"] = "requireCompliantDevice disabled by user" }

    foreach ($policy in $caPolicies) {
        # Skip policies the user explicitly disabled
        if ($skipPolicies.ContainsKey($policy.displayName)) {
            $results.skippedPolicies += @{
                name = $policy.displayName
                reason = $skipPolicies[$policy.displayName]
            }
            Write-Host "Skipped: $($policy.displayName) - $($skipPolicies[$policy.displayName])"
            continue
        }

        try {
            Write-Host "Creating CA policy: $($policy.displayName)"

            $response = Invoke-GraphRequestWithRetry -Method POST `
                -Uri "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" `
                -Body $policy

            $results.conditionalAccessPolicies += @{
                name = $policy.displayName
                id = $response.id
                status = "Created (Report-Only)"
            }
            Write-Host "Created: $($policy.displayName) with ID $($response.id)"
        }
        catch {
            $errorMsg = $_.Exception.Message
            if ($errorMsg -match "already exists") {
                $results.conditionalAccessPolicies += @{
                    name = $policy.displayName
                    status = "Already Exists"
                }
                Write-Host "Policy already exists: $($policy.displayName)"
            }
            else {
                $results.conditionalAccessPolicies += @{
                    name = $policy.displayName
                    status = "Failed"
                }
                Write-Host "Failed to create $($policy.displayName): $errorMsg"
            }
        }
    }

    $responseBody = @{
        status = "Success"
        timestamp = (Get-Date).ToUniversalTime().ToString('o')
        configuration = @{
            securityBaseline = $config.securityBaseline
            hipaaEnabled = $config.hipaaEnabled
        }
        results = $results
    }

    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::OK
        Body = ($responseBody | ConvertTo-Json -Depth 10)
        Headers = @{ 'Content-Type' = 'application/json' }
    })
}
catch {
    Write-Host "Deploy-Identity failed: $_"

    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::InternalServerError
        Body = (@{ status = "Failed"; error = "Deploy-Identity failed. Check function logs for details."; timestamp = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json)
        Headers = @{ 'Content-Type' = 'application/json' }
    })
}
