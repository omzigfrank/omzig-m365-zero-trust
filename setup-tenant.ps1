<#
.SYNOPSIS
    One-time tenant setup for Omzig M365 Zero Trust deployment.
.DESCRIPTION
    Grants all required Microsoft Graph API permissions to the managed identity
    and runs a pre-deployment audit against the client tenant using CISA SCuBA,
    the NIST zero trust standards, or both. Before running the audit, the script
    refreshes a local framework catalog from official CISA and NIST sources.

    Can export the selected audit results into a formatted Excel scorecard and
    write a combined JSON audit report to disk.

    Must be run by a Global Administrator on the client tenant.

    This script:
    1. Signs you into Azure (interactive)
    2. Finds the managed identity's service principal
    3. Dynamically resolves all 17 Graph API permissions
    4. Grants each permission (skips already-granted ones)
    5. Refreshes the official framework catalog for CISA SCuBA and the NIST zero trust standards
    6. Runs a CISA audit, NIST standards audit, or both via Microsoft Graph
    7. Writes a combined audit report to disk
    8. Optionally exports the selected framework findings to the OMZIG Security Scorecard Excel template.
.PARAMETER ResourceGroupName
    Azure resource group containing the managed app deployment.
.PARAMETER ManagedIdentityName
    Name of the user-assigned managed identity (e.g., "id-omzig-test-graph").
.PARAMETER SkipAudit
    Skip the pre-deployment audit checks after granting permissions.
.PARAMETER AuditFramework
    Optional override for audit mode: CISA, NIST, or Both.
    If omitted, the script prompts you to choose NIST, CISA, or Both.
.PARAMETER TemplatePath
    Path to the OMZIG Security Scorecard Excel template.
.PARAMETER ExportPath
    Path to save the filled audit scorecard.
.PARAMETER AuditReportPath
    Path to save the JSON audit report.
.PARAMETER FrameworkCachePath
    Path to save the refreshed framework catalog metadata.
#>

param(
    [string]$ResourceGroupName,
    [string]$ManagedIdentityName,
    [switch]$SkipAudit,
    [ValidateSet('CISA', 'NIST', 'Both')]
    [string]$AuditFramework,
    [string]$TemplatePath = "$HOME\Downloads\OMZIG_Security_Scorecard_Armur_Consulting.xlsx",
    [string]$ExportPath = ".\OMZIG_CISA_SCuBA_Scorecard.xlsx",
    [string]$AuditReportPath = ".\OMZIG_Audit_Report.json",
    [string]$FrameworkCachePath = (Join-Path $PSScriptRoot 'framework-cache.json')
)

$ErrorActionPreference = "Stop"

# Ensure TLS 1.2 for Graph API (required on PS 5.1)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

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

    $pad = $Name.PadRight(45)

    switch ($Rating) {
        "pass"    { Write-Host "  [PASS]    $pad $Message" -ForegroundColor Green }
        "warn"    { Write-Host "  [WARN]    $pad $Message" -ForegroundColor Yellow }
        "fail"    { Write-Host "  [FAIL]    $pad $Message" -ForegroundColor Red }
        "blocker" { Write-Host "  [BLOCK]   $pad $Message" -ForegroundColor DarkRed }
    }

    if ($Action) {
        Write-Host "            $(' ' * 45) Action: $Action" -ForegroundColor DarkYellow
    }
}

$script:CachedGraphToken = $null
$script:CachedGraphTokenExpiry = [datetime]::MinValue

function Get-GraphToken {
    $now = [datetime]::UtcNow
    if ($script:CachedGraphToken -and $now -lt $script:CachedGraphTokenExpiry) {
        return $script:CachedGraphToken
    }

    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $tokenJson = az account get-access-token --resource-type ms-graph --output json 2>$null
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = $prevEAP

    if ($exitCode -ne 0) {
        $prevEAP = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $tokenJson = az account get-access-token --resource https://graph.microsoft.com --output json
        $exitCode = $LASTEXITCODE
        $ErrorActionPreference = $prevEAP
    }

    if ($exitCode -ne 0) {
        throw "Failed to get Graph API token from az CLI"
    }

    $tokenData = $tokenJson | ConvertFrom-Json
    if (-not $tokenData -or -not $tokenData.accessToken) {
        throw "Azure CLI returned an empty or invalid token response."
    }

    $script:CachedGraphToken = $tokenData.accessToken

    # Cache for 45 minutes (tokens typically last 60-90 min)
    if ($tokenData.expiresOn) {
        try {
            $script:CachedGraphTokenExpiry = [datetime]::Parse($tokenData.expiresOn).ToUniversalTime().AddMinutes(-5)
        }
        catch {
            $script:CachedGraphTokenExpiry = $now.AddMinutes(45)
        }
    }
    else {
        $script:CachedGraphTokenExpiry = $now.AddMinutes(45)
    }

    return $script:CachedGraphToken
}

function Invoke-GraphRest {
    param(
        [Parameter(Mandatory)]
        [string]$Uri
    )

    $token = Get-GraphToken
    $headers = @{
        "Authorization" = "Bearer $token"
        "Accept"        = "application/json"
    }

    try {
        return Invoke-RestMethod -Uri $Uri -Headers $headers -Method GET -ErrorAction Stop
    }
    catch {
        $message = $_.Exception.Message
        $statusCode = $null

        if ($_.Exception.Response) {
            try {
                $statusCode = [int]$_.Exception.Response.StatusCode
            }
            catch {
                # StatusCode unavailable on this response type
            }

            $reader = $null
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                if ($stream) {
                    $reader = New-Object System.IO.StreamReader($stream)
                    $responseBody = $reader.ReadToEnd()
                    if ($responseBody) {
                        try {
                            $errorPayload = $responseBody | ConvertFrom-Json -ErrorAction Stop
                            if ($errorPayload.error.message) {
                                $message = $errorPayload.error.message
                            }
                            else {
                                $message = $responseBody
                            }
                        }
                        catch {
                            $message = $responseBody
                        }
                    }
                }
            }
            catch {
                # Response stream unavailable
            }
            finally {
                if ($reader) { $reader.Dispose() }
            }
        }

        if ($statusCode) {
            throw "Graph API request failed (HTTP $statusCode): $message"
        }

        throw "Graph API request failed: $message"
    }
}

function Invoke-GraphCollection {
    param(
        [Parameter(Mandatory)]
        [string]$Uri
    )

    $items = @()
    $nextUri = $Uri

    while ($nextUri) {
        $response = Invoke-GraphRest -Uri $nextUri
        if ($response.value) {
            $items += @($response.value)
        }
        $nextUri = $response.'@odata.nextLink'
    }

    return @($items)
}

function Get-EnabledAzSubscriptionsForTenant {
    param([string]$TenantId)

    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $subscriptionsJson = az account list --all --output json 2>$null
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = $prevEAP

    if ($exitCode -ne 0 -or -not $subscriptionsJson) {
        return @()
    }

    try {
        $parsedSubscriptions = $subscriptionsJson | ConvertFrom-Json
        $subscriptions = @($parsedSubscriptions)
    }
    catch {
        return @()
    }

    return @(
        $subscriptions |
        Where-Object {
            $_.tenantId -eq $TenantId -and
            (-not $_.state -or $_.state -eq "Enabled") -and
            $_.name -ne "N/A(tenant level account)" -and
            $_.id -ne $TenantId
        } |
        Sort-Object -Property name
    )
}

function Select-AzSubscriptionContext {
    param(
        [string]$TenantId,
        [string]$CurrentSubscriptionId
    )

    $subscriptions = @(Get-EnabledAzSubscriptionsForTenant -TenantId $TenantId)
    if ($subscriptions.Count -eq 0) {
        return $null
    }

    $selectedSubscription = $null
    $defaultIndex = 1
    for ($i = 0; $i -lt $subscriptions.Count; $i++) {
        if ($subscriptions[$i].id -eq $CurrentSubscriptionId) {
            $defaultIndex = $i + 1
            break
        }
    }

    if ($subscriptions.Count -eq 1) {
        $selectedSubscription = $subscriptions[0]
    }
    else {
        Write-Host ""
        Write-Host "Select the Azure subscription that contains the Omzig managed identity:" -ForegroundColor Yellow
        for ($i = 0; $i -lt $subscriptions.Count; $i++) {
            $marker = $(if (($i + 1) -eq $defaultIndex) { "*" } else { " " })
            Write-Host ("  [{0}] {1} {2} ({3})" -f ($i + 1), $marker, $subscriptions[$i].name, $subscriptions[$i].id) -ForegroundColor White
        }

        $choice = (Read-Host "Select subscription [1-$($subscriptions.Count)] (default $defaultIndex)").Trim()
        if ([string]::IsNullOrWhiteSpace($choice)) {
            $selectedSubscription = $subscriptions[$defaultIndex - 1]
        }
        else {
            $selection = 0
            if (-not [int]::TryParse($choice, [ref]$selection) -or $selection -lt 1 -or $selection -gt $subscriptions.Count) {
                throw "Invalid subscription selection. Enter a number from 1 to $($subscriptions.Count)."
            }

            $selectedSubscription = $subscriptions[$selection - 1]
        }
    }

    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    az account set --subscription $selectedSubscription.id --output none 2>$null
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = $prevEAP

    if ($exitCode -ne 0) {
        throw "Failed to set Azure subscription context to '$($selectedSubscription.name)' ($($selectedSubscription.id))."
    }

    return $selectedSubscription
}

function Get-ManagedIdentityCandidatesFromGraph {
    param([string]$ManagedIdentityName)

    $servicePrincipals = $null
    try {
        $servicePrincipals = Invoke-GraphCollection -Uri "https://graph.microsoft.com/v1.0/servicePrincipals?%24filter=servicePrincipalType%20eq%20%27ManagedIdentity%27&%24select=id,displayName,servicePrincipalType&%24top=999"
    }
    catch {
        $servicePrincipals = Invoke-GraphCollection -Uri "https://graph.microsoft.com/v1.0/servicePrincipals?%24select=id,displayName,servicePrincipalType&%24top=999"
    }

    if ($ManagedIdentityName) {
        return @(
            $servicePrincipals |
            Where-Object { $_.displayName -ieq $ManagedIdentityName } |
            Sort-Object -Property displayName
        )
    }

    return @(
        $servicePrincipals |
        Where-Object {
            $_.displayName -match 'omzig' -and
            (-not $_.servicePrincipalType -or $_.servicePrincipalType -eq 'ManagedIdentity')
        } |
        Sort-Object -Property displayName
    )
}

function Resolve-ManagedIdentityFromGraph {
    param([string]$ManagedIdentityName)

    if ($ManagedIdentityName) {
        Write-Host "  Searching Microsoft Graph for managed identity '$ManagedIdentityName'..." -ForegroundColor DarkGray
    }
    else {
        Write-Host "  Searching Microsoft Graph for Omzig managed identities..." -ForegroundColor DarkGray
    }

    try {
        $candidates = @(Get-ManagedIdentityCandidatesFromGraph -ManagedIdentityName $ManagedIdentityName)
    }
    catch {
        throw "Could not search Microsoft Graph for managed identities. $($_.Exception.Message)"
    }

    if ($candidates.Count -eq 0) {
        if ($ManagedIdentityName) {
            throw "Managed identity '$ManagedIdentityName' was not found in Microsoft Graph service principals."
        }

        throw "No managed identities containing 'omzig' were found in Microsoft Graph service principals."
    }

    if ($candidates.Count -eq 1) {
        return [pscustomobject]@{
            principalId   = $candidates[0].id
            name          = $candidates[0].displayName
            resourceGroup = $null
            source        = "Microsoft Graph"
        }
    }

    Write-Host "  Multiple Omzig managed identities found in Microsoft Graph:" -ForegroundColor Yellow
    for ($i = 0; $i -lt $candidates.Count; $i++) {
        Write-Host "    [$($i + 1)] $($candidates[$i].displayName)"
    }

    $choice = Read-Host "  Select identity (1-$($candidates.Count))"
    $selection = 0
    if (-not [int]::TryParse($choice, [ref]$selection) -or $selection -lt 1 -or $selection -gt $candidates.Count) {
        throw "Invalid selection. Enter a number from 1 to $($candidates.Count)."
    }

    $selectedCandidate = $candidates[$selection - 1]
    return [pscustomobject]@{
        principalId   = $selectedCandidate.id
        name          = $selectedCandidate.displayName
        resourceGroup = $null
        source        = "Microsoft Graph"
    }
}

. (Join-Path $PSScriptRoot 'scripts\FrameworkAuditHelper.ps1')

function Convert-AuditRatingToScorecardRating {
    param([string]$Rating)

    switch ($Rating) {
        "pass" { return "pass" }
        "warn" { return "warn" }
        "fail" { return "fail" }
        "blocker" { return "fail" }
        default { return "na" }
    }
}

function Get-AuditCheckTabCategory {
    param([string]$CheckName)

    if ([string]::IsNullOrWhiteSpace($CheckName)) { return $null }

    # CISA SCuBA checks - map by control family prefix
    if ($CheckName -match 'MS\.AAD')            { return "Identity & Access" }
    if ($CheckName -match 'MS\.EXO')            { return "M365 Workloads" }
    if ($CheckName -match 'MS\.DEFENDER')       { return "Defender for Office 365" }
    if ($CheckName -match 'MS\.SHAREPOINT')     { return "M365 Workloads" }
    if ($CheckName -match 'MS\.TEAMS')          { return "M365 Workloads" }
    if ($CheckName -match 'MS\.POWERPLATFORM')  { return "Compliance & Data Governance" }
    if ($CheckName -match 'MS\.POWERBI')        { return "Compliance & Data Governance" }
    if ($CheckName -match 'Readiness.*Licens')  { return "Compliance & Data Governance" }
    if ($CheckName -match 'Readiness.*Domain')  { return "Compliance & Data Governance" }

    # NIST ZTA checks - map by tenet
    if ($CheckName -match '\[NIST ZTA T1\]')    { return "Compliance & Data Governance" }
    if ($CheckName -match '\[NIST ZTA T2\]')    { return "Identity & Access" }
    if ($CheckName -match '\[NIST ZTA T3\]')    { return "Identity & Access" }
    if ($CheckName -match '\[NIST ZTA T4\]')    { return "Identity & Access" }
    if ($CheckName -match '\[NIST ZTA T5\]')    { return "Defender for Office 365" }
    if ($CheckName -match '\[NIST ZTA T6\]')    { return "Identity & Access" }
    if ($CheckName -match '\[NIST ZTA T7\]')    { return "Compliance & Data Governance" }
    if ($CheckName -match '\[NIST 800-53\]')    { return "Compliance & Data Governance" }

    # Legacy NIST patterns (fallback)
    if ($CheckName -match 'Identity-Centric|Administrative Least Privilege|Resilient Emergency Access') {
        return "Identity & Access"
    }
    if ($CheckName -match 'Threat Detection')      { return "Defender for Office 365" }
    if ($CheckName -match 'Network Context')        { return "Azure Infrastructure" }
    if ($CheckName -match 'Dynamic Policy|Continuous Monitoring') {
        return "Compliance & Data Governance"
    }
    if ($CheckName -match 'Device Posture')         { return "M365 Workloads" }

    return $null
}

function Get-AuditCheckControlFamily {
    param([string]$CheckName)

    if ($CheckName -match '\[SCuBA (MS\.\w+)') { return $Matches[1] }
    if ($CheckName -match '\[SCuBA (Readiness)\]') { return "Readiness" }
    if ($CheckName -match '\[NIST ZTA (T\d)\]') { return "NIST ZTA $($Matches[1])" }
    if ($CheckName -match '\[NIST ZTA\]') { return "NIST ZTA" }
    if ($CheckName -match '\[NIST 800-53\] (\w{2})') { return "800-53 $($Matches[1])" }
    return "General"
}

function Get-NistCsfCodeForCheck {
    param([string]$CheckName)

    # CISA SCuBA product-based mapping
    if ($CheckName -match 'MS\.AAD\.[1-2]\.')                     { return "PR.AA" }  # Auth/risk
    if ($CheckName -match 'MS\.AAD\.3\.')                          { return "PR.AA" }  # MFA
    if ($CheckName -match 'MS\.AAD\.4\.')                          { return "DE.AE" }  # Logging
    if ($CheckName -match 'MS\.AAD\.5\.')                          { return "PR.AA" }  # App consent
    if ($CheckName -match 'MS\.AAD\.6\.')                          { return "PR.AA" }  # Password
    if ($CheckName -match 'MS\.AAD\.7\.')                          { return "PR.AA" }  # PIM/roles
    if ($CheckName -match 'MS\.AAD\.8\.')                          { return "PR.AA" }  # Guest
    if ($CheckName -match 'MS\.EXO\.[1-7]\.')                     { return "PR.DS" }  # Mail transport
    if ($CheckName -match 'MS\.EXO\.[89]\.')                      { return "PR.DS" }  # DLP/filtering
    if ($CheckName -match 'MS\.EXO\.1[0-3]\.')                    { return "DE.CM" }  # Scanning/audit
    if ($CheckName -match 'MS\.EXO\.1[4-5]\.')                    { return "PR.DS" }  # Safe Links/Attach
    if ($CheckName -match 'MS\.EXO\.1[6-7]\.')                    { return "DE.CM" }  # Alerts/apps
    if ($CheckName -match 'MS\.DEFENDER')                          { return "DE.CM" }  # Defender
    if ($CheckName -match 'MS\.SHAREPOINT')                        { return "PR.DS" }  # Data sharing
    if ($CheckName -match 'MS\.TEAMS')                             { return "PR.DS" }  # Collaboration
    if ($CheckName -match 'MS\.POWERPLATFORM')                     { return "PR.PS" }  # Platform security
    if ($CheckName -match 'MS\.POWERBI')                           { return "PR.DS" }  # Data sharing

    # NIST ZTA tenet-based mapping
    if ($CheckName -match '\[NIST ZTA T1\]')                      { return "ID.AM" }  # Asset mgmt
    if ($CheckName -match '\[NIST ZTA T2\]')                      { return "PR.DS" }  # Data security
    if ($CheckName -match '\[NIST ZTA T3\]')                      { return "PR.AA" }  # Auth/access
    if ($CheckName -match '\[NIST ZTA T4\]')                      { return "PR.AA" }  # Policy engine
    if ($CheckName -match '\[NIST ZTA T5\]')                      { return "DE.CM" }  # Monitoring
    if ($CheckName -match '\[NIST ZTA T6\]')                      { return "PR.AA" }  # Strong auth
    if ($CheckName -match '\[NIST ZTA T7\]')                      { return "GV.RM" }  # Improvement
    if ($CheckName -match '\[NIST 800-53\]')                      { return "GV.OC" }  # Compliance

    # Legacy/fallback patterns
    if ($CheckName -match 'MFA|CA Policies')                      { return "PR.AA" }
    if ($CheckName -match 'Emergency Access|Resilient')            { return "PR.AA" }
    if ($CheckName -match 'Global Admins|Least Privilege')         { return "PR.AA" }
    if ($CheckName -match 'Named Locations|Network Context')       { return "PR.AA" }
    if ($CheckName -match 'Security Defaults')                     { return "PR.AA" }
    if ($CheckName -match 'Defender|Threat Detection')             { return "DE.CM" }
    if ($CheckName -match 'Device|Compliance|Posture')             { return "PR.PS" }
    if ($CheckName -match 'Licens')                                { return "GV.OC" }
    if ($CheckName -match 'Domain')                                { return "ID.AM" }
    return $null
}

function Clear-WorksheetDataRows {
    param($Worksheet)

    if (-not $Worksheet -or -not $Worksheet.Dimension) { return }

    $lastRow = $Worksheet.Dimension.End.Row
    if ($lastRow -lt 5) { return }

    # Delete rows from bottom to top to avoid shifting issues
    for ($row = $lastRow; $row -ge 5; $row--) {
        $Worksheet.DeleteRow($row)
    }
}

function Write-AuditCheckRows {
    param(
        $Worksheet,
        [array]$Checks,
        $StyleMap
    )

    $row = 5
    $counter = 1
    foreach ($check in $Checks) {
        # B = row number
        $Worksheet.Cells["B$row"].Value = $counter
        # C = control family / framework prefix
        $Worksheet.Cells["C$row"].Value = Get-AuditCheckControlFamily -CheckName $check.name
        # D = check description (setting text)
        $Worksheet.Cells["D$row"].Value = $check.name
        # E = status (pass/fail/warn/blocker/na)
        Set-ScorecardStatusCell -Cell $Worksheet.Cells["E$row"] -Rating (Convert-AuditRatingToScorecardRating -Rating $check.rating) -StyleMap $StyleMap
        # F = finding message + recommended action
        $noteText = [string]$check.message
        if (-not [string]::IsNullOrWhiteSpace($check.action)) {
            $noteText = "$noteText`nAction: $($check.action)"
        }
        $Worksheet.Cells["F$row"].Value = $noteText
        $Worksheet.Cells["F$row"].Style.WrapText = $true
        # H = NIST CSF reference (needed by Update-NistReferenceWorksheet)
        $nistRef = Get-NistCsfCodeForCheck -CheckName $check.name
        if ($nistRef) {
            $Worksheet.Cells["H$row"].Value = $nistRef
        }

        $row++
        $counter++
    }
}

function Convert-HexToDrawingColor {
    param([string]$Rgb)

    if ([string]::IsNullOrWhiteSpace($Rgb)) {
        return [System.Drawing.Color]::White
    }

    $hex = $(if ($Rgb.Length -eq 8) { $Rgb.Substring(2) } else { $Rgb })
    return [System.Drawing.Color]::FromArgb(
        [Convert]::ToInt32($hex.Substring(0, 2), 16),
        [Convert]::ToInt32($hex.Substring(2, 2), 16),
        [Convert]::ToInt32($hex.Substring(4, 2), 16)
    )
}

function Get-ScorecardStyleMap {
    param($Workbook)

    $identitySheet = $Workbook.Worksheets["Identity & Access"]
    return @{
        value = @{
            pass = $identitySheet.Cells["E12"].StyleID
            fail = $identitySheet.Cells["E7"].StyleID
            na   = $identitySheet.Cells["E5"].StyleID
        }
    }
}

function Set-ScorecardStatusCell {
    param(
        $Cell,
        [string]$Rating,
        $StyleMap
    )

    switch ($Rating) {
        "pass" {
            $Cell.StyleID = $StyleMap.value.pass
            $Cell.Value = "✓  Pass"
        }
        "fail" {
            $Cell.StyleID = $StyleMap.value.fail
            $Cell.Value = "✗  Fail"
        }
        "warn" {
            $Cell.StyleID = $StyleMap.value.fail
            $Cell.Value = "⚠  Warn"
            $Cell.Style.Font.Color.SetColor((Convert-HexToDrawingColor -Rgb "FFB9770E"))
            $Cell.Style.Fill.PatternType = [OfficeOpenXml.Style.ExcelFillStyle]::Solid
            $Cell.Style.Fill.BackgroundColor.SetColor((Convert-HexToDrawingColor -Rgb "FFFDEBD0"))
        }
        "blocker" {
            $Cell.StyleID = $StyleMap.value.fail
            $Cell.Value = "✗  Blocker"
            $Cell.Style.Font.Color.SetColor((Convert-HexToDrawingColor -Rgb "FF922B21"))
            $Cell.Style.Fill.PatternType = [OfficeOpenXml.Style.ExcelFillStyle]::Solid
            $Cell.Style.Fill.BackgroundColor.SetColor((Convert-HexToDrawingColor -Rgb "FFF5B7B1"))
        }
        default {
            $Cell.StyleID = $StyleMap.value.na
            $Cell.Value = "—  N/A"
        }
    }
}

function Get-AuditFindingRows {
    param($AuditReports)

    $rows = @()
    foreach ($frameworkId in $AuditReports.Keys) {
        $report = $AuditReports[$frameworkId]
        foreach ($check in @($report.checks)) {
            $rows += @([ordered]@{
                framework        = $report.displayName
                control          = [string]$check.name
                rating           = [string]$check.rating
                message          = [string]$check.message
                action           = [string]$check.action
                overallReadiness = [string]$report.overallReadiness
            })
        }
    }

    return @($rows)
}

function Update-AuditFindingsWorksheet {
    param(
        $Package,
        [string]$SelectedAuditFramework,
        $AuditReports,
        $StyleMap
    )

    $worksheetName = "Audit Findings"
    if ($Package.Workbook.Worksheets[$worksheetName]) {
        $Package.Workbook.Worksheets.Delete($worksheetName)
    }

    $worksheet = $Package.Workbook.Worksheets.Add($worksheetName)
    $referenceSheet = $Package.Workbook.Worksheets["Identity & Access"]
    $headerStyleId = $referenceSheet.Cells["C4"].StyleID
    $bodyStyleId = $referenceSheet.Cells["C5"].StyleID
    $titleStyleId = $referenceSheet.Cells["A1"].StyleID
    $auditLabel = Get-AuditFrameworkDisplayName -FrameworkId $SelectedAuditFramework
    $findingRows = @(Get-AuditFindingRows -AuditReports $AuditReports)

    $worksheet.Cells["A1:F1"].Merge = $true
    $worksheet.Cells["A1"].Value = "OMZIG Audit Findings"
    $worksheet.Cells["A1"].StyleID = $titleStyleId
    $worksheet.Cells["A2"].Value = "Framework selection:"
    $worksheet.Cells["B2"].Value = $auditLabel
    $worksheet.Cells["D2"].Value = "Exported:"
    $worksheet.Cells["E2"].Value = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")

    foreach ($cell in @("A2", "B2", "D2", "E2")) {
        $worksheet.Cells[$cell].StyleID = $bodyStyleId
    }

    $headers = @("Framework", "Control", "Status", "Finding", "Recommended Action", "Overall Readiness")
    for ($columnIndex = 0; $columnIndex -lt $headers.Count; $columnIndex++) {
        $columnLetter = [char]([int][char]'A' + $columnIndex)
        $cellAddress = "{0}4" -f $columnLetter
        $worksheet.Cells[$cellAddress].Value = $headers[$columnIndex]
        $worksheet.Cells[$cellAddress].StyleID = $headerStyleId
    }

    $row = 5
    if ($findingRows.Count -eq 0) {
        $worksheet.Cells["A$row"].Value = "No audit findings were generated."
        $worksheet.Cells["A$row"].StyleID = $bodyStyleId
    }
    else {
        foreach ($finding in $findingRows) {
            $worksheet.Cells["A$row"].Value = $finding.framework
            $worksheet.Cells["B$row"].Value = $finding.control
            $worksheet.Cells["D$row"].Value = $finding.message
            $worksheet.Cells["E$row"].Value = $finding.action
            $worksheet.Cells["F$row"].Value = $finding.overallReadiness.ToUpper()

            foreach ($cellAddress in @("A$row", "B$row", "D$row", "E$row", "F$row")) {
                $worksheet.Cells[$cellAddress].StyleID = $bodyStyleId
            }

            Set-ScorecardStatusCell -Cell $worksheet.Cells["C$row"] -Rating $finding.rating -StyleMap $StyleMap
            $worksheet.Cells["D$row:E$row"].Style.WrapText = $true
            $row++
        }
    }

    $worksheet.Column(1).Width = 22
    $worksheet.Column(2).Width = 42
    $worksheet.Column(3).Width = 14
    $worksheet.Column(4).Width = 60
    $worksheet.Column(5).Width = 60
    $worksheet.Column(6).Width = 18
    $worksheet.View.FreezePanes(5, 1)
}

function New-ValidationResult {
    param(
        [string]$Category,
        [string]$Name,
        [string]$Status,
        [string]$Detail
    )

    return [ordered]@{
        category = $Category
        name     = $Name
        status   = $Status
        detail   = $Detail
    }
}

function Get-OverallReadinessFromCounts {
    param(
        [int]$Warn,
        [int]$Fail,
        [int]$Blocker
    )

    if ($Blocker -gt 0) {
        return "blocked"
    }
    if ($Fail -gt 0) {
        return "not-ready"
    }
    if ($Warn -gt 0) {
        return "caution"
    }

    return "ready"
}

function Get-DerivedAuditSummary {
    param([object[]]$Checks)

    $passCount = @($Checks | Where-Object { $_.rating -eq "pass" }).Count
    $warnCount = @($Checks | Where-Object { $_.rating -eq "warn" }).Count
    $failCount = @($Checks | Where-Object { $_.rating -eq "fail" }).Count
    $blockerCount = @($Checks | Where-Object { $_.rating -eq "blocker" }).Count

    return [ordered]@{
        total            = @($Checks).Count
        pass             = $passCount
        warn             = $warnCount
        fail             = $failCount
        blocker          = $blockerCount
        overallReadiness = Get-OverallReadinessFromCounts -Warn $warnCount -Fail $failCount -Blocker $blockerCount
    }
}

function Test-AuditReportConsistency {
    param(
        $AuditReports,
        $CombinedSummary
    )

    $results = @()
    foreach ($frameworkId in $AuditReports.Keys) {
        $report = $AuditReports[$frameworkId]
        $derived = Get-DerivedAuditSummary -Checks @($report.checks)
        $isMatch =
            ($report.summary.total -eq $derived.total) -and
            ($report.summary.pass -eq $derived.pass) -and
            ($report.summary.warn -eq $derived.warn) -and
            ($report.summary.fail -eq $derived.fail) -and
            ($report.summary.blocker -eq $derived.blocker) -and
            ($report.overallReadiness -eq $derived.overallReadiness)

        $detail = $(if ($isMatch) {
            "Summary matches the underlying $($derived.total) audit checks."
        }
        else {
            "Expected total/pass/warn/fail/blocker/readiness = $($derived.total)/$($derived.pass)/$($derived.warn)/$($derived.fail)/$($derived.blocker)/$($derived.overallReadiness); found $($report.summary.total)/$($report.summary.pass)/$($report.summary.warn)/$($report.summary.fail)/$($report.summary.blocker)/$($report.overallReadiness)."
        })

        $validationStatus = $(if ($isMatch) { "pass" } else { "fail" })
        $results += @(New-ValidationResult -Category "Audit Summary" -Name "$($report.displayName) report summary" -Status $validationStatus -Detail $detail)
    }

    if ($CombinedSummary) {
        $combinedPass = 0
        $combinedWarn = 0
        $combinedFail = 0
        $combinedBlocker = 0
        foreach ($frameworkId in $AuditReports.Keys) {
            $combinedPass += $AuditReports[$frameworkId].summary.pass
            $combinedWarn += $AuditReports[$frameworkId].summary.warn
            $combinedFail += $AuditReports[$frameworkId].summary.fail
            $combinedBlocker += $AuditReports[$frameworkId].summary.blocker
        }

        $derivedCombinedReadiness = Get-OverallReadinessFromCounts -Warn $combinedWarn -Fail $combinedFail -Blocker $combinedBlocker
        $isCombinedMatch =
            ($CombinedSummary.pass -eq $combinedPass) -and
            ($CombinedSummary.warn -eq $combinedWarn) -and
            ($CombinedSummary.fail -eq $combinedFail) -and
            ($CombinedSummary.blocker -eq $combinedBlocker) -and
            ($CombinedSummary.overallReadiness -eq $derivedCombinedReadiness)

        $detail = $(if ($isCombinedMatch) {
            "Combined summary matches the selected framework reports."
        }
        else {
            "Expected pass/warn/fail/blocker/readiness = $combinedPass/$combinedWarn/$combinedFail/$combinedBlocker/$derivedCombinedReadiness; found $($CombinedSummary.pass)/$($CombinedSummary.warn)/$($CombinedSummary.fail)/$($CombinedSummary.blocker)/$($CombinedSummary.overallReadiness)."
        })

        $validationStatus = $(if ($isCombinedMatch) { "pass" } else { "fail" })
        $results += @(New-ValidationResult -Category "Audit Summary" -Name "Combined summary" -Status $validationStatus -Detail $detail)
    }

    return @($results)
}

function Convert-ScorecardStatusTextToRating {
    param([string]$Value)

    switch ($Value) {
        "✓  Pass" { return "pass" }
        "⚠  Warn" { return "warn" }
        "✗  Fail" { return "fail" }
        "✗  Blocker" { return "blocker" }
        default { return "na" }
    }
}

function Get-AuditFindingsWorksheetStats {
    param($Worksheet)

    $stats = [ordered]@{
        total      = 0
        frameworks = @{}
    }

    if (-not $Worksheet -or -not $Worksheet.Dimension) {
        return $stats
    }

    for ($row = 5; $row -le $Worksheet.Dimension.End.Row; $row++) {
        $framework = [string]$Worksheet.Cells["A$row"].Value
        $control = [string]$Worksheet.Cells["B$row"].Value
        if ([string]::IsNullOrWhiteSpace($framework) -or [string]::IsNullOrWhiteSpace($control)) {
            continue
        }

        $rating = Convert-ScorecardStatusTextToRating -Value ([string]$Worksheet.Cells["C$row"].Value)
        if (-not $stats.frameworks.Contains($framework)) {
            $stats.frameworks[$framework] = [ordered]@{
                total   = 0
                pass    = 0
                warn    = 0
                fail    = 0
                blocker = 0
            }
        }

        $stats.total++
        $stats.frameworks[$framework].total++
        if ($rating -ne "na") {
            $stats.frameworks[$framework][$rating]++
        }
    }

    return $stats
}

function Get-NistReferenceExpectedStats {
    param($Package)

    $referenceStats = @{}
    $referenceSheet = $Package.Workbook.Worksheets["NIST CSF 2.0 Reference"]
    if (-not $referenceSheet -or -not $referenceSheet.Dimension) {
        return $referenceStats
    }

    for ($row = 5; $row -le $referenceSheet.Dimension.End.Row; $row++) {
        $description = [string]$referenceSheet.Cells["E$row"].Value
        if ($description -match '^([A-Z]{2}\.[A-Z]{2})') {
            $referenceStats[$matches[1]] = [ordered]@{
                row  = $row
                pass = 0
                fail = 0
                na   = 0
                total = 0
            }
        }
    }

    foreach ($worksheetName in @("Identity & Access", "Defender for Office 365", "Azure Infrastructure", "Compliance & Data Governance", "M365 Workloads")) {
        $worksheet = $Package.Workbook.Worksheets[$worksheetName]
        if (-not $worksheet -or -not $worksheet.Dimension) {
            continue
        }

        for ($row = 5; $row -le $worksheet.Dimension.End.Row; $row++) {
            $category = [string]$worksheet.Cells["C$row"].Value
            $setting = [string]$worksheet.Cells["D$row"].Value
            $status = [string]$worksheet.Cells["E$row"].Value

            if ([string]::IsNullOrWhiteSpace($setting)) {
                continue
            }

            $referenceKey = Get-NistReferenceKeyForSetting -WorksheetName $worksheetName -Category $category -Setting $setting
            if (-not $referenceStats.Contains($referenceKey)) {
                continue
            }

            $referenceStats[$referenceKey].total++
            switch ($status) {
                "✓  Pass" { $referenceStats[$referenceKey].pass++ }
                "✗  Fail" { $referenceStats[$referenceKey].fail++ }
                default   { $referenceStats[$referenceKey].na++ }
            }
        }
    }

    return $referenceStats
}

function Test-WorkbookExportConsistency {
    param(
        $Package,
        $AuditReports,
        [string]$Category = "Workbook"
    )

    $results = @()

    $findingsSheet = $Package.Workbook.Worksheets["Audit Findings"]
    if (-not $findingsSheet) {
        $results += @(New-ValidationResult -Category $Category -Name "Audit Findings sheet" -Status "fail" -Detail "The exported workbook is missing the Audit Findings worksheet.")
    }
    else {
        $findingStats = Get-AuditFindingsWorksheetStats -Worksheet $findingsSheet
        $expectedTotal = 0
        foreach ($frameworkId in $AuditReports.Keys) {
            $expectedTotal += $AuditReports[$frameworkId].summary.total
        }

        $validationStatus = $(if ($findingStats.total -eq $expectedTotal) { "pass" } else { "fail" })
        $validationDetail = $(if ($findingStats.total -eq $expectedTotal) { "Audit Findings contains $expectedTotal exported finding rows." } else { "Expected $expectedTotal finding rows but found $($findingStats.total)." })
        $results += @(New-ValidationResult -Category $Category -Name "Audit Findings row count" -Status $validationStatus -Detail $validationDetail)

        foreach ($frameworkId in $AuditReports.Keys) {
            $report = $AuditReports[$frameworkId]
            $frameworkStats = $(if ($findingStats.frameworks.Contains($report.displayName)) { $findingStats.frameworks[$report.displayName] } else { [ordered]@{ total = 0; pass = 0; warn = 0; fail = 0; blocker = 0 } })
            $isMatch =
                ($frameworkStats.total -eq $report.summary.total) -and
                ($frameworkStats.pass -eq $report.summary.pass) -and
                ($frameworkStats.warn -eq $report.summary.warn) -and
                ($frameworkStats.fail -eq $report.summary.fail) -and
                ($frameworkStats.blocker -eq $report.summary.blocker)

            $detail = $(if ($isMatch) {
                "Audit Findings matches the $($report.displayName) summary counts."
            }
            else {
                "Expected total/pass/warn/fail/blocker = $($report.summary.total)/$($report.summary.pass)/$($report.summary.warn)/$($report.summary.fail)/$($report.summary.blocker); found $($frameworkStats.total)/$($frameworkStats.pass)/$($frameworkStats.warn)/$($frameworkStats.fail)/$($frameworkStats.blocker)."
            })

            $validationStatus = $(if ($isMatch) { "pass" } else { "fail" })
            $results += @(New-ValidationResult -Category $Category -Name "$($report.displayName) findings counts" -Status $validationStatus -Detail $detail)
        }
    }

    $summaryRows = [ordered]@{
        "Identity & Access"            = @{ sectionRow = 18; passFailRow = 28 }
        "Defender for Office 365"      = @{ sectionRow = 19; passFailRow = 29 }
        "Azure Infrastructure"         = @{ sectionRow = 20; passFailRow = 30 }
        "Compliance & Data Governance" = @{ sectionRow = 21; passFailRow = 31 }
        "M365 Workloads"               = @{ sectionRow = 22; passFailRow = 32 }
    }

    $worksheetCounts = [ordered]@{}
    foreach ($worksheetName in $summaryRows.Keys) {
        $worksheet = $Package.Workbook.Worksheets[$worksheetName]
        if (-not $worksheet) {
            $results += @(New-ValidationResult -Category $Category -Name "$worksheetName worksheet" -Status "fail" -Detail "The workbook is missing the '$worksheetName' worksheet.")
            continue
        }

        $counts = Get-ScorecardSheetCounts -Worksheet $worksheet
        $worksheetCounts[$worksheetName] = $counts
        $isBalanced = $counts.total -eq ($counts.pass + $counts.fail + $counts.na)
        $detail = $(if ($isBalanced) {
            "$worksheetName totals are internally consistent ($($counts.total) settings)."
        }
        else {
            "$worksheetName totals are inconsistent: total=$($counts.total), pass=$($counts.pass), fail=$($counts.fail), na=$($counts.na)."
        })
        $validationStatus = $(if ($isBalanced) { "pass" } else { "fail" })
        $results += @(New-ValidationResult -Category $Category -Name "$worksheetName status counts" -Status $validationStatus -Detail $detail)
    }

    $summarySheet = $Package.Workbook.Worksheets["Executive Summary"]
    if (-not $summarySheet) {
        $results += @(New-ValidationResult -Category $Category -Name "Executive Summary worksheet" -Status "fail" -Detail "The workbook is missing the Executive Summary worksheet.")
    }
    else {
        foreach ($worksheetName in $worksheetCounts.Keys) {
            $counts = $worksheetCounts[$worksheetName]
            $sectionRow = $summaryRows[$worksheetName].sectionRow
            $passFailRow = $summaryRows[$worksheetName].passFailRow

            $expectedTotal = [string]$counts.total
            $expectedPass = [string]$counts.pass
            $expectedFail = [string]$counts.fail
            $actualTotal = [string]$summarySheet.Cells["D$sectionRow"].Text
            $actualPass = [string]$summarySheet.Cells["E$sectionRow"].Text
            $actualPassRow = [string]$summarySheet.Cells["D$passFailRow"].Text
            $actualFail = [string]$summarySheet.Cells["E$passFailRow"].Text

            $isMatch = ($actualTotal -eq $expectedTotal) -and ($actualPass -eq $expectedPass) -and ($actualPassRow -eq $expectedPass) -and ($actualFail -eq $expectedFail)
            $detail = $(if ($isMatch) {
                "$worksheetName totals match the Executive Summary."
            }
            else {
                "Expected total/pass/fail = $expectedTotal/$expectedPass/$expectedFail; found section total/pass/fail = $actualTotal/$actualPass/$actualFail."
            })

            $validationStatus = $(if ($isMatch) { "pass" } else { "fail" })
            $results += @(New-ValidationResult -Category $Category -Name "$worksheetName summary linkage" -Status $validationStatus -Detail $detail)
        }

        $overallTotal = 0
        $overallPass = 0
        $overallFail = 0
        foreach ($worksheetName in $worksheetCounts.Keys) {
            $overallTotal += $worksheetCounts[$worksheetName].total
            $overallPass += $worksheetCounts[$worksheetName].pass
            $overallFail += $worksheetCounts[$worksheetName].fail
        }

        $applicable = $overallPass + $overallFail
        $score = $(if ($applicable -gt 0) { "{0}%" -f [math]::Round(($overallPass / $applicable) * 100) } else { "0%" })
        $isOverallMatch =
            ([string]$summarySheet.Cells["D23"].Text -eq [string]$overallTotal) -and
            ([string]$summarySheet.Cells["E23"].Text -eq [string]$overallPass) -and
            ([string]$summarySheet.Cells["E13"].Text -eq "$applicable applicable") -and
            ([string]$summarySheet.Cells["C12"].Text -eq $score)

        $detail = $(if ($isOverallMatch) {
            "Executive Summary overall totals and score are internally consistent."
        }
        else {
            "Expected total/pass/applicable/score = $overallTotal/$overallPass/$applicable applicable/$score; found $([string]$summarySheet.Cells["D23"].Text)/$([string]$summarySheet.Cells["E23"].Text)/$([string]$summarySheet.Cells["E13"].Text)/$([string]$summarySheet.Cells["C12"].Text)."
        })
        $validationStatus = $(if ($isOverallMatch) { "pass" } else { "fail" })
        $results += @(New-ValidationResult -Category $Category -Name "Executive Summary overall totals" -Status $validationStatus -Detail $detail)
    }

    $referenceSheet = $Package.Workbook.Worksheets["NIST CSF 2.0 Reference"]
    if ($referenceSheet) {
        $referenceStats = Get-NistReferenceExpectedStats -Package $Package
        $allReferenceRowsMatch = $true
        foreach ($referenceKey in $referenceStats.Keys) {
            $row = $referenceStats[$referenceKey].row
            $expectedTotal = [string]$referenceStats[$referenceKey].total
            $expectedPass = [string]$referenceStats[$referenceKey].pass
            $expectedFail = [string]$referenceStats[$referenceKey].fail
            $expectedNa = [string]$referenceStats[$referenceKey].na

            if (
                [string]$referenceSheet.Cells["F$row"].Text -ne $expectedTotal -or
                [string]$referenceSheet.Cells["G$row"].Text -ne $expectedPass -or
                [string]$referenceSheet.Cells["H$row"].Text -ne $expectedFail -or
                [string]$referenceSheet.Cells["I$row"].Text -ne $expectedNa
            ) {
                $allReferenceRowsMatch = $false
                break
            }
        }

        $detail = $(if ($allReferenceRowsMatch) {
            "NIST CSF reference totals match the mapped scorecard rows."
        }
        else {
            "The NIST CSF reference totals do not match the mapped scorecard rows."
        })
        $validationStatus = $(if ($allReferenceRowsMatch) { "pass" } else { "fail" })
        $results += @(New-ValidationResult -Category $Category -Name "NIST CSF reference totals" -Status $validationStatus -Detail $detail)
    }

    return @($results)
}

function Update-SelfValidationWorksheet {
    param(
        $Package,
        [string]$SelectedAuditFramework,
        $ValidationResults,
        $StyleMap
    )

    $worksheetName = "Self Validation"
    if ($Package.Workbook.Worksheets[$worksheetName]) {
        $Package.Workbook.Worksheets.Delete($worksheetName)
    }

    $worksheet = $Package.Workbook.Worksheets.Add($worksheetName)
    $referenceSheet = $Package.Workbook.Worksheets["Identity & Access"]
    $headerStyleId = $referenceSheet.Cells["C4"].StyleID
    $bodyStyleId = $referenceSheet.Cells["C5"].StyleID
    $titleStyleId = $referenceSheet.Cells["A1"].StyleID
    $auditLabel = Get-AuditFrameworkDisplayName -FrameworkId $SelectedAuditFramework
    $passCount = @($ValidationResults | Where-Object { $_.status -eq "pass" }).Count
    $warnCount = @($ValidationResults | Where-Object { $_.status -eq "warn" }).Count
    $failCount = @($ValidationResults | Where-Object { $_.status -eq "fail" }).Count

    $worksheet.Cells["A1:D1"].Merge = $true
    $worksheet.Cells["A1"].Value = "OMZIG Self Validation"
    $worksheet.Cells["A1"].StyleID = $titleStyleId
    $worksheet.Cells["A2"].Value = "Framework selection:"
    $worksheet.Cells["B2"].Value = $auditLabel
    $worksheet.Cells["C2"].Value = "Validation:"
    $worksheet.Cells["D2"].Value = "$passCount pass / $warnCount warn / $failCount fail"
    foreach ($cell in @("A2", "B2", "C2", "D2")) {
        $worksheet.Cells[$cell].StyleID = $bodyStyleId
    }

    $headers = @("Category", "Check", "Result", "Details")
    for ($columnIndex = 0; $columnIndex -lt $headers.Count; $columnIndex++) {
        $columnLetter = [char]([int][char]'A' + $columnIndex)
        $cellAddress = "{0}4" -f $columnLetter
        $worksheet.Cells[$cellAddress].Value = $headers[$columnIndex]
        $worksheet.Cells[$cellAddress].StyleID = $headerStyleId
    }

    $row = 5
    foreach ($validation in @($ValidationResults)) {
        $worksheet.Cells["A$row"].Value = $validation.category
        $worksheet.Cells["B$row"].Value = $validation.name
        $worksheet.Cells["D$row"].Value = $validation.detail
        foreach ($cellAddress in @("A$row", "B$row", "D$row")) {
            $worksheet.Cells[$cellAddress].StyleID = $bodyStyleId
        }
        Set-ScorecardStatusCell -Cell $worksheet.Cells["C$row"] -Rating $validation.status -StyleMap $StyleMap
        $worksheet.Cells["D$row"].Style.WrapText = $true
        $row++
    }

    $worksheet.Column(1).Width = 20
    $worksheet.Column(2).Width = 40
    $worksheet.Column(3).Width = 14
    $worksheet.Column(4).Width = 85
    $worksheet.View.FreezePanes(5, 1)
}

function Write-SelfValidationSummary {
    param($ValidationResults)

    $passCount = @($ValidationResults | Where-Object { $_.status -eq "pass" }).Count
    $warnCount = @($ValidationResults | Where-Object { $_.status -eq "warn" }).Count
    $failCount = @($ValidationResults | Where-Object { $_.status -eq "fail" }).Count

    Write-Banner "Self Validation"
    if ($failCount -eq 0) {
        Write-Host "  [PASS] Confirmed $passCount validation checks." -ForegroundColor Green
        if ($warnCount -gt 0) {
            Write-Host "         $warnCount validation checks reported warnings." -ForegroundColor Yellow
        }
    }
    else {
        Write-Host "  [FAIL] $failCount validation checks did not match the generated statistics." -ForegroundColor Red
    }

    foreach ($validation in @($ValidationResults | Where-Object { $_.status -ne "pass" })) {
        Write-Host "  [$($validation.status.ToUpper())] $($validation.name): $($validation.detail)" -ForegroundColor $(if ($validation.status -eq "fail") { "Red" } else { "Yellow" })
    }
}

function Get-ScorecardSheetCounts {
    param($Worksheet)

    $counts = [ordered]@{
        total = 0
        pass  = 0
        fail  = 0
        na    = 0
    }

    if (-not $Worksheet -or -not $Worksheet.Dimension) {
        return $counts
    }

    for ($row = 5; $row -le $Worksheet.Dimension.End.Row; $row++) {
        $settingText = [string]$Worksheet.Cells["D$row"].Value
        if ([string]::IsNullOrWhiteSpace($settingText)) {
            continue
        }

        $counts.total++
        switch ([string]$Worksheet.Cells["E$row"].Value) {
            "✓  Pass" { $counts.pass++ }
            "✗  Fail" { $counts.fail++ }
            default   { $counts.na++ }
        }
    }

    return $counts
}

function Get-ScorecardRiskSummary {
    param([int]$Score)

    if ($Score -ge 85) {
        return [ordered]@{
            label  = "Low Risk"
            banner = "🟢  LOW RISK  —  Overall Score 85% or Higher"
        }
    }
    elseif ($Score -ge 70) {
        return [ordered]@{
            label  = "Moderate Risk"
            banner = "🟡  MODERATE RISK  —  Overall Score Between 70% and 84%"
        }
    }
    elseif ($Score -ge 50) {
        return [ordered]@{
            label  = "Elevated Risk"
            banner = "🟠  ELEVATED RISK  —  Overall Score Between 50% and 69%"
        }
    }

    return [ordered]@{
        label  = "Critical Risk"
        banner = "🔴  CRITICAL RISK  —  Overall Score Below 50%"
    }
}

function Get-NistReferenceKeyForSetting {
    param(
        [string]$WorksheetName,
        [string]$Category,
        [string]$Setting
    )

    switch ($WorksheetName) {
        "Identity & Access" {
            switch ($Category) {
                "MFA"                { return "PR.AA" }
                "Legacy Auth"        { return "PR.AA" }
                "Admin Accounts"     {
                    if ($Setting -match 'Global Admin|PIM|JIT|Dedicated') {
                        return "GV.RR"
                    }
                    return "PR.AA"
                }
                "Passwords"          { return "PR.AA" }
                "Conditional Access" { return "PR.AA" }
                "Guest Access"       { return "PR.AA" }
                "Branding"           { return "GV.PO" }
                default              { return "PR.AA" }
            }
        }
        "Defender for Office 365" {
            switch ($Category) {
                "Licensing"      { return "ID.AM" }
                "Safe Attachments" { return "PR.PS" }
                "Safe Links"       { return "PR.PS" }
                "Anti-Phishing"    { return "PR.PS" }
                "Anti-Spam"        { return "PR.PS" }
                "Anti-Malware"     { return "PR.PS" }
                "Email Auth"       { return "PR.PS" }
                "Presets"          { return "PR.PS" }
                "Defender XDR"     {
                    if ($Setting -match 'Attack simulation') {
                        return "PR.AT"
                    }
                    return "DE.CM"
                }
                "Endpoints"        { return "PR.PS" }
                "External Tag"     { return "PR.AT" }
                default            { return "PR.PS" }
            }
        }
        "Azure Infrastructure" {
            switch ($Category) {
                "CSPM"       { return "ID.RA" }
                "IAM"        { return "PR.AA" }
                "Networking" { return "PR.IR" }
                "Storage"    { return "PR.DS" }
                "Key Vault"  { return "PR.DS" }
                "Logging"    { return "DE.CM" }
                "VMs"        { return "PR.PS" }
                default      { return "PR.IR" }
            }
        }
        "Compliance & Data Governance" {
            switch ($Category) {
                "Purview"         { return "GV.OV" }
                "DLP"             { return "PR.DS" }
                "Sensitivity"     { return "PR.DS" }
                "Retention"       { return "PR.DS" }
                "Audit"           { return "DE.CM" }
                "Comm Compliance" { return "RS.AN" }
                "eDiscovery"      { return "RS.AN" }
                "Governance"      { return "GV.PO" }
                default           { return "PR.DS" }
            }
        }
        "M365 Workloads" {
            switch ($Category) {
                "SharePoint" {
                    if ($Setting -match 'classification|sensitivity') { return "PR.DS" }
                    if ($Setting -match 'sharing|permissions|access') { return "PR.AA" }
                    return "PR.PS"
                }
                "Teams" {
                    if ($Setting -match 'guest|access|meeting|permission') { return "PR.AA" }
                    return "PR.PS"
                }
                "Exchange" {
                    if ($Setting -match 'audit') { return "DE.CM" }
                    if ($Setting -match 'authentication|forward|connector|spam|transport') { return "PR.PS" }
                    return "PR.AA"
                }
                "OneDrive" {
                    if ($Setting -match 'sharing') { return "PR.AA" }
                    return "PR.PS"
                }
                default { return "PR.PS" }
            }
        }
        default { return "PR.IR" }
    }
}

function Update-CisaReferenceWorksheet {
    param(
        $Package,
        $AuditReports,
        $StyleMap
    )

    $worksheetName = "CISA SCuBA Reference"

    # Remove and recreate to keep it fresh
    if ($Package.Workbook.Worksheets[$worksheetName]) {
        $Package.Workbook.Worksheets.Delete($worksheetName)
    }

    $worksheet = $Package.Workbook.Worksheets.Add($worksheetName)

    # Clone styles from Identity & Access sheet
    $referenceSheet = $Package.Workbook.Worksheets["Identity & Access"]
    if (-not $referenceSheet) { return }
    $titleStyleId = $referenceSheet.Cells["A1"].StyleID
    $headerStyleId = $referenceSheet.Cells["C4"].StyleID
    $bodyStyleId = $referenceSheet.Cells["C5"].StyleID

    # Title
    $worksheet.Cells["A1:F1"].Merge = $true
    $worksheet.Cells["A1"].Value = "CISA SCuBA M365 Security Configuration Baseline"
    $worksheet.Cells["A1"].StyleID = $titleStyleId
    $worksheet.Cells["A2"].Value = "Exported:"
    $worksheet.Cells["B2"].Value = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $worksheet.Cells["A2"].StyleID = $bodyStyleId
    $worksheet.Cells["B2"].StyleID = $bodyStyleId

    # SCuBA control family descriptions
    $controlFamilies = [ordered]@{
        "MS.AAD"       = "Azure Active Directory / Entra ID"
        "MS.EXO"       = "Exchange Online Protection"
        "MS.DEFENDER"  = "Microsoft Defender for Office 365"
        "MS.INTUNE"    = "Microsoft Intune / Endpoint Manager"
        "MS.SHAREPOINT"= "SharePoint Online"
        "MS.TEAMS"     = "Microsoft Teams"
        "MS.POWERBI"   = "Power BI / Power Platform"
    }

    # Headers
    $headers = @("Control Family", "Description", "Checks", "Pass", "Warn", "Fail")
    for ($col = 0; $col -lt $headers.Count; $col++) {
        $letter = [char]([int][char]'A' + $col)
        $cellAddr = "{0}4" -f $letter
        $worksheet.Cells[$cellAddr].Value = $headers[$col]
        $worksheet.Cells[$cellAddr].StyleID = $headerStyleId
    }

    # Collect CISA checks from filtered reports
    $cisaChecks = @()
    if ($AuditReports.Contains("CISA")) {
        $cisaChecks = @($AuditReports["CISA"].checks)
    }

    $row = 5
    foreach ($family in $controlFamilies.Keys) {
        $description = $controlFamilies[$family]

        # Match checks whose name contains this control family prefix
        $matched = @($cisaChecks | Where-Object { [string]$_.name -match "\[$([regex]::Escape($family))" })
        $passCount = @($matched | Where-Object { $_.rating -eq "pass" }).Count
        $warnCount = @($matched | Where-Object { $_.rating -eq "warn" }).Count
        $failCount = @($matched | Where-Object { $_.rating -eq "fail" -or $_.rating -eq "blocker" }).Count

        $worksheet.Cells["A$row"].Value = $family
        $worksheet.Cells["A$row"].StyleID = $bodyStyleId
        $worksheet.Cells["B$row"].Value = $description
        $worksheet.Cells["B$row"].StyleID = $bodyStyleId
        $worksheet.Cells["C$row"].Value = $matched.Count
        $worksheet.Cells["C$row"].StyleID = $bodyStyleId
        $worksheet.Cells["D$row"].Value = $passCount
        $worksheet.Cells["D$row"].StyleID = $bodyStyleId
        $worksheet.Cells["E$row"].Value = $warnCount
        $worksheet.Cells["E$row"].StyleID = $bodyStyleId
        $worksheet.Cells["F$row"].Value = $failCount
        $worksheet.Cells["F$row"].StyleID = $bodyStyleId

        $row++
    }

    # Readiness checks (SCuBA Readiness items without a specific MS.* prefix)
    $readinessChecks = @($cisaChecks | Where-Object { [string]$_.name -match "\[SCuBA Readiness\]" })
    if ($readinessChecks.Count -gt 0) {
        $passCount = @($readinessChecks | Where-Object { $_.rating -eq "pass" }).Count
        $warnCount = @($readinessChecks | Where-Object { $_.rating -eq "warn" }).Count
        $failCount = @($readinessChecks | Where-Object { $_.rating -eq "fail" -or $_.rating -eq "blocker" }).Count

        $worksheet.Cells["A$row"].Value = "Readiness"
        $worksheet.Cells["A$row"].StyleID = $bodyStyleId
        $worksheet.Cells["B$row"].Value = "Tenant Readiness Prerequisites"
        $worksheet.Cells["B$row"].StyleID = $bodyStyleId
        $worksheet.Cells["C$row"].Value = $readinessChecks.Count
        $worksheet.Cells["C$row"].StyleID = $bodyStyleId
        $worksheet.Cells["D$row"].Value = $passCount
        $worksheet.Cells["D$row"].StyleID = $bodyStyleId
        $worksheet.Cells["E$row"].Value = $warnCount
        $worksheet.Cells["E$row"].StyleID = $bodyStyleId
        $worksheet.Cells["F$row"].Value = $failCount
        $worksheet.Cells["F$row"].StyleID = $bodyStyleId
        $row++
    }

    # General checks (Organization Info, Security Defaults — no [SCuBA MS.*] prefix)
    $generalChecks = @($cisaChecks | Where-Object {
        $name = [string]$_.name
        $name -notmatch "\[SCuBA" -and $name -notmatch "\[NIST"
    })
    if ($generalChecks.Count -gt 0) {
        $passCount = @($generalChecks | Where-Object { $_.rating -eq "pass" }).Count
        $warnCount = @($generalChecks | Where-Object { $_.rating -eq "warn" }).Count
        $failCount = @($generalChecks | Where-Object { $_.rating -eq "fail" -or $_.rating -eq "blocker" }).Count

        $worksheet.Cells["A$row"].Value = "General"
        $worksheet.Cells["A$row"].StyleID = $bodyStyleId
        $worksheet.Cells["B$row"].Value = "General Tenant Configuration"
        $worksheet.Cells["B$row"].StyleID = $bodyStyleId
        $worksheet.Cells["C$row"].Value = $generalChecks.Count
        $worksheet.Cells["C$row"].StyleID = $bodyStyleId
        $worksheet.Cells["D$row"].Value = $passCount
        $worksheet.Cells["D$row"].StyleID = $bodyStyleId
        $worksheet.Cells["E$row"].Value = $warnCount
        $worksheet.Cells["E$row"].StyleID = $bodyStyleId
        $worksheet.Cells["F$row"].Value = $failCount
        $worksheet.Cells["F$row"].StyleID = $bodyStyleId
        $row++
    }

    # Summary row
    $row++
    $totalChecks = $cisaChecks.Count
    $totalPass = @($cisaChecks | Where-Object { $_.rating -eq "pass" }).Count
    $totalWarn = @($cisaChecks | Where-Object { $_.rating -eq "warn" }).Count
    $totalFail = @($cisaChecks | Where-Object { $_.rating -eq "fail" -or $_.rating -eq "blocker" }).Count

    $worksheet.Cells["A$row"].Value = "TOTAL"
    $worksheet.Cells["A$row"].StyleID = $headerStyleId
    $worksheet.Cells["B$row"].Value = ""
    $worksheet.Cells["B$row"].StyleID = $headerStyleId
    $worksheet.Cells["C$row"].Value = $totalChecks
    $worksheet.Cells["C$row"].StyleID = $headerStyleId
    $worksheet.Cells["D$row"].Value = $totalPass
    $worksheet.Cells["D$row"].StyleID = $headerStyleId
    $worksheet.Cells["E$row"].Value = $totalWarn
    $worksheet.Cells["E$row"].StyleID = $headerStyleId
    $worksheet.Cells["F$row"].Value = $totalFail
    $worksheet.Cells["F$row"].StyleID = $headerStyleId

    # Column widths
    $worksheet.Column(1).Width = 18
    $worksheet.Column(2).Width = 42
    $worksheet.Column(3).Width = 12
    $worksheet.Column(4).Width = 10
    $worksheet.Column(5).Width = 10
    $worksheet.Column(6).Width = 10
    $worksheet.View.FreezePanes(5, 1)
}

function Update-NistReferenceWorksheet {
    param($Package)

    $referenceSheet = $Package.Workbook.Worksheets["NIST CSF 2.0 Reference"]
    if (-not $referenceSheet) {
        return
    }

    $headerStyleId = $referenceSheet.Cells["E4"].StyleID
    $dataStyleId = $referenceSheet.Cells["E5"].StyleID

    $referenceHeaders = @(
        @{ Cell = "F4"; Value = "Mapped Settings" }
        @{ Cell = "G4"; Value = "Pass" }
        @{ Cell = "H4"; Value = "Fail" }
        @{ Cell = "I4"; Value = "N/A" }
        @{ Cell = "J4"; Value = "Pass Rate" }
    )

    foreach ($header in $referenceHeaders) {
        $referenceSheet.Cells[$header.Cell].Value = $header.Value
        $referenceSheet.Cells[$header.Cell].StyleID = $headerStyleId
    }

    $referenceStats = @{}
    for ($row = 5; $row -le $referenceSheet.Dimension.End.Row; $row++) {
        $description = [string]$referenceSheet.Cells["E$row"].Value
        if ($description -match '^([A-Z]{2}\.[A-Z]{2})') {
            $referenceStats[$matches[1]] = [ordered]@{
                row  = $row
                pass = 0
                fail = 0
                na   = 0
                total = 0
            }
        }
    }

    foreach ($worksheetName in @("Identity & Access", "Defender for Office 365", "Azure Infrastructure", "Compliance & Data Governance", "M365 Workloads")) {
        $worksheet = $Package.Workbook.Worksheets[$worksheetName]
        if (-not $worksheet -or -not $worksheet.Dimension) {
            continue
        }

        for ($row = 5; $row -le $worksheet.Dimension.End.Row; $row++) {
            $category = [string]$worksheet.Cells["C$row"].Value
            $setting = [string]$worksheet.Cells["D$row"].Value
            $status = [string]$worksheet.Cells["E$row"].Value

            if ([string]::IsNullOrWhiteSpace($setting)) {
                continue
            }

            $referenceKey = Get-NistReferenceKeyForSetting -WorksheetName $worksheetName -Category $category -Setting $setting
            if (-not $referenceStats.Contains($referenceKey)) {
                continue
            }

            $referenceStats[$referenceKey].total++
            switch ($status) {
                "✓  Pass" { $referenceStats[$referenceKey].pass++ }
                "✗  Fail" { $referenceStats[$referenceKey].fail++ }
                default   { $referenceStats[$referenceKey].na++ }
            }
        }
    }

    foreach ($referenceKey in $referenceStats.Keys) {
        $row = $referenceStats[$referenceKey].row
        $pass = $referenceStats[$referenceKey].pass
        $fail = $referenceStats[$referenceKey].fail
        $na = $referenceStats[$referenceKey].na
        $total = $referenceStats[$referenceKey].total
        $assessed = $pass + $fail
        $passRate = $(if ($assessed -gt 0) { "{0}%" -f [math]::Round(($pass / $assessed) * 100) } else { "—" })

        foreach ($cell in @("F$row", "G$row", "H$row", "I$row", "J$row")) {
            $referenceSheet.Cells[$cell].StyleID = $dataStyleId
        }

        $referenceSheet.Cells["F$row"].Value = $total
        $referenceSheet.Cells["G$row"].Value = $pass
        $referenceSheet.Cells["H$row"].Value = $fail
        $referenceSheet.Cells["I$row"].Value = $na
        $referenceSheet.Cells["J$row"].Value = $passRate
    }
}

function Update-ExecutiveSummaryWorksheet {
    param(
        $Package,
        [string]$TenantDisplayName,
        [string]$TenantPrimaryDomain,
        $WorksheetCounts,
        [string]$SelectedAuditFramework
    )

    $summarySheet = $Package.Workbook.Worksheets["Executive Summary"]
    if (-not $summarySheet) {
        return
    }

    $summaryRows = [ordered]@{
        "Identity & Access"            = @{ sectionRow = 18; passFailRow = 28 }
        "Defender for Office 365"      = @{ sectionRow = 19; passFailRow = 29 }
        "Azure Infrastructure"         = @{ sectionRow = 20; passFailRow = 30 }
        "Compliance & Data Governance" = @{ sectionRow = 21; passFailRow = 31 }
        "M365 Workloads"               = @{ sectionRow = 22; passFailRow = 32 }
    }

    $overallTotal = 0
    $overallPass = 0
    $overallFail = 0
    $overallNa = 0

    foreach ($worksheetName in $summaryRows.Keys) {
        $counts = $WorksheetCounts[$worksheetName]
        if (-not $counts) {
            continue
        }

        $sectionRow = $summaryRows[$worksheetName].sectionRow
        $passFailRow = $summaryRows[$worksheetName].passFailRow
        $tabApplicable = $counts.pass + $counts.fail
        $tabScore = $(if ($tabApplicable -gt 0) { $counts.pass / $tabApplicable } else { 0 })

        # Scores by Area table (rows 18-22): Total, Active, Not Yet On, N/A, Score
        $summarySheet.Cells["D$sectionRow"].Value = $counts.total
        $summarySheet.Cells["E$sectionRow"].Value = $counts.pass
        $summarySheet.Cells["F$sectionRow"].Value = $counts.fail
        $summarySheet.Cells["G$sectionRow"].Value = $counts.na
        $summarySheet.Cells["H$sectionRow"].Value = $tabScore

        # Pass Rate by Area table (rows 28-32): Pass, Fail, bar, Score
        $summarySheet.Cells["D$passFailRow"].Value = $counts.pass
        $summarySheet.Cells["E$passFailRow"].Value = $counts.fail
        $scoreLabel = $(if ($tabApplicable -gt 0) { [math]::Round($tabScore * 100).ToString() + "%" } else { "N/A" })
        $summarySheet.Cells["H$passFailRow"].Value = $scoreLabel
        # Bar chart column (F) — generate fresh visual bar from score
        if ($tabApplicable -gt 0) {
            $barBlocks = [math]::Max(1, [math]::Round($tabScore * 10))
            $barChar = [string][char]0x2588  # Full Block character
            $summarySheet.Cells["F$passFailRow"].Value = ($barChar * $barBlocks)
        }
        else {
            $summarySheet.Cells["F$passFailRow"].Value = "N/A"
        }

        $overallTotal += $counts.total
        $overallPass += $counts.pass
        $overallFail += $counts.fail
        $overallNa += $counts.na
    }

    $applicable = $overallPass + $overallFail
    $score = $(if ($applicable -gt 0) { [math]::Round(($overallPass / $applicable) * 100) } else { 0 })
    $passPercent = $(if ($overallTotal -gt 0) { [math]::Round(($overallPass / $overallTotal) * 100) } else { 0 })
    $failPercent = $(if ($overallTotal -gt 0) { [math]::Round(($overallFail / $overallTotal) * 100) } else { 0 })
    $naPercent = $(if ($overallTotal -gt 0) { [math]::Round(($overallNa / $overallTotal) * 100) } else { 0 })
    $riskSummary = Get-ScorecardRiskSummary -Score $score

    $summarySheet.Cells["D7"].Value = $(if ($TenantDisplayName) { $TenantDisplayName } else { "Unknown Tenant" })
    $summarySheet.Cells["G7"].Value = ""  # Clear pre-baked assessor name
    $summarySheet.Cells["D8"].Value = $(if ($TenantPrimaryDomain) { $TenantPrimaryDomain } else { "Unknown Domain" })
    $summarySheet.Cells["D9"].Value = (Get-Date).ToString("MMMM d, yyyy")

    $frameworkLabel = switch ($SelectedAuditFramework) {
        "CISA" { "CISA SCuBA M365 Security Baseline" }
        "NIST" { "NIST SP 800-207 Zero Trust Architecture" }
        "Both" { "CISA SCuBA + NIST ZTA (Combined)" }
        default { $SelectedAuditFramework }
    }
    $summarySheet.Cells["C10"].Value = "Audit Framework:"
    $summarySheet.Cells["D10"].Value = $frameworkLabel

    # Overall score box
    $summarySheet.Cells["C12"].Value = "$score%"
    $summarySheet.Cells["C13"].Value = $riskSummary.label

    # Settings reviewed box
    $summarySheet.Cells["E12"].Value = $overallTotal
    $summarySheet.Cells["E13"].Value = "$applicable applicable"

    # Passing box
    $summarySheet.Cells["G12"].Value = "$overallPass of $applicable"
    $gapCount = $applicable - $overallPass
    $summarySheet.Cells["G13"].Value = "$gapCount gaps to close"

    # Overall row (row 23)
    $summarySheet.Cells["D23"].Value = $overallTotal
    $summarySheet.Cells["E23"].Value = $overallPass
    $summarySheet.Cells["F23"].Value = $overallFail
    $summarySheet.Cells["G23"].Value = $overallNa
    $overallScoreFraction = $(if ($applicable -gt 0) { $overallPass / $applicable } else { 0 })
    $summarySheet.Cells["H23"].Value = $overallScoreFraction

    # Status distribution (row 35)
    $summarySheet.Cells["C35"].Value = "  ✓  $overallPass Active ($passPercent%)"
    $summarySheet.Cells["E35"].Value = "  ✗  $overallFail Not Yet On ($failPercent%)"
    $summarySheet.Cells["H35"].Value = "  —  $overallNa N/A ($naPercent%)"

    # Risk banner
    $summarySheet.Cells["C37"].Value = $riskSummary.banner
}

function Test-FilePathLocked {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        return $false
    }

    $fileStream = $null
    try {
        $fileStream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
        return $false
    }
    catch {
        return $true
    }
    finally {
        if ($fileStream) {
            $fileStream.Dispose()
        }
    }
}

function Get-AvailableExportPath {
    param([string]$RequestedPath)

    if (-not (Test-FilePathLocked -Path $RequestedPath)) {
        return $RequestedPath
    }

    $directory = Split-Path -Path $RequestedPath -Parent
    $fileName = [System.IO.Path]::GetFileNameWithoutExtension($RequestedPath)
    $extension = [System.IO.Path]::GetExtension($RequestedPath)
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

    for ($attempt = 0; $attempt -lt 100; $attempt++) {
        $suffix = $(if ($attempt -eq 0) { $timestamp } else { "$timestamp-$attempt" })
        $candidateName = "{0}_{1}{2}" -f $fileName, $suffix, $extension
        $candidatePath = $(if ([string]::IsNullOrWhiteSpace($directory)) { $candidateName } else { Join-Path -Path $directory -ChildPath $candidateName })

        if (-not (Test-Path $candidatePath) -or -not (Test-FilePathLocked -Path $candidatePath)) {
            return $candidatePath
        }
    }

    throw "Could not determine an available Excel export path for '$RequestedPath'."
}

function Export-AuditScorecard {
    param(
        [string]$TemplatePath,
        [string]$ExportPath,
        [string]$SelectedAuditFramework,
        $TenantFacts,
        $AuditReports,
        $CombinedSummary
    )

    Write-Banner "Exporting Audit Scorecard to Excel"
    Write-Host "  Template found: $TemplatePath" -ForegroundColor DarkGray

    if (-not (Get-Module -ListAvailable -Name ImportExcel)) {
        Write-Host "  Installing ImportExcel module from PSGallery..." -ForegroundColor Yellow
        Install-Module -Name ImportExcel -Scope CurrentUser -Force -AllowClobber -ErrorAction Stop
    }
    Import-Module ImportExcel

    $resolvedExportPath = Get-AvailableExportPath -RequestedPath $ExportPath
    if ($resolvedExportPath -ne $ExportPath) {
        Write-Host "  Requested export path is in use. Saving to $resolvedExportPath instead..." -ForegroundColor Yellow
    }

    Write-Host "  Copying template to $resolvedExportPath..." -ForegroundColor DarkGray
    Copy-Item -Path $TemplatePath -Destination $resolvedExportPath -Force

    Write-Host "  Substituting workbook rows with audit findings..." -ForegroundColor DarkGray

    $package = $null
    try {
        $package = Open-ExcelPackage -Path $resolvedExportPath
        $styleMap = Get-ScorecardStyleMap -Workbook $package.Workbook
        $reportValidationResults = @(Test-AuditReportConsistency -AuditReports $AuditReports -CombinedSummary $CombinedSummary)

        if ($package.Workbook.Worksheets["Framework Audits"]) {
            $package.Workbook.Worksheets.Delete("Framework Audits")
        }

        # Filter audit reports to only the selected framework so scorecard cells
        # reflect framework-specific findings instead of a merged superset.
        $filteredReports = @{}
        if ($SelectedAuditFramework -eq "Both") {
            foreach ($k in $AuditReports.Keys) { $filteredReports[$k] = $AuditReports[$k] }
        }
        else {
            if ($AuditReports.Contains($SelectedAuditFramework)) {
                $filteredReports[$SelectedAuditFramework] = $AuditReports[$SelectedAuditFramework]
            }
        }

        # Build per-tab check lists from filtered audit reports
        $tabNames = @("Identity & Access", "Defender for Office 365", "Azure Infrastructure",
                       "Compliance & Data Governance", "M365 Workloads")
        $tabChecks = @{}
        foreach ($tabName in $tabNames) {
            $tabChecks[$tabName] = @()
        }

        foreach ($frameworkId in $filteredReports.Keys) {
            $report = $filteredReports[$frameworkId]
            foreach ($check in @($report.checks)) {
                $tabName = Get-AuditCheckTabCategory -CheckName $check.name
                if ($tabName -and $tabChecks.Contains($tabName)) {
                    $tabChecks[$tabName] += @([ordered]@{
                        name      = [string]$check.name
                        rating    = [string]$check.rating
                        message   = [string]$check.message
                        action    = [string]$check.action
                        framework = $report.displayName
                    })
                }
            }
        }

        # Clear template data rows and write framework-specific audit checks
        $worksheetCounts = [ordered]@{}
        foreach ($tabName in $tabNames) {
            $worksheet = $package.Workbook.Worksheets[$tabName]
            if (-not $worksheet) { continue }

            Clear-WorksheetDataRows -Worksheet $worksheet
            Write-AuditCheckRows -Worksheet $worksheet -Checks $tabChecks[$tabName] -StyleMap $styleMap
            $worksheetCounts[$tabName] = Get-ScorecardSheetCounts -Worksheet $worksheet

            # Overwrite Row 2 summary text (pre-baked in template) with fresh counts
            $tc = $worksheetCounts[$tabName]
            if ($tc) {
                $worksheet.Cells["H2"].Value = "$([char]0x2713) $($tc.pass) Pass    $([char]0x2717) $($tc.fail) Fail    $([char]0x2014) $($tc.na) N/A"
            }
        }

        Update-AuditFindingsWorksheet -Package $package -SelectedAuditFramework $SelectedAuditFramework -AuditReports $filteredReports -StyleMap $styleMap

        if ($SelectedAuditFramework -eq "NIST" -or $SelectedAuditFramework -eq "Both") {
            Update-NistReferenceWorksheet -Package $package
        }
        else {
            # Remove the NIST CSF 2.0 Reference tab inherited from the template
            if ($package.Workbook.Worksheets["NIST CSF 2.0 Reference"]) {
                $package.Workbook.Worksheets.Delete("NIST CSF 2.0 Reference")
            }
        }
        if ($SelectedAuditFramework -eq "CISA" -or $SelectedAuditFramework -eq "Both") {
            Update-CisaReferenceWorksheet -Package $package -AuditReports $filteredReports -StyleMap $styleMap
        }

        Update-ExecutiveSummaryWorksheet -Package $package -TenantDisplayName $TenantFacts.organization.displayName -TenantPrimaryDomain $TenantFacts.organization.primaryDomain -WorksheetCounts $worksheetCounts -SelectedAuditFramework $SelectedAuditFramework
        $workbookValidationResults = @(Test-WorkbookExportConsistency -Package $package -AuditReports $filteredReports -Category "Workbook Build")
        Update-SelfValidationWorksheet -Package $package -SelectedAuditFramework $SelectedAuditFramework -ValidationResults @($reportValidationResults + $workbookValidationResults) -StyleMap $styleMap

        Close-ExcelPackage $package
        $package = $null

        $confirmationPackage = $null
        $confirmationResults = @()
        try {
            $confirmationPackage = Open-ExcelPackage -Path $resolvedExportPath
            $confirmationResults = @(Test-WorkbookExportConsistency -Package $confirmationPackage -AuditReports $filteredReports -Category "Export Confirmation")
        }
        finally {
            if ($confirmationPackage) {
                Close-ExcelPackage $confirmationPackage
            }
        }

        $allValidationResults = @($reportValidationResults + $workbookValidationResults + $confirmationResults)
        $failedValidations = @($allValidationResults | Where-Object { $_.status -eq "fail" })
        Write-SelfValidationSummary -ValidationResults $allValidationResults

        if ($failedValidations.Count -gt 0) {
            throw "Self-validation failed for $($failedValidations.Count) generated statistic(s). Review the Self Validation worksheet for details."
        }

        $passCount = @($allValidationResults | Where-Object { $_.status -eq "pass" }).Count
        $warnCount = @($allValidationResults | Where-Object { $_.status -eq "warn" }).Count

        Write-Host "  [PASS] Scorecard updated successfully!" -ForegroundColor Green
        Write-Host "         Exported to: $resolvedExportPath" -ForegroundColor White
        return [pscustomobject]@{
            path       = $resolvedExportPath
            validation = [pscustomobject]@{
                confirmed = $true
                total     = $allValidationResults.Count
                pass      = $passCount
                warn      = $warnCount
                fail      = 0
            }
        }
    }
    catch {
        if ($package) {
            Close-ExcelPackage $package
        }
        throw
    }
}

# =========================================================================
# PREREQUISITES CHECK
# =========================================================================

Write-Banner "Omzig M365 Zero Trust - Tenant Setup & Framework Audit"

# Verify Azure CLI is installed
$azCmd = Get-Command az -ErrorAction SilentlyContinue
if (-not $azCmd) {
    Write-Host "ERROR: Azure CLI (az) is not installed or not in PATH." -ForegroundColor Red
    Write-Host "  Install from: https://aka.ms/installazurecliwindows" -ForegroundColor Yellow
    Write-Host "  Then restart your terminal and re-run this script." -ForegroundColor Yellow
    exit 1
}

# Verify PowerShell version
if ($PSVersionTable.PSVersion.Major -lt 5) {
    Write-Host "ERROR: PowerShell 5.1 or later is required. Current version: $($PSVersionTable.PSVersion)" -ForegroundColor Red
    exit 1
}

# =========================================================================
# STEP 1: SIGN IN
# =========================================================================

Write-Host "Signing in to Azure..." -ForegroundColor White
Write-Host "A browser window will open. Sign in as a Global Administrator." -ForegroundColor Yellow
Write-Host ""

az login --allow-no-subscriptions --output none
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Sign-in failed. You must sign in as a Global Administrator." -ForegroundColor Red
    exit 1
}

$accountJson = az account show --output json
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Could not retrieve account info." -ForegroundColor Red
    exit 1
}
$account = $accountJson | ConvertFrom-Json
$tenantId = $account.tenantId
$userName = $account.user.name
$currentSubscriptionId = $(if ($account.name -ne "N/A(tenant level account)" -and $account.id -ne $tenantId) { $account.id } else { $null })
$subscriptionContext = $null

Write-Host "  Tenant: $tenantId" -ForegroundColor White
Write-Host "  User:   $userName" -ForegroundColor White
Write-Host ""

$confirm = Read-Host "Continue with this tenant? (y/n)"
if ($confirm -notmatch '^(y|yes)$') {
    Write-Host "Cancelled." -ForegroundColor Yellow
    exit 0
}

try {
    $subscriptionContext = Select-AzSubscriptionContext -TenantId $tenantId -CurrentSubscriptionId $currentSubscriptionId
}
catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

if ($subscriptionContext) {
    Write-Host ""
    Write-Host "  Azure subscription: $($subscriptionContext.name)" -ForegroundColor White
    Write-Host "  Subscription ID:    $($subscriptionContext.id)" -ForegroundColor White
}
else {
    Write-Host ""
    Write-Host "  Azure subscription: none accessible in this tenant." -ForegroundColor Yellow
    Write-Host "  Falling back to Microsoft Graph service principal discovery for the managed identity." -ForegroundColor DarkYellow
}

# =========================================================================
# STEP 2: FIND MANAGED IDENTITY
# =========================================================================

Write-Host ""
Write-Host "Locating managed identity..." -ForegroundColor White

$managedIdentitySpId = $null
$foundRg = $null
$foundName = $null
$identitySource = $null
$managedIdentityResolutionError = $null

if ($ResourceGroupName -and $ManagedIdentityName) {
    if ($subscriptionContext) {
        try {
            $prevEAP = $ErrorActionPreference
            $ErrorActionPreference = "Continue"
            $idJson = az identity show --resource-group $ResourceGroupName --name $ManagedIdentityName --output json 2>$null
            $exitCode = $LASTEXITCODE
            $ErrorActionPreference = $prevEAP

            if ($exitCode -ne 0) {
                throw "Azure Resource Manager lookup failed."
            }

            $idInfo = $idJson | ConvertFrom-Json
            $managedIdentitySpId = $idInfo.principalId
            $foundRg = $ResourceGroupName
            $foundName = $ManagedIdentityName
            $identitySource = "Azure subscription"
        }
        catch {
            Write-Host "  Azure lookup failed for '$ManagedIdentityName'. Falling back to Microsoft Graph..." -ForegroundColor DarkYellow
            try {
                $graphIdentity = Resolve-ManagedIdentityFromGraph -ManagedIdentityName $ManagedIdentityName
                $managedIdentitySpId = $graphIdentity.principalId
                $foundRg = $graphIdentity.resourceGroup
                $foundName = $graphIdentity.name
                $identitySource = $graphIdentity.source
            }
            catch {
                $managedIdentityResolutionError = $_.Exception.Message
            }
        }
    }
    else {
        try {
            $graphIdentity = Resolve-ManagedIdentityFromGraph -ManagedIdentityName $ManagedIdentityName
            $managedIdentitySpId = $graphIdentity.principalId
            $foundRg = $graphIdentity.resourceGroup
            $foundName = $graphIdentity.name
            $identitySource = $graphIdentity.source
        }
        catch {
            $managedIdentityResolutionError = $_.Exception.Message
        }
    }
}
else {
    if ($subscriptionContext) {
        Write-Host "  Searching for Omzig managed identities..." -ForegroundColor DarkGray
        $prevEAP = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $identitiesJson = az identity list --output json 2>$null
        $exitCode = $LASTEXITCODE
        $ErrorActionPreference = $prevEAP

        if ($exitCode -eq 0) {
            $identities = $identitiesJson | ConvertFrom-Json
            $omzigIdentities = @($identities | Where-Object { $_.name -match 'omzig' })

            if ($omzigIdentities.Count -eq 1) {
                $managedIdentitySpId = $omzigIdentities[0].principalId
                $foundRg = $omzigIdentities[0].resourceGroup
                $foundName = $omzigIdentities[0].name
                $identitySource = "Azure subscription"
            }
            elseif ($omzigIdentities.Count -gt 1) {
                Write-Host "  Multiple Omzig identities found:" -ForegroundColor Yellow
                for ($i = 0; $i -lt $omzigIdentities.Count; $i++) {
                    Write-Host "    [$($i + 1)] $($omzigIdentities[$i].name) (RG: $($omzigIdentities[$i].resourceGroup))"
                }
                $choice = Read-Host "  Select identity (1-$($omzigIdentities.Count))"
                $selection = 0
                if (-not [int]::TryParse($choice, [ref]$selection) -or $selection -lt 1 -or $selection -gt $omzigIdentities.Count) {
                    Write-Host "ERROR: Invalid selection. Enter a number from 1 to $($omzigIdentities.Count)." -ForegroundColor Red
                    exit 1
                }

                $idx = $selection - 1
                $managedIdentitySpId = $omzigIdentities[$idx].principalId
                $foundRg = $omzigIdentities[$idx].resourceGroup
                $foundName = $omzigIdentities[$idx].name
                $identitySource = "Azure subscription"
            }
        }
    }

    if (-not $managedIdentitySpId) {
        try {
            $graphIdentity = Resolve-ManagedIdentityFromGraph
            $managedIdentitySpId = $graphIdentity.principalId
            $foundRg = $graphIdentity.resourceGroup
            $foundName = $graphIdentity.name
            $identitySource = $graphIdentity.source
        }
        catch {
            $managedIdentityResolutionError = $_.Exception.Message
        }
    }
}

if (-not $managedIdentitySpId) {
    if ($SkipAudit) {
        Write-Host "ERROR: Managed identity resolution failed." -ForegroundColor Red
        if ($managedIdentityResolutionError) {
            Write-Host "       $managedIdentityResolutionError" -ForegroundColor Yellow
        }
        exit 1
    }

    Write-Host "  [WARN] Managed identity resolution failed. Continuing in audit-only mode." -ForegroundColor Yellow
    if ($managedIdentityResolutionError) {
        Write-Host "         $managedIdentityResolutionError" -ForegroundColor DarkYellow
    }
    Write-Host "         Permission grant steps will be skipped for this session." -ForegroundColor DarkYellow
}
else {
    Write-Host "  Found: $foundName" -ForegroundColor Green
    if ($foundRg) {
        Write-Host "  Resource Group: $foundRg" -ForegroundColor DarkGray
    }
    if ($identitySource) {
        Write-Host "  Source: $identitySource" -ForegroundColor DarkGray
    }
}

# =========================================================================
# STEP 3 & 4: GRAPH SERVICE PRINCIPAL & PERMISSIONS
# =========================================================================

if ($managedIdentitySpId) {
    Write-Host ""
    Write-Host "Resolving Microsoft Graph service principal and permissions..." -ForegroundColor White

    try {
        $graphSp = Invoke-GraphRest -Uri "https://graph.microsoft.com/v1.0/servicePrincipals(appId='00000003-0000-0000-c000-000000000000')?%24select=id,appRoles"
    }
    catch {
        Write-Host "ERROR: Failed to resolve the Microsoft Graph service principal." -ForegroundColor Red
        Write-Host "       $($_.Exception.Message)" -ForegroundColor Yellow
        exit 1
    }

    $graphSpId = $graphSp.id
    $allAppRoles = $graphSp.appRoles

    if (-not $graphSpId -or -not $allAppRoles) {
        Write-Host "ERROR: Microsoft Graph service principal lookup returned incomplete data." -ForegroundColor Red
        exit 1
    }

    $requiredPermissions = @(
        "Policy.ReadWrite.ConditionalAccess", "Policy.Read.All",
        "DeviceManagementConfiguration.ReadWrite.All", "DeviceManagementManagedDevices.ReadWrite.All",
        "DeviceManagementServiceConfig.ReadWrite.All", "SecurityEvents.ReadWrite.All",
        "User.ReadWrite.All", "Group.ReadWrite.All", "Directory.ReadWrite.All",
        "Mail.ReadWrite", "MailboxSettings.ReadWrite", "Sites.FullControl.All",
        "Team.Create", "TeamsAppInstallation.ReadWriteForTeam.All",
        "Reports.Read.All", "AuditLog.Read.All", "InformationProtectionPolicy.Read.All"
    )

    $permissionMap = @{}
    foreach ($permName in $requiredPermissions) {
        $matched = @($allAppRoles | Where-Object { $_.value -eq $permName -and $_.allowedMemberTypes -contains "Application" })
        if ($matched.Count -gt 0) { $permissionMap[$permName] = $matched[0].id }
    }

    $unresolvedPermissions = @($requiredPermissions | Where-Object { -not $permissionMap.Contains($_) })
    if ($unresolvedPermissions.Count -gt 0) {
        Write-Host "ERROR: Failed to resolve these Graph application permissions:" -ForegroundColor Red
        foreach ($permName in $unresolvedPermissions) {
            Write-Host "       $permName" -ForegroundColor Yellow
        }
        exit 1
    }

    # =========================================================================
    # STEP 5 & 6: CHECK & GRANT PERMISSIONS
    # =========================================================================

    try {
        $existingGrants = Invoke-GraphCollection -Uri "https://graph.microsoft.com/v1.0/servicePrincipals/$graphSpId/appRoleAssignedTo?%24select=appRoleId,principalId&%24top=999"
    }
    catch {
        Write-Host "ERROR: Failed to read existing Graph app-role assignments." -ForegroundColor Red
        Write-Host "       $($_.Exception.Message)" -ForegroundColor Yellow
        exit 1
    }

    $grantedRoleIds = @(
        $existingGrants |
            Where-Object { $_.principalId -eq $managedIdentitySpId } |
            ForEach-Object { $_.appRoleId }
    )

    Write-Banner "Granting Permissions"
    foreach ($permName in $requiredPermissions) {
        $roleId = $permissionMap[$permName]
        if ($roleId -in $grantedRoleIds) {
            Write-Host "  SKIP: $permName (already granted)" -ForegroundColor DarkGray
            continue
        }

        Write-Host "  Granting $permName..." -NoNewline
        $bodyFile = Join-Path $env:TEMP "omzig-grant-$(New-Guid).json"
        $bodyJson = @{ principalId = $managedIdentitySpId; resourceId = $graphSpId; appRoleId = $roleId } | ConvertTo-Json
        [System.IO.File]::WriteAllText($bodyFile, $bodyJson, [System.Text.UTF8Encoding]::new($false))

        try {
            $prevEAP = $ErrorActionPreference
            $ErrorActionPreference = "Continue"
            $grantResult = az rest --method POST --url "https://graph.microsoft.com/v1.0/servicePrincipals/$graphSpId/appRoleAssignedTo" --body "@$bodyFile" --output none 2>&1
            $grantExitCode = $LASTEXITCODE
            $ErrorActionPreference = $prevEAP

            if ($grantExitCode -eq 0) {
                Write-Host " OK" -ForegroundColor Green
            }
            else {
                $errorText = $grantResult -join " "
                if ($errorText -match "Permission being assigned already exists") {
                    Write-Host " OK (already existed)" -ForegroundColor Green
                }
                else {
                    Write-Host " FAILED" -ForegroundColor Red
                    Write-Host "    Error: $errorText" -ForegroundColor DarkRed
                }
            }
        } catch {
            Write-Host " FAILED" -ForegroundColor Red
            Write-Host "    Error: $($_.Exception.Message)" -ForegroundColor DarkRed
        }
        finally {
            Remove-Item $bodyFile -ErrorAction SilentlyContinue
        }
    }
}
else {
    Write-Banner "Granting Permissions"
    Write-Host "  Skipped. No managed identity was found in this tenant." -ForegroundColor Yellow
    Write-Host "  The script will continue with the audit and Excel export only." -ForegroundColor DarkYellow
}

# =========================================================================
# STEP 7: PRE-DEPLOYMENT AUDIT (CISA / NIST / Combined)
# =========================================================================

# Variables used by the Excel export and audit report generation
$globalAdminCount = 0
$breakGlassMemberCount = 0
$mfaRegistrationPct = 0
$hasQualifyingSku = $false
$compliantDevicesCount = 0
$totalDevicesCount = 0
$existingPolicies = @()
$selectedAuditFramework = $null
$selectedFrameworks = @()
$frameworkCatalog = $null
$tenantFacts = $null
$auditReports = [ordered]@{}
$auditEnvelope = $null
$interactiveAuditMenu = (-not $SkipAudit) -and (-not $PSBoundParameters.ContainsKey('AuditFramework'))
$lastAuditReportPath = $null
$lastAuditReportSaved = $false
$lastExportPath = $null
$lastExportSucceeded = $false
$lastExportValidation = $null

if (-not $SkipAudit) {
    Write-Banner "Refreshing Audit Frameworks"
    $frameworkCatalog = Update-FrameworkCatalog -CachePath $FrameworkCachePath
    Write-FrameworkCatalogSummary -Catalog $frameworkCatalog

    Write-Banner "Fetching CISA SCuBA Control Catalog"
    $cisaControlCatalog = Update-CisaControlCatalog -CachePath $FrameworkCachePath
    Write-Host "  CISA control catalog: $($cisaControlCatalog.Count) controls loaded." -ForegroundColor DarkCyan

    Write-Banner "Collecting Tenant Facts"
    Write-Host "  Note: This audit uses your current Azure CLI sign-in, not the Azure managed identity." -ForegroundColor DarkGray
    Write-Host "        Some Graph checks can fail if the Azure CLI token lacks delegated Microsoft Graph scopes." -ForegroundColor DarkGray
    $tenantFacts = Get-TenantAuditFacts

    $globalAdminCount = $tenantFacts.adminRoles.globalAdminCount
    $breakGlassMemberCount = $tenantFacts.breakGlass.memberCount
    $mfaRegistrationPct = $tenantFacts.mfa.percentage
    $hasQualifyingSku = $tenantFacts.licenses.hasQualifyingSku
    $compliantDevicesCount = $tenantFacts.devices.compliantDevices
    $totalDevicesCount = $tenantFacts.devices.totalDevices
    $existingPolicies = @($tenantFacts.conditionalAccess.policies)

    while ($true) {
        $selectedAuditFramework = Resolve-AuditFrameworkSelection -RequestedFramework $AuditFramework -AllowExit:$interactiveAuditMenu
        if ($selectedAuditFramework -eq "Exit") {
            break
        }

        $selectedFrameworks = $(if ($selectedAuditFramework -eq "Both") { @("CISA", "NIST") } else { @($selectedAuditFramework) })
        $currentExportPath = $(if ($PSBoundParameters.ContainsKey('ExportPath')) {
            $ExportPath
        }
        else {
            switch ($selectedAuditFramework) {
                "CISA" { ".\OMZIG_CISA_SCuBA_Scorecard.xlsx" }
                "NIST" { ".\OMZIG_NIST_Standards_Scorecard.xlsx" }
                default { ".\OMZIG_Audit_Scorecard.xlsx" }
            }
        })
        $currentAuditReportPath = $(if ($PSBoundParameters.ContainsKey('AuditReportPath')) {
            $AuditReportPath
        }
        else {
            switch ($selectedAuditFramework) {
                "CISA" { ".\OMZIG_CISA_SCuBA_Audit_Report.json" }
                "NIST" { ".\OMZIG_NIST_Standards_Audit_Report.json" }
                default { ".\OMZIG_Audit_Report.json" }
            }
        })

        $auditReports = [ordered]@{}
        $auditEnvelope = $null
        $lastAuditReportPath = $currentAuditReportPath
        $lastAuditReportSaved = $false
        $lastExportPath = $currentExportPath
        $lastExportSucceeded = $false
        $lastExportValidation = $null

        if ($selectedFrameworks -contains "CISA") {
            $cisaChecks = Invoke-CisaControlEvaluation -Facts $tenantFacts -ControlCatalog $cisaControlCatalog
            $auditReports["CISA"] = New-FrameworkAuditReport -Id "CISA" -DisplayName "CISA SCuBA" -Metadata $frameworkCatalog.CISA -Checks $cisaChecks
            Write-FrameworkAuditReport -Report $auditReports["CISA"]
        }

        if ($selectedFrameworks -contains "NIST") {
            $nistChecks = Get-NistZtaChecks -Facts $tenantFacts
            # Add 800-53 cross-reference if CISA was also run
            if ($auditReports.Contains("CISA")) {
                $nist80053Checks = Get-Nist80053CrossReference -ControlCatalog $cisaControlCatalog -CisaChecks $cisaChecks
                $nistChecks = @($nistChecks) + @($nist80053Checks)
            }
            $auditReports["NIST"] = New-FrameworkAuditReport -Id "NIST" -DisplayName "NIST Standards" -Metadata $frameworkCatalog.NIST -Checks $nistChecks
            Write-FrameworkAuditReport -Report $auditReports["NIST"]
        }

        Write-CombinedAuditSummary -AuditReports $auditReports

        $combinedPass = 0
        $combinedWarn = 0
        $combinedFail = 0
        $combinedBlocker = 0
        foreach ($frameworkId in $auditReports.Keys) {
            $combinedPass += $auditReports[$frameworkId].summary.pass
            $combinedWarn += $auditReports[$frameworkId].summary.warn
            $combinedFail += $auditReports[$frameworkId].summary.fail
            $combinedBlocker += $auditReports[$frameworkId].summary.blocker
        }

        $combinedReadiness = $(if ($combinedBlocker -gt 0) {
            "blocked"
        }
        elseif ($combinedFail -gt 0) {
            "not-ready"
        }
        elseif ($combinedWarn -gt 0) {
            "caution"
        }
        else {
            "ready"
        })

        $tenantDisplayName = $(if ($tenantFacts.organization.displayName) { $tenantFacts.organization.displayName } else { $tenantId })
        $tenantPrimaryDomain = $(if ($tenantFacts.organization.primaryDomain) { $tenantFacts.organization.primaryDomain } else { $null })

        $auditEnvelope = [ordered]@{
            generatedAt       = (Get-Date).ToUniversalTime().ToString("o")
            selectedFramework = $selectedAuditFramework
            frameworks        = $selectedFrameworks
            frameworkCatalog  = $frameworkCatalog
            tenantInfo        = [ordered]@{
                tenantId      = $(if ($tenantFacts.organization.tenantId) { $tenantFacts.organization.tenantId } else { $tenantId })
                displayName   = $tenantDisplayName
                primaryDomain = $tenantPrimaryDomain
                user          = $userName
            }
            combinedSummary   = [ordered]@{
                overallReadiness = $combinedReadiness
                pass             = $combinedPass
                warn             = $combinedWarn
                fail             = $combinedFail
                blocker          = $combinedBlocker
            }
            reports           = $auditReports
        }

        $auditStatisticsValidation = @(Test-AuditReportConsistency -AuditReports $auditReports -CombinedSummary $auditEnvelope.combinedSummary)
        $auditEnvelope.validation = [ordered]@{
            statistics = $auditStatisticsValidation
        }

        try {
            Save-AuditReport -AuditReport $auditEnvelope -Path $currentAuditReportPath
            $lastAuditReportSaved = $true
            Write-Host ""
            Write-Host "  Audit report saved to: $currentAuditReportPath" -ForegroundColor White
        }
        catch {
            Write-Host ""
            Write-Host "  [WARN] Failed to save audit report to $currentAuditReportPath" -ForegroundColor Yellow
            Write-Host "         $($_.Exception.Message)" -ForegroundColor DarkYellow
        }

        # =========================================================================
        # STEP 8: EXPORT SCORECARD TO EXCEL
        # =========================================================================

        if (Test-Path $TemplatePath) {
            try {
                $exportResult = Export-AuditScorecard -TemplatePath $TemplatePath -ExportPath $currentExportPath -SelectedAuditFramework $selectedAuditFramework -TenantFacts $tenantFacts -AuditReports $auditReports -CombinedSummary $auditEnvelope.combinedSummary
                $lastExportPath = $exportResult.path
                $lastExportValidation = $exportResult.validation
                $lastExportSucceeded = $true
            }
            catch {
                Write-Host "  [FAIL] Failed to modify Excel file: $($_.Exception.Message)" -ForegroundColor Red
                Write-Host "         Review the Self Validation output and ensure the workbook is not locked." -ForegroundColor Yellow
            }
        }
        else {
            Write-Host ""
            Write-Host "  (Template not found at $TemplatePath. Skipping Excel export.)" -ForegroundColor DarkGray
        }

        Write-Banner "Scan Complete"
        $auditLabel = Get-AuditFrameworkDisplayName -FrameworkId $selectedAuditFramework
        Write-Host "  Review the $auditLabel audit results above." -ForegroundColor White
        if ($lastAuditReportSaved) {
            Write-Host "  Review the saved audit report at $currentAuditReportPath." -ForegroundColor White
        }
        else {
            Write-Host "  The JSON audit report did not save successfully." -ForegroundColor Yellow
        }
        if ($lastExportSucceeded) {
            Write-Host "  Review the Excel scorecard at $lastExportPath." -ForegroundColor White
            if ($lastExportValidation -and $lastExportValidation.confirmed) {
                Write-Host "  Self validation confirmed $($lastExportValidation.pass) pass, $($lastExportValidation.warn) warn, $($lastExportValidation.fail) fail across $($lastExportValidation.total) checks." -ForegroundColor Green
            }
        }
        elseif (-not (Test-Path $TemplatePath)) {
            Write-Host "  The Excel scorecard export was skipped because the template was not found." -ForegroundColor DarkGray
            Write-SelfValidationSummary -ValidationResults $auditStatisticsValidation
        }
        else {
            Write-Host "  The Excel scorecard export did not complete." -ForegroundColor Yellow
        }

        if ($interactiveAuditMenu) {
            Write-Host "  Returning to the audit main menu..." -ForegroundColor DarkGray
            Write-Host ""
            continue
        }

        break
    }
}

Write-Banner "Next Steps"
if (-not $SkipAudit) {
    if ($interactiveAuditMenu) {
        Write-Host "  The audit session is complete." -ForegroundColor White
        if ($lastAuditReportSaved) {
            Write-Host "  Last saved audit report: $lastAuditReportPath" -ForegroundColor White
        }
        if ($lastExportSucceeded) {
            Write-Host "  Last exported Excel scorecard: $lastExportPath" -ForegroundColor White
            if ($lastExportValidation -and $lastExportValidation.confirmed) {
                Write-Host "  Last self-validation status: confirmed ($($lastExportValidation.pass) pass, $($lastExportValidation.warn) warn, $($lastExportValidation.fail) fail)." -ForegroundColor White
            }
        }
        Write-Host "  Re-run the script for a fresh tenant connection." -ForegroundColor White
    }
    else {
        $auditLabel = Get-AuditFrameworkDisplayName -FrameworkId $selectedAuditFramework
        Write-Host "  Review the $auditLabel audit results above." -ForegroundColor White
        if ($lastAuditReportSaved) {
            Write-Host "  Review the saved audit report at $lastAuditReportPath." -ForegroundColor White
        }
        if ($lastExportSucceeded) {
            Write-Host "  Review the Excel scorecard at $lastExportPath." -ForegroundColor White
            if ($lastExportValidation -and $lastExportValidation.confirmed) {
                Write-Host "  Self validation confirmed $($lastExportValidation.pass) pass, $($lastExportValidation.warn) warn, $($lastExportValidation.fail) fail across $($lastExportValidation.total) checks." -ForegroundColor White
            }
        }
        Write-Host "  Deploy the Zero Trust policies when ready." -ForegroundColor White
    }
}
else {
    Write-Host "  Re-run without -SkipAudit to generate NIST standards, CISA SCuBA, or combined audit results." -ForegroundColor White
    Write-Host "  Deploy the Zero Trust policies when ready." -ForegroundColor White
}
Write-Host ""

