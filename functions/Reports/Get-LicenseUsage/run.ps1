using namespace System.Net

# Get-LicenseUsage/run.ps1
# Retrieve license utilization report
# Part of Phase 8 - Reporting Functions

param($Request, $TriggerMetadata)

$ErrorActionPreference = 'Stop'

# Import Graph helper module
$modulePath = Join-Path -Path $PSScriptRoot -ChildPath '..\..\Modules\GraphHelper.psm1'
if (Test-Path $modulePath) {
    Import-Module $modulePath -Force
}

Write-Host "Get-LicenseUsage function triggered"

$result = @{
    status = "success"
    timestamp = (Get-Date -Format 'o')
    subscriptions = @()
    summary = @{}
    recommendations = @()
}

try {
    # Connect to Graph API
    $connected = Connect-GraphWithManagedIdentity
    if (-not $connected) {
        throw "Failed to connect to Graph API"
    }

    # ═══════════════════════════════════════════════════════════════════
    # 1. Get Subscribed SKUs
    # ═══════════════════════════════════════════════════════════════════

    Write-Host "Retrieving subscribed SKUs..."

    $subscribedSkus = Invoke-GraphRequestWithRetry -Method GET -Uri "https://graph.microsoft.com/v1.0/subscribedSkus"

    $totalLicenses = 0
    $totalConsumed = 0
    $totalAvailable = 0

    # SKU friendly names mapping
    $skuNames = @{
        'ENTERPRISEPACK' = 'Microsoft 365 E3'
        'ENTERPRISEPREMIUM' = 'Microsoft 365 E5'
        'SPE_E3' = 'Microsoft 365 E3'
        'SPE_E5' = 'Microsoft 365 E5'
        'O365_BUSINESS_ESSENTIALS' = 'Microsoft 365 Business Basic'
        'O365_BUSINESS_PREMIUM' = 'Microsoft 365 Business Standard'
        'SPB' = 'Microsoft 365 Business Premium'
        'EMS' = 'Enterprise Mobility + Security E3'
        'EMSPREMIUM' = 'Enterprise Mobility + Security E5'
        'AAD_PREMIUM' = 'Entra ID P1'
        'AAD_PREMIUM_P2' = 'Entra ID P2'
        'ATP_ENTERPRISE' = 'Defender for Office 365 P1'
        'THREAT_INTELLIGENCE' = 'Defender for Office 365 P2'
        'WIN_DEF_ATP' = 'Defender for Endpoint P1'
        'DEFENDER_ENDPOINT_P2' = 'Defender for Endpoint P2'
        'INTUNE_A' = 'Microsoft Intune'
    }

    if ($subscribedSkus.value) {
        foreach ($sku in $subscribedSkus.value) {
            $friendlyName = $(if ($skuNames[$sku.skuPartNumber]) { $skuNames[$sku.skuPartNumber] } else { $sku.skuPartNumber })
            $total = $sku.prepaidUnits.enabled
            $consumed = $sku.consumedUnits
            $available = $total - $consumed
            $utilizationPct = $(if ($total -gt 0) { [math]::Round(($consumed / $total) * 100, 2) } else { 0 })

            $result.subscriptions += @{
                skuId = $sku.skuId
                skuPartNumber = $sku.skuPartNumber
                friendlyName = $friendlyName
                totalLicenses = $total
                consumedLicenses = $consumed
                availableLicenses = $available
                utilization = "$utilizationPct%"
                capabilityStatus = $sku.capabilityStatus
                warningUnits = $sku.prepaidUnits.warning
                suspendedUnits = $sku.prepaidUnits.suspended
            }

            $totalLicenses += $total
            $totalConsumed += $consumed
            $totalAvailable += $available

            # Generate recommendations based on utilization
            if ($utilizationPct -lt 50 -and $total -gt 5) {
                $result.recommendations += @{
                    type = "Underutilized"
                    sku = $friendlyName
                    message = "Only $utilizationPct% of $friendlyName licenses are in use. Consider reducing license count."
                    potentialSavings = "~$available licenses unused"
                }
            }
            elseif ($available -eq 0) {
                $result.recommendations += @{
                    type = "AtCapacity"
                    sku = $friendlyName
                    message = "$friendlyName is at 100% capacity. Consider adding more licenses."
                    potentialSavings = "N/A"
                }
            }
            elseif ($available -lt 5 -and $total -gt 10) {
                $result.recommendations += @{
                    type = "NearCapacity"
                    sku = $friendlyName
                    message = "Only $available $friendlyName licenses available. Plan for growth."
                    potentialSavings = "N/A"
                }
            }
        }
    }

    # ═══════════════════════════════════════════════════════════════════
    # 2. Calculate Summary
    # ═══════════════════════════════════════════════════════════════════

    $result.summary = @{
        totalLicenses = $totalLicenses
        consumedLicenses = $totalConsumed
        availableLicenses = $totalAvailable
        overallUtilization = $(if ($totalLicenses -gt 0) {
            [math]::Round(($totalConsumed / $totalLicenses) * 100, 2)
        } else { 0 })
        subscriptionCount = @($result.subscriptions).Count
        underutilizedSkus = @($result.recommendations | Where-Object { $_.type -eq "Underutilized" }).Count
        atCapacitySkus = @($result.recommendations | Where-Object { $_.type -eq "AtCapacity" }).Count
    }

    # ═══════════════════════════════════════════════════════════════════
    # 3. Get License Assignment Details (sample)
    # ═══════════════════════════════════════════════════════════════════

    Write-Host "Checking for users without licenses..."

    $usersWithoutLicenses = Invoke-GraphRequestWithRetry -Method GET -Uri "https://graph.microsoft.com/v1.0/users?`$filter=assignedLicenses/`$count eq 0&`$count=true&`$top=10" -Headers @{ 'ConsistencyLevel' = 'eventual' }

    if ($usersWithoutLicenses.value) {
        $result.usersWithoutLicenses = @{
            count = $(if ($usersWithoutLicenses.'@odata.count') { $usersWithoutLicenses.'@odata.count' } else { $usersWithoutLicenses.value.Count })
            sample = ($usersWithoutLicenses.value | Select-Object -First 10 | ForEach-Object {
                @{
                    displayName = $_.displayName
                    userPrincipalName = $_.userPrincipalName
                }
            })
        }

        if ($result.usersWithoutLicenses.count -gt 0) {
            $result.recommendations += @{
                type = "UnlicensedUsers"
                sku = "N/A"
                message = "$($result.usersWithoutLicenses.count) users have no licenses assigned"
                potentialSavings = "Review if these accounts are needed"
            }
        }
    }

    # ═══════════════════════════════════════════════════════════════════
    # 4. Calculate Cost Optimization Score
    # ═══════════════════════════════════════════════════════════════════

    $optimizationScore = 100
    if ($result.summary.overallUtilization -lt 80) {
        $optimizationScore -= (80 - $result.summary.overallUtilization)
    }
    $optimizationScore -= @($result.recommendations | Where-Object { $_.type -eq "Underutilized" }).Count * 5
    $optimizationScore = [math]::Max(0, $optimizationScore)

    $result.optimizationScore = @{
        score = $optimizationScore
        grade = $(switch ($optimizationScore) {
            { $_ -ge 90 } { "A" }
            { $_ -ge 80 } { "B" }
            { $_ -ge 70 } { "C" }
            { $_ -ge 60 } { "D" }
            default { "F" }
        })
        recommendation = $(if ($optimizationScore -ge 90) {
            "License utilization is well optimized"
        } elseif ($optimizationScore -ge 70) {
            "Consider reviewing underutilized licenses"
        } else {
            "Significant license optimization opportunity exists"
        })
    }

} catch {
    Write-Host "Error in Get-LicenseUsage: $_"
    $result.status = "error"
    $result.error = $_.Exception.Message
}

# Return response
$responseBody = $result | ConvertTo-Json -Depth 10

Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
    StatusCode = $(if ($result.status -eq "success") { [HttpStatusCode]::OK } else { [HttpStatusCode]::InternalServerError })
    Headers = @{ 'Content-Type' = 'application/json' }
    Body = $responseBody
})
