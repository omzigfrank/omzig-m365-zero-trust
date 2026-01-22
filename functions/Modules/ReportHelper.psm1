# ReportHelper.psm1 - Shared module for report generation and compliance monitoring

function Get-SecureScoreReport {
    <#
    .SYNOPSIS
        Gets the current Microsoft Secure Score and recommendations
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$GraphToken
    )

    try {
        $headers = @{
            "Authorization" = "Bearer $GraphToken"
            "Content-Type" = "application/json"
        }

        # Get current secure score
        $scores = Invoke-RestMethod -Uri "https://graph.microsoft.com/v1.0/security/secureScores?`$top=1" `
            -Headers $headers -Method GET

        if (-not $scores.value -or $scores.value.Count -eq 0) {
            return @{
                status = "NoData"
                message = "No Secure Score data available"
            }
        }

        $currentScore = $scores.value[0]

        # Get control profiles for recommendations
        $controlProfiles = Invoke-RestMethod -Uri "https://graph.microsoft.com/v1.0/security/secureScoreControlProfiles" `
            -Headers $headers -Method GET

        # Calculate percentage
        $percentage = if ($currentScore.maxScore -gt 0) {
            [math]::Round(($currentScore.currentScore / $currentScore.maxScore) * 100, 1)
        } else { 0 }

        # Get top recommendations (not implemented controls)
        $recommendations = $currentScore.controlScores | Where-Object {
            $_.scoreInPercentage -lt 100
        } | Sort-Object { $_.scoreInPercentage } | Select-Object -First 10

        return @{
            status = "Success"
            timestamp = (Get-Date).ToUniversalTime().ToString('o')
            currentScore = $currentScore.currentScore
            maxScore = $currentScore.maxScore
            percentage = $percentage
            createdDateTime = $currentScore.createdDateTime
            topRecommendations = $recommendations | ForEach-Object {
                @{
                    controlName = $_.controlName
                    currentScore = $_.score
                    maxScore = ($controlProfiles.value | Where-Object { $_.id -eq $_.controlName }).maxScore
                    scorePercentage = $_.scoreInPercentage
                }
            }
        }
    }
    catch {
        Write-Error "Failed to get Secure Score: $_"
        return @{
            status = "Failed"
            error = $_.Exception.Message
        }
    }
}

function Get-MfaStatusReport {
    <#
    .SYNOPSIS
        Gets MFA registration status for all users
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$GraphToken
    )

    try {
        $headers = @{
            "Authorization" = "Bearer $GraphToken"
            "Content-Type" = "application/json"
        }

        # Get credential user registration details
        $registrationDetails = Invoke-RestMethod `
            -Uri "https://graph.microsoft.com/v1.0/reports/credentialUserRegistrationDetails" `
            -Headers $headers -Method GET

        $totalUsers = $registrationDetails.value.Count
        $mfaRegistered = ($registrationDetails.value | Where-Object { $_.isMfaRegistered -eq $true }).Count
        $mfaCapable = ($registrationDetails.value | Where-Object { $_.isMfaCapable -eq $true }).Count
        $passwordlessCapable = ($registrationDetails.value | Where-Object { $_.isPasswordlessCapable -eq $true }).Count

        # Users not registered for MFA
        $notRegistered = $registrationDetails.value | Where-Object { $_.isMfaRegistered -eq $false } | Select-Object -First 20

        return @{
            status = "Success"
            timestamp = (Get-Date).ToUniversalTime().ToString('o')
            summary = @{
                totalUsers = $totalUsers
                mfaRegistered = $mfaRegistered
                mfaRegisteredPercentage = if ($totalUsers -gt 0) { [math]::Round(($mfaRegistered / $totalUsers) * 100, 1) } else { 0 }
                mfaCapable = $mfaCapable
                passwordlessCapable = $passwordlessCapable
            }
            usersNotRegistered = $notRegistered | ForEach-Object {
                @{
                    userPrincipalName = $_.userPrincipalName
                    userDisplayName = $_.userDisplayName
                    isAdmin = $_.isAdmin
                }
            }
        }
    }
    catch {
        Write-Error "Failed to get MFA status: $_"
        return @{
            status = "Failed"
            error = $_.Exception.Message
        }
    }
}

function Get-LicenseUtilizationReport {
    <#
    .SYNOPSIS
        Gets license utilization information
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$GraphToken
    )

    try {
        $headers = @{
            "Authorization" = "Bearer $GraphToken"
            "Content-Type" = "application/json"
        }

        # Get subscribed SKUs
        $skus = Invoke-RestMethod -Uri "https://graph.microsoft.com/v1.0/subscribedSkus" `
            -Headers $headers -Method GET

        $licenseReport = $skus.value | ForEach-Object {
            $consumed = $_.consumedUnits
            $total = $_.prepaidUnits.enabled
            $available = $total - $consumed

            @{
                skuPartNumber = $_.skuPartNumber
                skuId = $_.skuId
                totalLicenses = $total
                consumedLicenses = $consumed
                availableLicenses = $available
                utilizationPercentage = if ($total -gt 0) { [math]::Round(($consumed / $total) * 100, 1) } else { 0 }
            }
        }

        return @{
            status = "Success"
            timestamp = (Get-Date).ToUniversalTime().ToString('o')
            licenses = $licenseReport
            summary = @{
                totalSkus = $licenseReport.Count
                fullyUtilized = ($licenseReport | Where-Object { $_.availableLicenses -eq 0 }).Count
                underutilized = ($licenseReport | Where-Object { $_.utilizationPercentage -lt 50 }).Count
            }
        }
    }
    catch {
        Write-Error "Failed to get license utilization: $_"
        return @{
            status = "Failed"
            error = $_.Exception.Message
        }
    }
}

function Get-DeviceComplianceReport {
    <#
    .SYNOPSIS
        Gets device compliance status from Intune
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$GraphToken
    )

    try {
        $headers = @{
            "Authorization" = "Bearer $GraphToken"
            "Content-Type" = "application/json"
        }

        # Get managed devices
        $devices = Invoke-RestMethod `
            -Uri "https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?`$select=id,deviceName,complianceState,operatingSystem,osVersion,lastSyncDateTime,userPrincipalName" `
            -Headers $headers -Method GET

        $totalDevices = $devices.value.Count
        $compliant = ($devices.value | Where-Object { $_.complianceState -eq "compliant" }).Count
        $nonCompliant = ($devices.value | Where-Object { $_.complianceState -eq "noncompliant" }).Count
        $unknown = ($devices.value | Where-Object { $_.complianceState -notin @("compliant", "noncompliant") }).Count

        # Group by OS
        $byOs = $devices.value | Group-Object -Property operatingSystem | ForEach-Object {
            @{
                os = $_.Name
                count = $_.Count
                compliant = ($_.Group | Where-Object { $_.complianceState -eq "compliant" }).Count
            }
        }

        # Non-compliant devices (first 20)
        $nonCompliantDevices = $devices.value | Where-Object { $_.complianceState -eq "noncompliant" } | Select-Object -First 20

        return @{
            status = "Success"
            timestamp = (Get-Date).ToUniversalTime().ToString('o')
            summary = @{
                totalDevices = $totalDevices
                compliant = $compliant
                nonCompliant = $nonCompliant
                unknown = $unknown
                compliancePercentage = if ($totalDevices -gt 0) { [math]::Round(($compliant / $totalDevices) * 100, 1) } else { 0 }
            }
            byOperatingSystem = $byOs
            nonCompliantDevices = $nonCompliantDevices | ForEach-Object {
                @{
                    deviceName = $_.deviceName
                    os = $_.operatingSystem
                    osVersion = $_.osVersion
                    lastSync = $_.lastSyncDateTime
                    user = $_.userPrincipalName
                }
            }
        }
    }
    catch {
        Write-Error "Failed to get device compliance: $_"
        return @{
            status = "Failed"
            error = $_.Exception.Message
        }
    }
}

function Get-RiskyUsersReport {
    <#
    .SYNOPSIS
        Gets risky users from Identity Protection
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$GraphToken
    )

    try {
        $headers = @{
            "Authorization" = "Bearer $GraphToken"
            "Content-Type" = "application/json"
        }

        # Get risky users (requires Identity Protection license)
        $riskyUsers = Invoke-RestMethod `
            -Uri "https://graph.microsoft.com/v1.0/identityProtection/riskyUsers" `
            -Headers $headers -Method GET

        $highRisk = ($riskyUsers.value | Where-Object { $_.riskLevel -eq "high" }).Count
        $mediumRisk = ($riskyUsers.value | Where-Object { $_.riskLevel -eq "medium" }).Count
        $lowRisk = ($riskyUsers.value | Where-Object { $_.riskLevel -eq "low" }).Count

        return @{
            status = "Success"
            timestamp = (Get-Date).ToUniversalTime().ToString('o')
            summary = @{
                totalRiskyUsers = $riskyUsers.value.Count
                highRisk = $highRisk
                mediumRisk = $mediumRisk
                lowRisk = $lowRisk
            }
            riskyUsers = $riskyUsers.value | Select-Object -First 20 | ForEach-Object {
                @{
                    userPrincipalName = $_.userPrincipalName
                    userDisplayName = $_.userDisplayName
                    riskLevel = $_.riskLevel
                    riskState = $_.riskState
                    riskLastUpdatedDateTime = $_.riskLastUpdatedDateTime
                }
            }
        }
    }
    catch {
        Write-Error "Failed to get risky users: $_"
        return @{
            status = "Failed"
            error = $_.Exception.Message
        }
    }
}

function New-ComplianceReport {
    <#
    .SYNOPSIS
        Generates a comprehensive compliance report
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$GraphToken,

        [Parameter(Mandatory)]
        [string]$OrganizationName,

        [ValidateSet('HIPAA', 'SOC2', 'NIST', 'All')]
        [string]$Framework = 'All'
    )

    try {
        $report = @{
            organizationName = $OrganizationName
            generatedAt = (Get-Date).ToUniversalTime().ToString('o')
            framework = $Framework
            sections = @{}
        }

        # Get all component reports
        $report.sections.secureScore = Get-SecureScoreReport -GraphToken $GraphToken
        $report.sections.mfaStatus = Get-MfaStatusReport -GraphToken $GraphToken
        $report.sections.deviceCompliance = Get-DeviceComplianceReport -GraphToken $GraphToken
        $report.sections.riskyUsers = Get-RiskyUsersReport -GraphToken $GraphToken

        # Calculate overall compliance score
        $scores = @()
        if ($report.sections.secureScore.percentage) { $scores += $report.sections.secureScore.percentage }
        if ($report.sections.mfaStatus.summary.mfaRegisteredPercentage) { $scores += $report.sections.mfaStatus.summary.mfaRegisteredPercentage }
        if ($report.sections.deviceCompliance.summary.compliancePercentage) { $scores += $report.sections.deviceCompliance.summary.compliancePercentage }

        $report.overallScore = if ($scores.Count -gt 0) {
            [math]::Round(($scores | Measure-Object -Average).Average, 1)
        } else { 0 }

        # Add recommendations
        $report.recommendations = @()

        if ($report.sections.mfaStatus.summary.mfaRegisteredPercentage -lt 100) {
            $report.recommendations += "Complete MFA registration for all users"
        }
        if ($report.sections.deviceCompliance.summary.nonCompliant -gt 0) {
            $report.recommendations += "Remediate non-compliant devices"
        }
        if ($report.sections.riskyUsers.summary.highRisk -gt 0) {
            $report.recommendations += "Investigate and remediate high-risk users"
        }

        return $report
    }
    catch {
        Write-Error "Failed to generate compliance report: $_"
        return @{
            status = "Failed"
            error = $_.Exception.Message
        }
    }
}

function Format-ReportAsMarkdown {
    <#
    .SYNOPSIS
        Formats a compliance report as Markdown
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [hashtable]$Report
    )

    $md = @"
# $($Report.organizationName) - Compliance Report

**Generated:** $($Report.generatedAt)
**Framework:** $($Report.framework)
**Overall Score:** $($Report.overallScore)%

---

## Executive Summary

| Metric | Value | Status |
|--------|-------|--------|
| Secure Score | $($Report.sections.secureScore.percentage)% | $(if ($Report.sections.secureScore.percentage -ge 80) { '✅' } else { '⚠️' }) |
| MFA Registered | $($Report.sections.mfaStatus.summary.mfaRegisteredPercentage)% | $(if ($Report.sections.mfaStatus.summary.mfaRegisteredPercentage -ge 95) { '✅' } else { '⚠️' }) |
| Device Compliance | $($Report.sections.deviceCompliance.summary.compliancePercentage)% | $(if ($Report.sections.deviceCompliance.summary.compliancePercentage -ge 90) { '✅' } else { '⚠️' }) |
| High Risk Users | $($Report.sections.riskyUsers.summary.highRisk) | $(if ($Report.sections.riskyUsers.summary.highRisk -eq 0) { '✅' } else { '❌' }) |

---

## Recommendations

$(foreach ($rec in $Report.recommendations) { "- $rec`n" })

---

## Detailed Sections

### Microsoft Secure Score
- Current: $($Report.sections.secureScore.currentScore) / $($Report.sections.secureScore.maxScore)

### MFA Status
- Registered: $($Report.sections.mfaStatus.summary.mfaRegistered) / $($Report.sections.mfaStatus.summary.totalUsers)

### Device Compliance
- Compliant: $($Report.sections.deviceCompliance.summary.compliant) / $($Report.sections.deviceCompliance.summary.totalDevices)

---

*Report generated by Omzig M365 Zero Trust Deployment*
"@

    return $md
}

Export-ModuleMember -Function @(
    'Get-SecureScoreReport'
    'Get-MfaStatusReport'
    'Get-LicenseUtilizationReport'
    'Get-DeviceComplianceReport'
    'Get-RiskyUsersReport'
    'New-ComplianceReport'
    'Format-ReportAsMarkdown'
)
