using namespace System.Net

# Get-ComplianceStatus/run.ps1
# Retrieve device compliance and overall compliance status
# Part of Phase 8 - Reporting Functions

param($Request, $TriggerMetadata)

$ErrorActionPreference = 'Stop'

# Import helper modules
$graphModulePath = Join-Path -Path $PSScriptRoot -ChildPath '..\..\Modules\GraphHelper.psm1'
$reportModulePath = Join-Path -Path $PSScriptRoot -ChildPath '..\..\Modules\ReportHelper.psm1'

if (Test-Path $graphModulePath) {
    Import-Module $graphModulePath -Force
}
if (Test-Path $reportModulePath) {
    Import-Module $reportModulePath -Force
}

Write-Host "Get-ComplianceStatus function triggered"

$result = @{
    status = "success"
    timestamp = (Get-Date -Format 'o')
    deviceCompliance = @{}
    policyCompliance = @()
    riskOverview = @{}
    recommendations = @()
}

try {
    # Connect to Graph API
    $connected = Connect-GraphWithManagedIdentity
    if (-not $connected) {
        throw "Failed to connect to Graph API"
    }

    # ═══════════════════════════════════════════════════════════════════
    # 1. Get Device Compliance Summary
    # ═══════════════════════════════════════════════════════════════════

    Write-Host "Retrieving device compliance status..."

    $devices = Invoke-GraphRequestWithRetry -Method GET -Uri "https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?`$select=id,deviceName,complianceState,operatingSystem,osVersion,lastSyncDateTime,managementAgent&`$top=999"

    $totalDevices = 0
    $compliantDevices = 0
    $nonCompliantDevices = 0
    $inGracePeriod = 0
    $unknown = 0
    $platformBreakdown = @{}

    if ($devices.value) {
        foreach ($device in $devices.value) {
            $totalDevices++

            switch ($device.complianceState) {
                "compliant" { $compliantDevices++ }
                "noncompliant" { $nonCompliantDevices++ }
                "inGracePeriod" { $inGracePeriod++ }
                default { $unknown++ }
            }

            # Platform breakdown
            $platform = $device.operatingSystem ?? "Unknown"
            if (-not $platformBreakdown.ContainsKey($platform)) {
                $platformBreakdown[$platform] = @{
                    total = 0
                    compliant = 0
                    noncompliant = 0
                }
            }
            $platformBreakdown[$platform].total++
            if ($device.complianceState -eq "compliant") {
                $platformBreakdown[$platform].compliant++
            } elseif ($device.complianceState -eq "noncompliant") {
                $platformBreakdown[$platform].noncompliant++
            }
        }
    }

    # Handle pagination
    while ($devices.'@odata.nextLink') {
        $devices = Invoke-GraphRequestWithRetry -Method GET -Uri $devices.'@odata.nextLink'

        if ($devices.value) {
            foreach ($device in $devices.value) {
                $totalDevices++

                switch ($device.complianceState) {
                    "compliant" { $compliantDevices++ }
                    "noncompliant" { $nonCompliantDevices++ }
                    "inGracePeriod" { $inGracePeriod++ }
                    default { $unknown++ }
                }

                $platform = $device.operatingSystem ?? "Unknown"
                if (-not $platformBreakdown.ContainsKey($platform)) {
                    $platformBreakdown[$platform] = @{ total = 0; compliant = 0; noncompliant = 0 }
                }
                $platformBreakdown[$platform].total++
                if ($device.complianceState -eq "compliant") {
                    $platformBreakdown[$platform].compliant++
                } elseif ($device.complianceState -eq "noncompliant") {
                    $platformBreakdown[$platform].noncompliant++
                }
            }
        }
    }

    $result.deviceCompliance = @{
        totalDevices = $totalDevices
        compliantDevices = $compliantDevices
        nonCompliantDevices = $nonCompliantDevices
        inGracePeriod = $inGracePeriod
        unknown = $unknown
        complianceRate = if ($totalDevices -gt 0) {
            [math]::Round(($compliantDevices / $totalDevices) * 100, 2)
        } else { 0 }
        platformBreakdown = $platformBreakdown
    }

    # ═══════════════════════════════════════════════════════════════════
    # 2. Get Compliance Policies
    # ═══════════════════════════════════════════════════════════════════

    Write-Host "Retrieving compliance policies..."

    $policies = Invoke-GraphRequestWithRetry -Method GET -Uri "https://graph.microsoft.com/v1.0/deviceManagement/deviceCompliancePolicies"

    if ($policies.value) {
        foreach ($policy in $policies.value) {
            $result.policyCompliance += @{
                id = $policy.id
                displayName = $policy.displayName
                platformType = $policy.'@odata.type'
                createdDateTime = $policy.createdDateTime
                lastModifiedDateTime = $policy.lastModifiedDateTime
            }
        }
    }

    # ═══════════════════════════════════════════════════════════════════
    # 3. Get Risky Users Summary
    # ═══════════════════════════════════════════════════════════════════

    Write-Host "Retrieving risky users..."

    try {
        $riskyUsers = Invoke-GraphRequestWithRetry -Method GET -Uri "https://graph.microsoft.com/v1.0/identityProtection/riskyUsers?`$filter=riskState eq 'atRisk'"

        $highRisk = 0
        $mediumRisk = 0
        $lowRisk = 0

        if ($riskyUsers.value) {
            foreach ($user in $riskyUsers.value) {
                switch ($user.riskLevel) {
                    "high" { $highRisk++ }
                    "medium" { $mediumRisk++ }
                    "low" { $lowRisk++ }
                }
            }
        }

        $result.riskOverview = @{
            totalRiskyUsers = $riskyUsers.value.Count
            highRisk = $highRisk
            mediumRisk = $mediumRisk
            lowRisk = $lowRisk
        }
    } catch {
        # Identity Protection may not be available in all tenants
        $result.riskOverview = @{
            error = "Identity Protection data not available"
            note = "Requires Entra ID P2 license"
        }
    }

    # ═══════════════════════════════════════════════════════════════════
    # 4. Generate Recommendations
    # ═══════════════════════════════════════════════════════════════════

    if ($result.deviceCompliance.complianceRate -lt 100) {
        $result.recommendations += @{
            category = "Device Compliance"
            priority = if ($result.deviceCompliance.complianceRate -lt 80) { "High" } else { "Medium" }
            issue = "$nonCompliantDevices devices are non-compliant"
            recommendation = "Review non-compliant devices in Intune and remediate issues"
            impact = "Non-compliant devices may lack security controls"
        }
    }

    if ($result.riskOverview.highRisk -gt 0) {
        $result.recommendations += @{
            category = "Identity Risk"
            priority = "Critical"
            issue = "$($result.riskOverview.highRisk) users at high risk"
            recommendation = "Immediately review and remediate high-risk users"
            impact = "High-risk users may have compromised credentials"
        }
    }

    if ($result.policyCompliance.Count -eq 0) {
        $result.recommendations += @{
            category = "Policy Configuration"
            priority = "High"
            issue = "No compliance policies found"
            recommendation = "Create device compliance policies for all platforms"
            impact = "Devices cannot be evaluated for compliance without policies"
        }
    }

    # ═══════════════════════════════════════════════════════════════════
    # 5. Calculate Overall Compliance Score
    # ═══════════════════════════════════════════════════════════════════

    $overallScore = 0
    $maxScore = 100

    # Device compliance contributes 40 points
    $overallScore += [math]::Min(40, ($result.deviceCompliance.complianceRate / 100) * 40)

    # No risky users contributes 30 points
    $riskyUserPenalty = [math]::Min(30, ($result.riskOverview.totalRiskyUsers ?? 0) * 3)
    $overallScore += (30 - $riskyUserPenalty)

    # Having policies contributes 30 points
    $overallScore += if ($result.policyCompliance.Count -gt 0) { 30 } else { 0 }

    $result.overallComplianceScore = @{
        score = [math]::Round($overallScore, 0)
        maxScore = $maxScore
        grade = switch ($overallScore) {
            { $_ -ge 90 } { "A" }
            { $_ -ge 80 } { "B" }
            { $_ -ge 70 } { "C" }
            { $_ -ge 60 } { "D" }
            default { "F" }
        }
        breakdown = @{
            deviceCompliance = "$([math]::Round(($result.deviceCompliance.complianceRate / 100) * 40, 0))/40"
            identityRisk = "$(30 - $riskyUserPenalty)/30"
            policyConfiguration = "$(if ($result.policyCompliance.Count -gt 0) { 30 } else { 0 })/30"
        }
    }

} catch {
    Write-Host "Error in Get-ComplianceStatus: $_"
    $result.status = "error"
    $result.error = $_.Exception.Message
}

# Return response
$responseBody = $result | ConvertTo-Json -Depth 10

Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
    StatusCode = if ($result.status -eq "success") { [HttpStatusCode]::OK } else { [HttpStatusCode]::InternalServerError }
    Headers = @{ 'Content-Type' = 'application/json' }
    Body = $responseBody
})
