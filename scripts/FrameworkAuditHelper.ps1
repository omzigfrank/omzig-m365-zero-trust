# Dot-source expanded audit modules
$auditDir = Join-Path $PSScriptRoot 'audit'
if (Test-Path $auditDir) {
    . (Join-Path $auditDir 'CisaCatalogFetcher.ps1')
    . (Join-Path $auditDir 'TenantFactCollector.ps1')
    . (Join-Path $auditDir 'CisaEvaluatorRegistry.ps1')
    . (Join-Path $auditDir 'NistEvaluatorRegistry.ps1')
}

function Format-DisplayDate {
    param([string]$Value)

    if (-not $Value) {
        return "unknown"
    }

    try {
        return (Get-Date -Date $Value -ErrorAction Stop).ToString("yyyy-MM-dd")
    }
    catch {
    }

    return $Value
}

function Convert-HtmlToPlainText {
    param([string]$Html)

    $plainText = [regex]::Replace($Html, '<[^>]+>', ' ')
    $plainText = [System.Net.WebUtility]::HtmlDecode($plainText)
    return ([regex]::Replace($plainText, '\s+', ' ')).Trim()
}

function Get-RegexCapture {
    param(
        [string]$InputText,
        [string]$Pattern
    )

    $match = [regex]::Match($InputText, $Pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($match.Success -and $match.Groups.Count -gt 1) {
        return $match.Groups[1].Value.Trim()
    }

    return $null
}

function Invoke-ExternalJsonRequest {
    param([string]$Uri)

    $headers = @{
        "User-Agent" = "omzig-m365-zero-trust"
        "Accept"     = "application/vnd.github+json, application/json"
    }

    return Invoke-RestMethod -Uri $Uri -Headers $headers -Method GET -ErrorAction Stop
}

function Invoke-ExternalTextRequest {
    param([string]$Uri)

    $headers = @{
        "User-Agent" = "omzig-m365-zero-trust"
        "Accept"     = "text/html,application/xhtml+xml"
    }

    if ($PSVersionTable.PSVersion.Major -le 5) {
        return (Invoke-WebRequest -Uri $Uri -Headers $headers -UseBasicParsing -ErrorAction Stop).Content
    }

    return (Invoke-WebRequest -Uri $Uri -Headers $headers -ErrorAction Stop).Content
}

function Get-FrameworkDefaults {
    return [pscustomobject]@{
        checkedAt = $null
        CISA      = [pscustomobject]@{
            name             = "CISA SCuBA"
            projectName      = "Secure Cloud Business Applications (SCuBA) Project"
            version          = "v1.7.1"
            published        = "2026-02-20"
            sourceUrl        = "https://github.com/cisagov/ScubaGear/releases/latest"
            sourcePageUrl    = "https://www.cisa.gov/resources-tools/services/secure-cloud-business-applications-scuba-project"
            downloadUrl      = $null
            sources          = @(
                [pscustomobject]@{
                    id    = "project"
                    title = "Secure Cloud Business Applications (SCuBA) Project"
                    url   = "https://www.cisa.gov/resources-tools/services/secure-cloud-business-applications-scuba-project"
                },
                [pscustomobject]@{
                    id    = "release"
                    title = "ScubaGear Latest Release"
                    url   = "https://github.com/cisagov/ScubaGear/releases/latest"
                }
            )
            checkedAt        = $null
            refreshState     = "default"
            refreshMessage   = "Using built-in default metadata."
        }
        NIST      = [pscustomobject]@{
            name                    = "NIST Standards"
            standardName            = "Zero Trust Architecture"
            standardPublication     = "SP 800-207"
            standardPublished       = "August 10, 2020"
            standardUrl             = "https://www.nist.gov/publications/zero-trust-architecture"
            implementationName      = "Implementing a Zero Trust Architecture: High-Level Document"
            implementationGuide     = "SP 1800-35"
            implementationPublished = "June 10, 2025"
            implementationUrl       = "https://www.nist.gov/publications/implementing-zero-trust-architecture-high-level-document"
            projectName             = "Implementing a Zero Trust Architecture"
            projectStatus           = "Finalized"
            projectUrl              = "https://www.nccoe.nist.gov/projects/implementing-zero-trust-architecture"
            sources                 = @(
                [pscustomobject]@{
                    id    = "standard"
                    title = "Zero Trust Architecture (SP 800-207)"
                    url   = "https://www.nist.gov/publications/zero-trust-architecture"
                },
                [pscustomobject]@{
                    id    = "implementation"
                    title = "Implementing a Zero Trust Architecture: High-Level Document (SP 1800-35)"
                    url   = "https://www.nist.gov/publications/implementing-zero-trust-architecture-high-level-document"
                },
                [pscustomobject]@{
                    id    = "project"
                    title = "NCCoE Implementing a Zero Trust Architecture Project"
                    url   = "https://www.nccoe.nist.gov/projects/implementing-zero-trust-architecture"
                }
            )
            checkedAt               = $null
            refreshState            = "default"
            refreshMessage          = "Using built-in default metadata."
        }
    }
}

function Update-FrameworkCatalog {
    param([string]$CachePath)

    $catalog = $null
    if (Test-Path $CachePath) {
        try {
            $catalog = Get-Content -Path $CachePath -Raw | ConvertFrom-Json
        }
        catch {
            $catalog = $null
        }
    }

    if (
        -not $catalog -or
        -not $catalog.CISA -or
        -not $catalog.NIST -or
        -not $catalog.CISA.sourcePageUrl -or
        -not $catalog.CISA.sources -or
        -not $catalog.NIST.standardUrl -or
        -not $catalog.NIST.implementationUrl -or
        -not $catalog.NIST.projectUrl -or
        -not $catalog.NIST.sources
    ) {
        $catalog = Get-FrameworkDefaults
    }

    $checkedAt = (Get-Date).ToUniversalTime().ToString("o")
    $catalog.checkedAt = $checkedAt

    $cisaRefreshMessages = @()
    $cisaSuccessfulRefreshes = 0

    try {
        $cisaProjectContent = Convert-HtmlToPlainText (Invoke-ExternalTextRequest -Uri $catalog.CISA.sourcePageUrl)
        $projectName = Get-RegexCapture -InputText $cisaProjectContent -Pattern "(Secure Cloud Business Applications \(SCuBA\) Project)"
        if ($projectName) {
            $catalog.CISA.projectName = $projectName
        }
        $cisaSuccessfulRefreshes++
        $cisaRefreshMessages += "CISA SCuBA project page refreshed."
    }
    catch {
        $cisaRefreshMessages += "CISA SCuBA project page could not be refreshed."
    }

    try {
        $latestRelease = Invoke-ExternalJsonRequest -Uri "https://api.github.com/repos/cisagov/ScubaGear/releases/latest"
        $catalog.CISA.version = $latestRelease.tag_name
        $catalog.CISA.published = $latestRelease.published_at
        $catalog.CISA.sourceUrl = $latestRelease.html_url
        $catalog.CISA.downloadUrl = $null
        if ($latestRelease.assets -and $latestRelease.assets.Count -gt 0) {
            $catalog.CISA.downloadUrl = $latestRelease.assets[0].browser_download_url
        }
        $cisaSuccessfulRefreshes++
        $cisaRefreshMessages += "ScubaGear release feed refreshed."
    }
    catch {
        $cisaRefreshMessages += "ScubaGear release feed could not be refreshed."
    }

    $catalog.CISA.checkedAt = $checkedAt
    if ($cisaSuccessfulRefreshes -eq 2) {
        $catalog.CISA.refreshState = "updated"
        $catalog.CISA.refreshMessage = ($cisaRefreshMessages -join " ")
    }
    elseif ($cisaSuccessfulRefreshes -gt 0) {
        $catalog.CISA.refreshState = "partial"
        $catalog.CISA.refreshMessage = ($cisaRefreshMessages -join " ")
    }
    else {
        $catalog.CISA.refreshState = "cached"
        $catalog.CISA.refreshMessage = "Could not refresh CISA metadata. Using cached or built-in defaults."
    }

    $nistRefreshMessages = @()
    $nistSuccessfulRefreshes = 0

    try {
        $sp800207Content = Convert-HtmlToPlainText (Invoke-ExternalTextRequest -Uri $catalog.NIST.standardUrl)
        $sp800207Published = Get-RegexCapture -InputText $sp800207Content -Pattern "Published\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})"
        if ($sp800207Published) {
            $catalog.NIST.standardPublished = $sp800207Published
        }
        $nistSuccessfulRefreshes++
        $nistRefreshMessages += "SP 800-207 publication page refreshed."
    }
    catch {
        $nistRefreshMessages += "SP 800-207 publication page could not be refreshed."
    }

    try {
        $sp180035Content = Convert-HtmlToPlainText (Invoke-ExternalTextRequest -Uri $catalog.NIST.implementationUrl)
        $sp180035Published = Get-RegexCapture -InputText $sp180035Content -Pattern "Published\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})"
        if ($sp180035Published) {
            $catalog.NIST.implementationPublished = $sp180035Published
        }
        $nistSuccessfulRefreshes++
        $nistRefreshMessages += "SP 1800-35 high-level document page refreshed."
    }
    catch {
        $nistRefreshMessages += "SP 1800-35 high-level document page could not be refreshed."
    }

    try {
        $nccoeProjectContent = Convert-HtmlToPlainText (Invoke-ExternalTextRequest -Uri $catalog.NIST.projectUrl)
        $projectStatus = Get-RegexCapture -InputText $nccoeProjectContent -Pattern "Status:\s*([A-Za-z]+)"
        if ($projectStatus) {
            $catalog.NIST.projectStatus = $projectStatus
        }
        $nistSuccessfulRefreshes++
        $nistRefreshMessages += "NCCoE project page refreshed."
    }
    catch {
        $nistRefreshMessages += "NCCoE project page could not be refreshed; using cached project status."
    }

    $catalog.NIST.checkedAt = $checkedAt
    if ($nistSuccessfulRefreshes -eq 3) {
        $catalog.NIST.refreshState = "updated"
        $catalog.NIST.refreshMessage = ($nistRefreshMessages -join " ")
    }
    elseif ($nistSuccessfulRefreshes -gt 0) {
        $catalog.NIST.refreshState = "partial"
        $catalog.NIST.refreshMessage = ($nistRefreshMessages -join " ")
    }
    else {
        $catalog.NIST.refreshState = "cached"
        $catalog.NIST.refreshMessage = "Could not refresh NIST metadata. Using cached or built-in defaults."
    }

    $cacheDirectory = Split-Path -Path $CachePath -Parent
    if ($cacheDirectory -and -not (Test-Path $cacheDirectory)) {
        New-Item -ItemType Directory -Path $cacheDirectory -Force | Out-Null
    }

    $catalogJson = $catalog | ConvertTo-Json -Depth 8
    [System.IO.File]::WriteAllText($CachePath, $catalogJson, [System.Text.UTF8Encoding]::new($false))
    return $catalog
}

function Write-FrameworkCatalogSummary {
    param($Catalog)

    Write-Banner "Framework Catalog"
    Write-Host "  CISA SCuBA: $($Catalog.CISA.version) (published $(Format-DisplayDate $Catalog.CISA.published)) [$($Catalog.CISA.refreshState)]" -ForegroundColor White
    Write-Host "              Project: $($Catalog.CISA.sourcePageUrl)" -ForegroundColor DarkGray
    Write-Host "              Release: $($Catalog.CISA.sourceUrl)" -ForegroundColor DarkGray
    Write-Host "  NIST Standards: $($Catalog.NIST.standardPublication) ($(Format-DisplayDate $Catalog.NIST.standardPublished)) [$($Catalog.NIST.refreshState)]" -ForegroundColor White
    Write-Host "                  Source: $($Catalog.NIST.standardUrl)" -ForegroundColor DarkGray
    Write-Host "                  $($Catalog.NIST.implementationGuide) ($(Format-DisplayDate $Catalog.NIST.implementationPublished))" -ForegroundColor DarkGray
    Write-Host "                  Source: $($Catalog.NIST.implementationUrl)" -ForegroundColor DarkGray
    Write-Host "                  NCCoE Project: $($Catalog.NIST.projectName) [$($Catalog.NIST.projectStatus)]" -ForegroundColor DarkGray
    Write-Host "                  Source: $($Catalog.NIST.projectUrl)" -ForegroundColor DarkGray
}

function Resolve-AuditFrameworkSelection {
    param(
        [string]$RequestedFramework,
        [switch]$AllowExit
    )

    if ($RequestedFramework) {
        return $RequestedFramework
    }

    while ($true) {
        Write-Banner "Audit Main Menu"
        Write-Host "  [1] NIST standards" -ForegroundColor White
        Write-Host "  [2] CISA SCuBA" -ForegroundColor White
        Write-Host "  [3] Both" -ForegroundColor White
        if ($AllowExit) {
            Write-Host "  [4] Exit" -ForegroundColor White
        }
        Write-Host ""

        $selectionPrompt = $(if ($AllowExit) { "Select audit scope [1-4] (default 3)" } else { "Select audit scope [1-3] (default 3)" })
        $selection = (Read-Host $selectionPrompt).Trim()
        switch ($selection) {
            ""  { return "Both" }
            "1" { return "NIST" }
            "2" { return "CISA" }
            "3" { return "Both" }
            "4" {
                if ($AllowExit) {
                    return "Exit"
                }
                Write-Host "ERROR: Invalid selection. Enter 1, 2, or 3." -ForegroundColor Red
            }
            default {
                $validOptions = $(if ($AllowExit) { "1, 2, 3, or 4" } else { "1, 2, or 3" })
                Write-Host "ERROR: Invalid selection. Enter $validOptions." -ForegroundColor Red
            }
        }
    }
}

function Get-AuditFrameworkDisplayName {
    param([string]$FrameworkId)

    switch ($FrameworkId) {
        "NIST" { return "NIST standards" }
        "CISA" { return "CISA SCuBA" }
        "Both" { return "NIST standards and CISA SCuBA" }
        default { return $FrameworkId }
    }
}

function New-AuditCheck {
    param(
        [string]$Name,
        [string]$Rating,
        [string]$Message,
        [string]$Action
    )

    return [ordered]@{
        name    = $Name
        rating  = $Rating
        message = $Message
        action  = $Action
    }
}

function New-FrameworkAuditReport {
    param(
        [string]$Id,
        [string]$DisplayName,
        $Metadata,
        [object[]]$Checks
    )

    $passCount = @($Checks | Where-Object { $_.rating -eq "pass" }).Count
    $warnCount = @($Checks | Where-Object { $_.rating -eq "warn" }).Count
    $failCount = @($Checks | Where-Object { $_.rating -eq "fail" }).Count
    $blockerCount = @($Checks | Where-Object { $_.rating -eq "blocker" }).Count

    $overallReadiness = $(if ($blockerCount -gt 0) {
        "blocked"
    }
    elseif ($failCount -gt 0) {
        "not-ready"
    }
    elseif ($warnCount -gt 0) {
        "caution"
    }
    else {
        "ready"
    })

    return [ordered]@{
        id               = $Id
        displayName      = $DisplayName
        metadata         = $Metadata
        overallReadiness = $overallReadiness
        summary          = [ordered]@{
            total   = $Checks.Count
            pass    = $passCount
            warn    = $warnCount
            fail    = $failCount
            blocker = $blockerCount
        }
        checks           = @($Checks)
    }
}

function Save-AuditReport {
    param(
        $AuditReport,
        [string]$Path
    )

    $reportDirectory = Split-Path -Path $Path -Parent
    if ($reportDirectory -and -not (Test-Path $reportDirectory)) {
        New-Item -ItemType Directory -Path $reportDirectory -Force | Out-Null
    }

    $reportJson = $AuditReport | ConvertTo-Json -Depth 10
    [System.IO.File]::WriteAllText($Path, $reportJson, [System.Text.UTF8Encoding]::new($false))
}

function Write-FrameworkAuditReport {
    param($Report)

    Write-Banner "$($Report.displayName) Audit"

    if ($Report.id -eq "CISA") {
        Write-Host "  Project: $($Report.metadata.projectName)" -ForegroundColor White
        Write-Host "  Project page: $($Report.metadata.sourcePageUrl)" -ForegroundColor DarkGray
        Write-Host "  ScubaGear release: $($Report.metadata.version) (published $(Format-DisplayDate $Report.metadata.published))" -ForegroundColor DarkGray
        Write-Host "  Release source: $($Report.metadata.sourceUrl)" -ForegroundColor DarkGray
    }
    else {
        Write-Host "  Standard: $($Report.metadata.standardName) - $($Report.metadata.standardPublication) ($(Format-DisplayDate $Report.metadata.standardPublished))" -ForegroundColor White
        Write-Host "  Source: $($Report.metadata.standardUrl)" -ForegroundColor DarkGray
        Write-Host "  Implementation guide: $($Report.metadata.implementationName) - $($Report.metadata.implementationGuide) ($(Format-DisplayDate $Report.metadata.implementationPublished))" -ForegroundColor DarkGray
        Write-Host "  Source: $($Report.metadata.implementationUrl)" -ForegroundColor DarkGray
        Write-Host "  NCCoE project: $($Report.metadata.projectName) [$($Report.metadata.projectStatus)]" -ForegroundColor DarkGray
        Write-Host "  Source: $($Report.metadata.projectUrl)" -ForegroundColor DarkGray
    }

    Write-Host ""
    foreach ($check in $Report.checks) {
        Write-CheckResult -Rating $check.rating -Name $check.name -Message $check.message -Action $check.action
    }

    Write-Host ""
    Write-Host "  Overall: $($Report.overallReadiness.ToUpper()) ($($Report.summary.pass) pass, $($Report.summary.warn) warn, $($Report.summary.fail) fail, $($Report.summary.blocker) blocker)" -ForegroundColor White
}

function Write-CombinedAuditSummary {
    param($AuditReports)

    if ($AuditReports.Keys.Count -lt 2) {
        return
    }

    Write-Banner "Combined Audit Summary"
    foreach ($frameworkId in $AuditReports.Keys) {
        $report = $AuditReports[$frameworkId]
        $color = switch ($report.overallReadiness) {
            "ready" { "Green" }
            "caution" { "Yellow" }
            "not-ready" { "Red" }
            "blocked" { "DarkRed" }
            default { "White" }
        }
        Write-Host "  $($report.displayName): $($report.overallReadiness.ToUpper()) ($($report.summary.pass) pass, $($report.summary.warn) warn, $($report.summary.fail) fail, $($report.summary.blocker) blocker)" -ForegroundColor $color
    }
}

# Get-TenantAuditFacts is now defined in scripts/audit/TenantFactCollector.ps1
# (dot-sourced at the top of this file)

function Get-TenantAuditFacts_LEGACY_REMOVED {
    $skuNames = @{
        'ENTERPRISEPACK'        = 'Microsoft 365 E3'
        'ENTERPRISEPREMIUM'     = 'Microsoft 365 E5'
        'SPE_E3'                = 'Microsoft 365 E3'
        'SPE_E5'                = 'Microsoft 365 E5'
        'O365_BUSINESS_PREMIUM' = 'Microsoft 365 Business Standard'
        'SPB'                   = 'Microsoft 365 Business Premium'
        'EMS'                   = 'Enterprise Mobility + Security E3'
        'EMSPREMIUM'            = 'Enterprise Mobility + Security E5'
        'AAD_PREMIUM'           = 'Entra ID P1'
        'AAD_PREMIUM_P2'        = 'Entra ID P2'
        'ATP_ENTERPRISE'        = 'Defender for Office 365 P1'
        'THREAT_INTELLIGENCE'   = 'Defender for Office 365 P2'
        'WIN_DEF_ATP'           = 'Defender for Endpoint P1'
        'INTUNE_A'              = 'Microsoft Intune'
    }

    $qualifyingSkus = @('ENTERPRISEPACK', 'ENTERPRISEPREMIUM', 'SPE_E3', 'SPE_E5', 'SPB', 'EMSPREMIUM')

    $facts = [ordered]@{
        organization      = [ordered]@{
            available     = $false
            tenantId      = $null
            displayName   = $null
            primaryDomain = $null
            error         = $null
        }
        conditionalAccess = [ordered]@{
            available          = $false
            totalPolicies      = 0
            enabledCount       = 0
            reportOnlyCount    = 0
            disabledCount      = 0
            policies           = @()
            error              = $null
        }
        namedLocations    = [ordered]@{
            available      = $false
            totalLocations = 0
            locations      = @()
            error          = $null
        }
        mfa               = [ordered]@{
            available       = $false
            totalUsers      = 0
            registeredUsers = 0
            percentage      = 0
            error           = $null
        }
        breakGlass        = [ordered]@{
            available   = $false
            groupExists = $false
            memberCount = 0
            error       = $null
        }
        adminRoles        = [ordered]@{
            available        = $false
            globalAdminCount = 0
            error            = $null
        }
        devices           = [ordered]@{
            available           = $false
            totalDevices        = 0
            compliantDevices    = 0
            nonCompliantDevices = 0
            error               = $null
        }
        licenses          = [ordered]@{
            available        = $false
            hasQualifyingSku = $false
            hasP2            = $false
            hasIntune        = $false
            hasDefenderO365  = $false
            hasDefenderEndpt = $false
            licenses         = @()
            error            = $null
        }
        securityDefaults  = [ordered]@{
            available = $false
            enabled   = $false
            error     = $null
        }
        domains           = [ordered]@{
            available          = $false
            totalDomains       = 0
            customDomainCount  = 0
            hasOnlyOnmicrosoft = $true
            error              = $null
        }
    }

    try {
        $org = Invoke-GraphRest -Uri "https://graph.microsoft.com/v1.0/organization?%24select=id,displayName,verifiedDomains"
        if (-not $org.value -or $org.value.Count -eq 0) {
            throw "Organization query returned no results."
        }

        $defaultDomains = @($org.value[0].verifiedDomains | Where-Object { $_.isDefault })
        $facts.organization.available = $true
        $facts.organization.tenantId = $org.value[0].id
        $facts.organization.displayName = $org.value[0].displayName
        $facts.organization.primaryDomain = $(if ($defaultDomains.Count -gt 0) { $defaultDomains[0].name } else { $null })
    }
    catch {
        $facts.organization.error = $_.Exception.Message
    }

    try {
        $policies = Invoke-GraphCollection -Uri "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies?%24select=id,displayName,state&%24top=100"
        $facts.conditionalAccess.available = $true
        $facts.conditionalAccess.policies = @($policies)
        $facts.conditionalAccess.totalPolicies = $facts.conditionalAccess.policies.Count
        foreach ($pol in $facts.conditionalAccess.policies) {
            switch ($pol.state) {
                "enabled"              { $facts.conditionalAccess.enabledCount++ }
                "enabledForReportingButNotEnforced" { $facts.conditionalAccess.reportOnlyCount++ }
                "disabled"             { $facts.conditionalAccess.disabledCount++ }
            }
        }
    }
    catch {
        $facts.conditionalAccess.error = $_.Exception.Message
    }

    try {
        $namedLocations = Invoke-GraphCollection -Uri "https://graph.microsoft.com/v1.0/identity/conditionalAccess/namedLocations?%24select=id,displayName&%24top=100"
        $facts.namedLocations.available = $true
        $facts.namedLocations.locations = @($namedLocations)
        $facts.namedLocations.totalLocations = $facts.namedLocations.locations.Count
    }
    catch {
        $facts.namedLocations.error = $_.Exception.Message
    }

    try {
        $mfaRows = Invoke-GraphCollection -Uri "https://graph.microsoft.com/v1.0/reports/authenticationMethods/userRegistrationDetails?%24top=100"
        foreach ($row in $mfaRows) {
            $facts.mfa.totalUsers++
            if ($row.isMfaRegistered) {
                $facts.mfa.registeredUsers++
            }
        }

        $facts.mfa.available = $true
        if ($facts.mfa.totalUsers -gt 0) {
            $facts.mfa.percentage = [math]::Round(($facts.mfa.registeredUsers / $facts.mfa.totalUsers) * 100, 1)
        }
    }
    catch {
        $facts.mfa.error = $_.Exception.Message
    }

    try {
        $bgGroup = Invoke-GraphRest -Uri "https://graph.microsoft.com/v1.0/groups?%24filter=displayName%20eq%20'ZeroTrust-BreakGlass-Admins'&%24select=id"
        $facts.breakGlass.available = $true
        if ($bgGroup.value -and $bgGroup.value.Count -gt 0) {
            $facts.breakGlass.groupExists = $true
            $members = Invoke-GraphCollection -Uri "https://graph.microsoft.com/v1.0/groups/$($bgGroup.value[0].id)/members?%24select=id&%24top=100"
            $facts.breakGlass.memberCount = @($members).Count
        }
    }
    catch {
        $facts.breakGlass.error = $_.Exception.Message
    }

    try {
        $roles = Invoke-GraphCollection -Uri "https://graph.microsoft.com/v1.0/directoryRoles?%24select=id,displayName&%24top=100"
        $facts.adminRoles.available = $true
        $gaRole = @($roles | Where-Object { $_.displayName -eq 'Global Administrator' })
        if ($gaRole.Count -gt 0) {
            $gaMembers = Invoke-GraphCollection -Uri "https://graph.microsoft.com/v1.0/directoryRoles/$($gaRole[0].id)/members?%24select=id&%24top=100"
            $facts.adminRoles.globalAdminCount = @($gaMembers).Count
        }
    }
    catch {
        $facts.adminRoles.error = $_.Exception.Message
    }

    try {
        $devices = Invoke-GraphCollection -Uri "https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?%24select=id,complianceState&%24top=999"
        $facts.devices.available = $true
        foreach ($device in $devices) {
            $facts.devices.totalDevices++
            if ($device.complianceState -eq 'compliant') {
                $facts.devices.compliantDevices++
            }
            elseif ($device.complianceState -eq 'noncompliant') {
                $facts.devices.nonCompliantDevices++
            }
        }
    }
    catch {
        $facts.devices.error = $_.Exception.Message
    }

    try {
        $skus = Invoke-GraphRest -Uri "https://graph.microsoft.com/v1.0/subscribedSkus"
        $facts.licenses.available = $true
        if ($skus.value) {
            foreach ($sku in $skus.value) {
                $friendlyName = $(if ($skuNames.Contains($sku.skuPartNumber)) { $skuNames[$sku.skuPartNumber] } else { $sku.skuPartNumber })
                $facts.licenses.licenses += @([ordered]@{
                    skuPartNumber = $sku.skuPartNumber
                    friendlyName  = $friendlyName
                    total         = $sku.prepaidUnits.enabled
                    consumed      = $sku.consumedUnits
                    available     = ($sku.prepaidUnits.enabled - $sku.consumedUnits)
                })

                if ($sku.skuPartNumber -in $qualifyingSkus) {
                    $facts.licenses.hasQualifyingSku = $true
                }
                if ($sku.skuPartNumber -eq 'AAD_PREMIUM_P2' -or $sku.skuPartNumber -in @('ENTERPRISEPREMIUM', 'SPE_E5', 'EMSPREMIUM')) {
                    $facts.licenses.hasP2 = $true
                }
                if ($sku.skuPartNumber -eq 'INTUNE_A' -or $sku.skuPartNumber -in $qualifyingSkus) {
                    $facts.licenses.hasIntune = $true
                }
                if ($sku.skuPartNumber -in @('ATP_ENTERPRISE', 'THREAT_INTELLIGENCE', 'ENTERPRISEPREMIUM', 'SPE_E5')) {
                    $facts.licenses.hasDefenderO365 = $true
                }
                if ($sku.skuPartNumber -in @('WIN_DEF_ATP', 'ENTERPRISEPREMIUM', 'SPE_E5')) {
                    $facts.licenses.hasDefenderEndpt = $true
                }
            }
        }
    }
    catch {
        $facts.licenses.error = $_.Exception.Message
    }

    try {
        $secDefaults = Invoke-GraphRest -Uri "https://graph.microsoft.com/v1.0/policies/identitySecurityDefaultsEnforcementPolicy"
        $facts.securityDefaults.available = $true
        $facts.securityDefaults.enabled = [bool]$secDefaults.isEnabled
    }
    catch {
        $facts.securityDefaults.error = $_.Exception.Message
    }

    try {
        $allDomains = Invoke-GraphRest -Uri "https://graph.microsoft.com/v1.0/domains?%24select=id,isDefault,isVerified"
        $facts.domains.available = $true
        if ($allDomains.value) {
            $facts.domains.totalDomains = @($allDomains.value).Count
            $customDomains = @($allDomains.value | Where-Object { $_.id -notmatch '\.onmicrosoft\.com$' })
            $facts.domains.customDomainCount = $customDomains.Count
            $facts.domains.hasOnlyOnmicrosoft = ($customDomains.Count -eq 0)
        }
    }
    catch {
        $facts.domains.error = $_.Exception.Message
    }

    return $facts
}

function Get-CisaAuditChecks {
    param($Facts)

    $checks = @()

    if ($Facts.organization.available) {
        $checks += New-AuditCheck -Name "Organization Info" -Rating "pass" -Message "Tenant: $($Facts.organization.displayName)" -Action $null
    }
    else {
        $checks += New-AuditCheck -Name "Organization Info" -Rating "blocker" -Message "Could not read tenant organization details" -Action "Verify the signed-in account can read Microsoft Graph organization data."
    }

    if ($Facts.conditionalAccess.available) {
        if ($Facts.conditionalAccess.totalPolicies -gt 0) {
            $stateDetail = "$($Facts.conditionalAccess.enabledCount) enabled, $($Facts.conditionalAccess.reportOnlyCount) report-only, $($Facts.conditionalAccess.disabledCount) disabled"
            if ($Facts.conditionalAccess.enabledCount -gt 0) {
                $checks += New-AuditCheck -Name "[SCuBA MS.AAD.3.1] CA Policies" -Rating "pass" -Message "$($Facts.conditionalAccess.totalPolicies) policies ($stateDetail)" -Action $null
            }
            else {
                $checks += New-AuditCheck -Name "[SCuBA MS.AAD.3.1] CA Policies" -Rating "warn" -Message "$($Facts.conditionalAccess.totalPolicies) policies found but none are enforced ($stateDetail)" -Action "Enable or enforce at least one Conditional Access policy."
            }
        }
        else {
            $checks += New-AuditCheck -Name "[SCuBA MS.AAD.3.1] CA Policies" -Rating "warn" -Message "No Conditional Access policies found" -Action "Deploy or create baseline Conditional Access policies."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[SCuBA MS.AAD.3.1] CA Policies" -Rating "fail" -Message "Could not retrieve Conditional Access policies" -Action "Verify the signed-in account has access to read Conditional Access policies."
    }

    if ($Facts.mfa.available) {
        if ($Facts.mfa.percentage -ge 80) {
            $checks += New-AuditCheck -Name "[SCuBA MS.AAD.3.2] MFA Registration" -Rating "pass" -Message "$($Facts.mfa.percentage)% registered" -Action $null
        }
        elseif ($Facts.mfa.percentage -ge 50) {
            $checks += New-AuditCheck -Name "[SCuBA MS.AAD.3.2] MFA Registration" -Rating "warn" -Message "$($Facts.mfa.percentage)% registered (target 80%)" -Action "Run MFA campaign before enabling broad MFA enforcement."
        }
        else {
            $checks += New-AuditCheck -Name "[SCuBA MS.AAD.3.2] MFA Registration" -Rating "fail" -Message "$($Facts.mfa.percentage)% registered (target 80%)" -Action "Many users will be impacted by MFA enforcement. Run a registration campaign first."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[SCuBA MS.AAD.3.2] MFA Registration" -Rating "fail" -Message "Could not retrieve MFA registration data" -Action "The Azure CLI token may not include the delegated Graph permissions needed for this report."
    }

    if ($Facts.breakGlass.available) {
        if ($Facts.breakGlass.memberCount -gt 0) {
            $checks += New-AuditCheck -Name "[SCuBA MS.AAD.1.1] Emergency Access" -Rating "pass" -Message "Break-glass group has $($Facts.breakGlass.memberCount) member(s)" -Action $null
        }
        elseif ($Facts.breakGlass.groupExists) {
            $checks += New-AuditCheck -Name "[SCuBA MS.AAD.1.1] Emergency Access" -Rating "warn" -Message "Break-glass group exists but has no members" -Action "Add break-glass accounts to ZeroTrust-BreakGlass-Admins."
        }
        else {
            $checks += New-AuditCheck -Name "[SCuBA MS.AAD.1.1] Emergency Access" -Rating "warn" -Message "Break-glass group is not configured" -Action "Create the break-glass group and add emergency accounts."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[SCuBA MS.AAD.1.1] Emergency Access" -Rating "fail" -Message "Could not verify the break-glass group" -Action "Verify group read permissions or check the group manually in Entra ID."
    }

    if ($Facts.adminRoles.available) {
        if ($Facts.adminRoles.globalAdminCount -ge 2 -and $Facts.adminRoles.globalAdminCount -le 5) {
            $checks += New-AuditCheck -Name "[SCuBA MS.AAD.2.1] Global Admins" -Rating "pass" -Message "$($Facts.adminRoles.globalAdminCount) admins (ideal)" -Action $null
        }
        else {
            $checks += New-AuditCheck -Name "[SCuBA MS.AAD.2.1] Global Admins" -Rating "warn" -Message "$($Facts.adminRoles.globalAdminCount) admins" -Action "Reduce or adjust Global Administrator count to 2-5."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[SCuBA MS.AAD.2.1] Global Admins" -Rating "fail" -Message "Could not verify Global Administrator membership" -Action "Verify directory role read permissions or review the role manually in Entra ID."
    }

    if ($Facts.devices.available) {
        if ($Facts.devices.totalDevices -eq 0) {
            $checks += New-AuditCheck -Name "[SCuBA MS.DEF.1.1] Device Compliance" -Rating "warn" -Message "No Intune-managed devices found" -Action "Enroll devices in Intune before enabling compliant-device policies."
        }
        elseif ($Facts.devices.compliantDevices -eq 0) {
            $checks += New-AuditCheck -Name "[SCuBA MS.DEF.1.1] Device Compliance" -Rating "warn" -Message "$($Facts.devices.totalDevices) device(s) found but none are compliant" -Action "Resolve compliance issues before enabling compliant-device access policies."
        }
        else {
            $checks += New-AuditCheck -Name "[SCuBA MS.DEF.1.1] Device Compliance" -Rating "pass" -Message "$($Facts.devices.compliantDevices)/$($Facts.devices.totalDevices) compliant" -Action $null
        }
    }
    else {
        $checks += New-AuditCheck -Name "[SCuBA MS.DEF.1.1] Device Compliance" -Rating "fail" -Message "Could not retrieve Intune managed devices" -Action "The local Azure CLI token does not have delegated Intune Graph access. Re-run with -SkipAudit or use a Graph client with DeviceManagementManagedDevices.Read.All."
    }

    if ($Facts.licenses.available) {
        if (-not $Facts.licenses.hasQualifyingSku) {
            $checks += New-AuditCheck -Name "[SCuBA Readiness] Licensing" -Rating "blocker" -Message "No qualifying M365 license found (E3/E5/Business Premium required)" -Action "Purchase Microsoft 365 E3, E5, or Business Premium before deploying."
        }
        elseif (-not $Facts.licenses.hasP2) {
            $checks += New-AuditCheck -Name "[SCuBA Readiness] Licensing" -Rating "warn" -Message "Qualifying M365 license found but no Entra ID P2" -Action "Consider adding Entra ID P2 for stronger risk-based controls."
        }
        else {
            $checks += New-AuditCheck -Name "[SCuBA Readiness] Licensing" -Rating "pass" -Message "Qualifying M365 license with Entra ID P2 detected" -Action $null
        }
    }
    else {
        $checks += New-AuditCheck -Name "[SCuBA Readiness] Licensing" -Rating "fail" -Message "Could not retrieve license data" -Action "Verify the signed-in account can read subscribed SKUs."
    }

    # Defender for Office 365 licensing
    if ($Facts.licenses.available) {
        if ($Facts.licenses.hasDefenderO365) {
            $checks += New-AuditCheck -Name "[SCuBA MS.EXO.4.1] Defender for Office 365" -Rating "pass" -Message "Defender for Office 365 license detected" -Action $null
        }
        else {
            $checks += New-AuditCheck -Name "[SCuBA MS.EXO.4.1] Defender for Office 365" -Rating "warn" -Message "No Defender for Office 365 license detected" -Action "Add Defender for Office 365 P1/P2 for Safe Links, Safe Attachments, and anti-phishing."
        }
    }

    # Named locations evaluation
    if ($Facts.namedLocations.available) {
        if ($Facts.namedLocations.totalLocations -gt 0) {
            $checks += New-AuditCheck -Name "[SCuBA MS.AAD.3.3] Named Locations" -Rating "pass" -Message "$($Facts.namedLocations.totalLocations) named location(s) configured" -Action $null
        }
        else {
            $checks += New-AuditCheck -Name "[SCuBA MS.AAD.3.3] Named Locations" -Rating "warn" -Message "No named locations configured" -Action "Define trusted network locations for location-based Conditional Access."
        }
    }

    # Security defaults check
    if ($Facts.securityDefaults.available) {
        if ($Facts.securityDefaults.enabled -and $Facts.conditionalAccess.totalPolicies -gt 0) {
            $checks += New-AuditCheck -Name "[SCuBA MS.AAD.7.1] Security Defaults" -Rating "warn" -Message "Security defaults are enabled alongside Conditional Access" -Action "Disable security defaults when using Conditional Access policies to avoid conflicts."
        }
        elseif ($Facts.securityDefaults.enabled) {
            $checks += New-AuditCheck -Name "[SCuBA MS.AAD.7.1] Security Defaults" -Rating "pass" -Message "Security defaults are enabled (good baseline)" -Action $null
        }
        else {
            if ($Facts.conditionalAccess.totalPolicies -eq 0) {
                $checks += New-AuditCheck -Name "[SCuBA MS.AAD.7.1] Security Defaults" -Rating "warn" -Message "Security defaults are disabled with no Conditional Access policies" -Action "Enable security defaults or deploy Conditional Access policies."
            }
        }
    }

    # Custom domain check
    if ($Facts.domains.available) {
        if ($Facts.domains.hasOnlyOnmicrosoft) {
            $checks += New-AuditCheck -Name "[SCuBA Readiness] Custom Domain" -Rating "warn" -Message "Only .onmicrosoft.com domain found" -Action "Add and verify a custom domain for production use."
        }
        else {
            $checks += New-AuditCheck -Name "[SCuBA Readiness] Custom Domain" -Rating "pass" -Message "$($Facts.domains.customDomainCount) custom domain(s) verified" -Action $null
        }
    }

    return @($checks)
}

function Get-NistAuditChecks {
    param($Facts)

    $checks = @()

    if ($Facts.conditionalAccess.available -and $Facts.mfa.available) {
        if ($Facts.conditionalAccess.totalPolicies -gt 0 -and $Facts.mfa.percentage -ge 80) {
            $checks += New-AuditCheck -Name "[NIST ZTA] Identity-Centric Access Decisions" -Rating "pass" -Message "Conditional Access is present and MFA registration is $($Facts.mfa.percentage)%" -Action $null
        }
        elseif ($Facts.conditionalAccess.totalPolicies -gt 0 -and $Facts.mfa.percentage -ge 50) {
            $checks += New-AuditCheck -Name "[NIST ZTA] Identity-Centric Access Decisions" -Rating "warn" -Message "Conditional Access is present but MFA registration is only $($Facts.mfa.percentage)%" -Action "Increase MFA coverage before relying on identity-centric policy enforcement."
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA] Identity-Centric Access Decisions" -Rating "fail" -Message "Identity-centric enforcement is weak or incomplete" -Action "Deploy Conditional Access and raise MFA registration coverage."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA] Identity-Centric Access Decisions" -Rating "fail" -Message "Could not verify Conditional Access and MFA posture" -Action "Use an account with delegated Graph access to CA policy and MFA registration reports."
    }

    if ($Facts.devices.available) {
        if ($Facts.devices.totalDevices -gt 0 -and $Facts.devices.compliantDevices -gt 0) {
            $checks += New-AuditCheck -Name "[NIST ZTA] Device Posture Evaluation" -Rating "pass" -Message "$($Facts.devices.compliantDevices)/$($Facts.devices.totalDevices) managed devices are compliant" -Action $null
        }
        elseif ($Facts.devices.totalDevices -gt 0) {
            $checks += New-AuditCheck -Name "[NIST ZTA] Device Posture Evaluation" -Rating "warn" -Message "$($Facts.devices.totalDevices) managed devices found but none are compliant" -Action "Improve device compliance before enforcing device-based access control."
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA] Device Posture Evaluation" -Rating "warn" -Message "No managed devices found" -Action "Enroll devices in Intune before enforcing device-trust decisions."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA] Device Posture Evaluation" -Rating "fail" -Message "Could not retrieve managed device posture" -Action "Use a Graph client with delegated Intune device permissions or run -SkipAudit."
    }

    if ($Facts.conditionalAccess.available -and $Facts.licenses.available) {
        if ($Facts.conditionalAccess.totalPolicies -gt 0 -and $Facts.licenses.hasQualifyingSku -and $Facts.licenses.hasP2) {
            $checks += New-AuditCheck -Name "[NIST ZTA] Dynamic Policy Engine Readiness" -Rating "pass" -Message "Conditional Access and licensing support dynamic policy decisions" -Action $null
        }
        elseif ($Facts.conditionalAccess.totalPolicies -gt 0 -and $Facts.licenses.hasQualifyingSku) {
            $checks += New-AuditCheck -Name "[NIST ZTA] Dynamic Policy Engine Readiness" -Rating "warn" -Message "Conditional Access is present but Entra ID P2 is not detected" -Action "Add Entra ID P2 to support stronger adaptive policy decisions."
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA] Dynamic Policy Engine Readiness" -Rating "fail" -Message "Dynamic policy capability is not fully in place" -Action "Deploy Conditional Access and verify the tenant has qualifying licensing."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA] Dynamic Policy Engine Readiness" -Rating "fail" -Message "Could not verify policy engine prerequisites" -Action "Verify access to Conditional Access policy and license data."
    }

    if ($Facts.adminRoles.available) {
        if ($Facts.adminRoles.globalAdminCount -ge 2 -and $Facts.adminRoles.globalAdminCount -le 5) {
            $checks += New-AuditCheck -Name "[NIST ZTA] Administrative Least Privilege" -Rating "pass" -Message "$($Facts.adminRoles.globalAdminCount) Global Administrators found" -Action $null
        }
        elseif ($Facts.adminRoles.globalAdminCount -eq 1) {
            $checks += New-AuditCheck -Name "[NIST ZTA] Administrative Least Privilege" -Rating "warn" -Message "Only 1 Global Administrator found" -Action "Add redundancy while keeping privileged access tightly limited."
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA] Administrative Least Privilege" -Rating "warn" -Message "$($Facts.adminRoles.globalAdminCount) Global Administrators found" -Action "Review and reduce excessive privileged role assignments."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA] Administrative Least Privilege" -Rating "fail" -Message "Could not verify privileged role assignments" -Action "Verify directory role read permissions or review roles manually in Entra ID."
    }

    if ($Facts.breakGlass.available) {
        if ($Facts.breakGlass.memberCount -gt 0) {
            $checks += New-AuditCheck -Name "[NIST ZTA] Resilient Emergency Access" -Rating "pass" -Message "Break-glass access exists with $($Facts.breakGlass.memberCount) member(s)" -Action $null
        }
        elseif ($Facts.breakGlass.groupExists) {
            $checks += New-AuditCheck -Name "[NIST ZTA] Resilient Emergency Access" -Rating "warn" -Message "Break-glass group exists but is empty" -Action "Add emergency accounts and validate their exclusion path."
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA] Resilient Emergency Access" -Rating "warn" -Message "Break-glass access path is not configured" -Action "Create a break-glass group and document an emergency access process."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA] Resilient Emergency Access" -Rating "fail" -Message "Could not verify emergency access readiness" -Action "Verify group read permissions or review the break-glass configuration manually."
    }

    # Defender for Endpoint (network/application pillar)
    if ($Facts.licenses.available) {
        if ($Facts.licenses.hasDefenderEndpt) {
            $checks += New-AuditCheck -Name "[NIST ZTA] Threat Detection Capability" -Rating "pass" -Message "Defender for Endpoint license detected for device-level threat intelligence" -Action $null
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA] Threat Detection Capability" -Rating "warn" -Message "No Defender for Endpoint license detected" -Action "Add Defender for Endpoint to integrate device threat signals into zero trust decisions."
        }
    }

    # Named locations (network pillar)
    if ($Facts.namedLocations.available) {
        if ($Facts.namedLocations.totalLocations -gt 0) {
            $checks += New-AuditCheck -Name "[NIST ZTA] Network Context Awareness" -Rating "pass" -Message "$($Facts.namedLocations.totalLocations) named location(s) provide network context for policy decisions" -Action $null
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA] Network Context Awareness" -Rating "warn" -Message "No named locations configured for network-based access decisions" -Action "Define trusted locations to support location-aware zero trust policies."
        }
    }

    $telemetrySignals = 0
    if ($Facts.conditionalAccess.available) { $telemetrySignals++ }
    if ($Facts.mfa.available) { $telemetrySignals++ }
    if ($Facts.devices.available) { $telemetrySignals++ }
    if ($Facts.licenses.available) { $telemetrySignals++ }

    if ($telemetrySignals -ge 4) {
        $checks += New-AuditCheck -Name "[NIST ZTA] Continuous Monitoring Inputs" -Rating "pass" -Message "Identity, policy, device, and licensing telemetry were all retrievable" -Action $null
    }
    elseif ($telemetrySignals -ge 2) {
        $checks += New-AuditCheck -Name "[NIST ZTA] Continuous Monitoring Inputs" -Rating "warn" -Message "Only $telemetrySignals of 4 telemetry sources were retrievable during the audit" -Action "Broaden delegated Graph access so audit telemetry can be validated end to end."
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA] Continuous Monitoring Inputs" -Rating "fail" -Message "Too little telemetry was retrievable to validate continuous monitoring readiness" -Action "Run the audit with delegated access to policy, MFA, device, and license telemetry sources."
    }

    return @($checks)
}
