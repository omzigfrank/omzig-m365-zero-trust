# CisaCatalogFetcher.ps1
# Fetches and parses CISA SCuBA baseline controls from cisagov/ScubaGear GitHub.
# Returns an array of control objects with id, product, description, requirement, nist80053.

function Get-CisaBaselineUrls {
    param([string]$Tag)

    if (-not $Tag) { $Tag = "v1.7.1" }
    $cleanTag = $Tag.TrimStart("v").TrimStart("V")
    $tagPrefix = "v$cleanTag"

    $products = @("aad", "exo", "defender", "sharepoint", "teams", "powerplatform", "powerbi")
    $urls = @()

    foreach ($product in $products) {
        $urls += [ordered]@{
            product = $product.ToUpper()
            url     = "https://raw.githubusercontent.com/cisagov/ScubaGear/$tagPrefix/PowerShell/ScubaGear/baselines/$product.md"
        }
    }

    return @($urls)
}

function Get-CisaControlsFromMarkdown {
    param([string]$MarkdownContent, [string]$Product)

    $controls = @()

    if (-not $MarkdownContent) { return @($controls) }

    $lines = $MarkdownContent -split "`n"
    $lineCount = $lines.Count

    for ($i = 0; $i -lt $lineCount; $i++) {
        $line = $lines[$i]

        # Method 1: HTML comment — <!--Policy: MS.AAD.1.1v1; Criticality: SHALL -->
        $commentMatch = [regex]::Match($line, '<!--\s*Policy:\s*(MS\.\w+\.\d+\.\d+v\d+)\s*;\s*Criticality:\s*(\w+)\s*-->')
        if ($commentMatch.Success) {
            $controlId = $commentMatch.Groups[1].Value
            $requirement = $commentMatch.Groups[2].Value.ToUpper()

            # Look backward for the description (heading or first non-blank line before)
            $description = ""
            for ($j = $i - 1; $j -ge 0 -and $j -ge ($i - 5); $j--) {
                $prev = $lines[$j].Trim()
                if ($prev -match '^#{1,6}\s+') {
                    # This is a heading — strip the hashes and control ID prefix
                    $description = ($prev -replace '^#{1,6}\s+', '').Trim()
                    $description = ($description -replace '^MS\.\w+\.\d+\.\d+v\d+\s*', '').Trim()
                    break
                }
                elseif ($prev.Length -gt 0 -and $prev -notmatch '^<!--') {
                    $description = $prev
                    break
                }
            }

            # Look forward for the policy statement (SHALL/SHOULD/MAY line)
            $policyStatement = ""
            for ($k = $i + 1; $k -lt $lineCount -and $k -le ($i + 5); $k++) {
                $next = $lines[$k].Trim()
                if ($next -match '^\b(SHALL|SHOULD|MAY)\b') {
                    $policyStatement = $next
                    break
                }
                elseif ($next.Length -gt 10 -and $next -notmatch '^<!--' -and $next -notmatch '^#{1,6}\s+' -and $next -notmatch '^\|') {
                    $policyStatement = $next
                    break
                }
            }

            if ($policyStatement -and -not $description) {
                $description = $policyStatement
            }
            elseif ($policyStatement -and $description) {
                # Prefer the policy statement as description if it's more descriptive
                if ($policyStatement.Length -gt $description.Length) {
                    $description = $policyStatement
                }
            }

            # Truncate overly long descriptions
            if ($description.Length -gt 300) {
                $description = $description.Substring(0, 297) + "..."
            }

            # Look for NIST 800-53 mapping near this control
            $nist80053 = ""
            for ($m = $i; $m -lt $lineCount -and $m -le ($i + 15); $m++) {
                $mapLine = $lines[$m]
                if ($mapLine -match 'NIST SP 800-53') {
                    $nistMatch = [regex]::Match($mapLine, 'NIST SP 800-53[^:]*:\s*(.+)')
                    if ($nistMatch.Success) {
                        $nist80053 = $nistMatch.Groups[1].Value.Trim()
                        # Strip trailing markdown
                        $nist80053 = ($nist80053 -replace '\s*\*?\s*$', '').Trim()
                    }
                    break
                }
                # Stop if we hit the next control heading
                if ($m -gt $i -and $mapLine -match '#{4}\s+MS\.') { break }
            }

            $controls += [ordered]@{
                id          = $controlId
                product     = $Product.ToUpper()
                description = $description
                requirement = $requirement
                nist80053   = $nist80053
            }
            continue
        }

        # Method 2: Heading fallback — #### MS.AAD.1.1v1
        $headingMatch = [regex]::Match($line, '^#{4}\s+(MS\.(\w+)\.\d+\.\d+v\d+)')
        if ($headingMatch.Success) {
            $controlId = $headingMatch.Groups[1].Value
            $headingProduct = $headingMatch.Groups[2].Value.ToUpper()

            # Check if we already captured this control via HTML comment
            $alreadyCaptured = $false
            foreach ($existing in $controls) {
                if ($existing.id -eq $controlId) {
                    $alreadyCaptured = $true
                    break
                }
            }
            if ($alreadyCaptured) { continue }

            # Look forward for the policy statement
            $description = ""
            $requirement = "SHALL"
            for ($k = $i + 1; $k -lt $lineCount -and $k -le ($i + 5); $k++) {
                $next = $lines[$k].Trim()
                if ($next -match '<!--') { break }
                if ($next.Length -gt 10 -and $next -notmatch '^#{1,6}\s+' -and $next -notmatch '^\|' -and $next -notmatch '^$') {
                    $description = $next
                    $reqMatch = [regex]::Match($next, '\b(SHALL NOT|SHALL|SHOULD NOT|SHOULD|MAY)\b')
                    if ($reqMatch.Success) {
                        $requirement = $reqMatch.Groups[1].Value.ToUpper()
                    }
                    break
                }
            }

            if ($description.Length -gt 300) {
                $description = $description.Substring(0, 297) + "..."
            }

            # Look for NIST 800-53 mapping
            $nist80053 = ""
            for ($m = $i; $m -lt $lineCount -and $m -le ($i + 15); $m++) {
                $mapLine = $lines[$m]
                if ($mapLine -match 'NIST SP 800-53') {
                    $nistMatch = [regex]::Match($mapLine, 'NIST SP 800-53[^:]*:\s*(.+)')
                    if ($nistMatch.Success) {
                        $nist80053 = $nistMatch.Groups[1].Value.Trim()
                        $nist80053 = ($nist80053 -replace '\s*\*?\s*$', '').Trim()
                    }
                    break
                }
                if ($m -gt $i -and $lines[$m] -match '#{4}\s+MS\.') { break }
            }

            $controls += [ordered]@{
                id          = $controlId
                product     = $(if ($headingProduct) { $headingProduct } else { $Product.ToUpper() })
                description = $description
                requirement = $requirement
                nist80053   = $nist80053
            }
        }
    }

    return @($controls)
}

function Update-CisaControlCatalog {
    param([string]$CachePath)

    $catalog = $null
    if ($CachePath -and (Test-Path $CachePath)) {
        try {
            $catalog = Get-Content -Path $CachePath -Raw | ConvertFrom-Json
        }
        catch {
            $catalog = $null
        }
    }

    # Get the ScubaGear version tag from the cached catalog
    $tag = "v1.7.1"
    if ($catalog -and $catalog.CISA -and $catalog.CISA.version) {
        $tag = $catalog.CISA.version
    }

    $baselineUrls = Get-CisaBaselineUrls -Tag $tag
    $allControls = @()
    $fetchedProducts = @()
    $failedProducts = @()

    Write-Host "  Fetching CISA SCuBA baselines from ScubaGear $tag ..." -ForegroundColor DarkCyan

    foreach ($baseline in $baselineUrls) {
        $productName = $baseline.product
        $url = $baseline.url

        try {
            $headers = @{
                "User-Agent" = "omzig-m365-zero-trust"
                "Accept"     = "text/plain"
            }

            $content = $null
            if ($PSVersionTable.PSVersion.Major -le 5) {
                $content = (Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing -ErrorAction Stop).Content
            }
            else {
                $content = (Invoke-WebRequest -Uri $url -Headers $headers -ErrorAction Stop).Content
            }

            $controls = Get-CisaControlsFromMarkdown -MarkdownContent $content -Product $productName
            if ($controls.Count -gt 0) {
                $allControls += @($controls)
                $fetchedProducts += $productName
                Write-Host "    $productName : $($controls.Count) controls" -ForegroundColor DarkGray
            }
            else {
                Write-Host "    $productName : 0 controls (parsing returned nothing)" -ForegroundColor Yellow
                $failedProducts += $productName
            }
        }
        catch {
            Write-Host "    $productName : fetch failed ($($_.Exception.Message))" -ForegroundColor Yellow
            $failedProducts += $productName
        }
    }

    # If we got at least some controls, cache them
    if ($allControls.Count -gt 0) {
        Write-Host "  Total CISA controls fetched: $($allControls.Count)" -ForegroundColor DarkCyan

        if ($catalog -and $CachePath) {
            # Add controlCatalog section to the existing cache
            $catalog | Add-Member -NotePropertyName "controlCatalog" -NotePropertyValue ([ordered]@{
                fetchedAt       = (Get-Date).ToUniversalTime().ToString("o")
                scubaGearTag    = $tag
                totalControls   = $allControls.Count
                fetchedProducts = @($fetchedProducts)
                failedProducts  = @($failedProducts)
                controls        = @($allControls)
            }) -Force

            try {
                $catalog | ConvertTo-Json -Depth 10 | Set-Content -Path $CachePath -Encoding UTF8
            }
            catch {
                Write-Warning "  Could not write control catalog to cache: $($_.Exception.Message)"
            }
        }

        return @($allControls)
    }

    # Fallback to defaults if fetch failed entirely
    Write-Host "  GitHub fetch failed, using built-in defaults." -ForegroundColor Yellow
    return @(Get-CisaControlCatalogDefaults)
}

function Get-CisaControlCatalogDefaults {
    # Minimal built-in defaults for when GitHub is unreachable.
    # These cover the control IDs we can evaluate via Graph API.
    $defaults = @(
        [ordered]@{ id = "MS.AAD.1.1v1";  product = "AAD"; description = "Legacy authentication SHALL be blocked."; requirement = "SHALL"; nist80053 = "AC-7" }
        [ordered]@{ id = "MS.AAD.2.1v1";  product = "AAD"; description = "Users detected as high risk SHALL be blocked."; requirement = "SHALL"; nist80053 = "AC-7" }
        [ordered]@{ id = "MS.AAD.2.3v1";  product = "AAD"; description = "Sign-ins detected as high risk SHALL be blocked."; requirement = "SHALL"; nist80053 = "AC-7" }
        [ordered]@{ id = "MS.AAD.3.1v1";  product = "AAD"; description = "Phishing-resistant MFA SHALL be required for all users."; requirement = "SHALL"; nist80053 = "IA-2(1)" }
        [ordered]@{ id = "MS.AAD.3.2v1";  product = "AAD"; description = "If phishing-resistant MFA cannot be used, an MFA method from the list SHALL be used."; requirement = "SHALL"; nist80053 = "IA-2(1)" }
        [ordered]@{ id = "MS.AAD.3.3v1";  product = "AAD"; description = "If phishing-resistant MFA has not been enforced, an alternative MFA method SHALL be enforced."; requirement = "SHALL"; nist80053 = "IA-2(1)" }
        [ordered]@{ id = "MS.AAD.3.4v1";  product = "AAD"; description = "The Authentication Methods Manage Migration feature SHALL be set to Migration Complete."; requirement = "SHALL"; nist80053 = "IA-2(1)" }
        [ordered]@{ id = "MS.AAD.3.5v1";  product = "AAD"; description = "SMS or voice as an MFA option SHALL NOT be used."; requirement = "SHALL NOT"; nist80053 = "IA-2(1)" }
        [ordered]@{ id = "MS.AAD.3.6v1";  product = "AAD"; description = "Phishing-resistant MFA SHALL be required for highly privileged roles."; requirement = "SHALL"; nist80053 = "IA-2(1)" }
        [ordered]@{ id = "MS.AAD.3.7v1";  product = "AAD"; description = "Managed devices SHOULD be required for authentication."; requirement = "SHOULD"; nist80053 = "IA-2(1)" }
        [ordered]@{ id = "MS.AAD.3.8v1";  product = "AAD"; description = "Managed Devices SHOULD be required to register MFA."; requirement = "SHOULD"; nist80053 = "IA-2(1)" }
        [ordered]@{ id = "MS.AAD.4.1v1";  product = "AAD"; description = "Security logs SHALL be sent to the agency's SIEM."; requirement = "SHALL"; nist80053 = "AU-6" }
        [ordered]@{ id = "MS.AAD.5.1v1";  product = "AAD"; description = "Only administrators SHALL be allowed to register applications."; requirement = "SHALL"; nist80053 = "CM-7" }
        [ordered]@{ id = "MS.AAD.5.2v1";  product = "AAD"; description = "Only administrators SHALL be allowed to consent to applications."; requirement = "SHALL"; nist80053 = "CM-7" }
        [ordered]@{ id = "MS.AAD.5.3v1";  product = "AAD"; description = "An admin consent workflow SHALL be enabled."; requirement = "SHALL"; nist80053 = "CM-7" }
        [ordered]@{ id = "MS.AAD.5.4v1";  product = "AAD"; description = "Group owners SHALL NOT be allowed to consent to applications."; requirement = "SHALL NOT"; nist80053 = "CM-7" }
        [ordered]@{ id = "MS.AAD.6.1v1";  product = "AAD"; description = "User passwords SHALL NOT expire."; requirement = "SHALL NOT"; nist80053 = "IA-5" }
        [ordered]@{ id = "MS.AAD.7.1v1";  product = "AAD"; description = "A minimum of two users and a maximum of eight users SHALL be provisioned with the Global Administrator role."; requirement = "SHALL"; nist80053 = "AC-6(5)" }
        [ordered]@{ id = "MS.AAD.7.2v1";  product = "AAD"; description = "Privileged users SHALL be assigned to Entra ID roles via PIM."; requirement = "SHALL"; nist80053 = "AC-6(5)" }
        [ordered]@{ id = "MS.AAD.7.3v1";  product = "AAD"; description = "Activation of the Global Administrator role SHALL require approval."; requirement = "SHALL"; nist80053 = "AC-6(5)" }
        [ordered]@{ id = "MS.AAD.7.4v1";  product = "AAD"; description = "Eligible and active role assignments SHALL be audited monthly."; requirement = "SHALL"; nist80053 = "AC-6(5)" }
        [ordered]@{ id = "MS.AAD.7.5v1";  product = "AAD"; description = "Permanent active role assignments SHALL NOT be allowed."; requirement = "SHALL NOT"; nist80053 = "AC-6(5)" }
        [ordered]@{ id = "MS.AAD.7.6v1";  product = "AAD"; description = "Highly privileged role assignments SHALL require MFA activation."; requirement = "SHALL"; nist80053 = "AC-6(5)" }
        [ordered]@{ id = "MS.AAD.7.7v1";  product = "AAD"; description = "Provisioning users to highly privileged roles SHALL NOT occur outside of PIM."; requirement = "SHALL NOT"; nist80053 = "AC-6(5)" }
        [ordered]@{ id = "MS.AAD.7.8v1";  product = "AAD"; description = "Activation of highly privileged roles SHOULD trigger an alert."; requirement = "SHOULD"; nist80053 = "AC-6(5)" }
        [ordered]@{ id = "MS.AAD.7.9v1";  product = "AAD"; description = "User activation of the Global Administrator role SHALL require approval."; requirement = "SHALL"; nist80053 = "AC-6(5)" }
        [ordered]@{ id = "MS.AAD.8.1v1";  product = "AAD"; description = "Guest users SHOULD only be allowed access by specific organization admins."; requirement = "SHOULD"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.AAD.8.2v1";  product = "AAD"; description = "Guest invites SHOULD only be allowed from specific admin roles."; requirement = "SHOULD"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.AAD.8.3v1";  product = "AAD"; description = "Guest user access SHALL be restricted."; requirement = "SHALL"; nist80053 = "AC-3" }

        [ordered]@{ id = "MS.EXO.1.1v1";  product = "EXO"; description = "Automatic forwarding to external domains SHALL be disabled."; requirement = "SHALL"; nist80053 = "AC-4" }
        [ordered]@{ id = "MS.EXO.2.1v1";  product = "EXO"; description = "A list of approved IP addresses for sending SHALL be maintained."; requirement = "SHALL"; nist80053 = "SI-8" }
        [ordered]@{ id = "MS.EXO.2.2v1";  product = "EXO"; description = "An SPF policy SHALL be published for each domain."; requirement = "SHALL"; nist80053 = "SI-8" }
        [ordered]@{ id = "MS.EXO.3.1v1";  product = "EXO"; description = "DKIM SHOULD be enabled for all domains."; requirement = "SHOULD"; nist80053 = "SI-8" }
        [ordered]@{ id = "MS.EXO.4.1v1";  product = "EXO"; description = "A DMARC policy SHALL be published for every second-level domain."; requirement = "SHALL"; nist80053 = "SI-8" }
        [ordered]@{ id = "MS.EXO.4.2v1";  product = "EXO"; description = "The DMARC message rejection option SHALL be p=reject."; requirement = "SHALL"; nist80053 = "SI-8" }
        [ordered]@{ id = "MS.EXO.4.3v1";  product = "EXO"; description = "The DMARC point of contact for aggregate reports SHALL be present."; requirement = "SHALL"; nist80053 = "SI-8" }
        [ordered]@{ id = "MS.EXO.5.1v1";  product = "EXO"; description = "SMTP AUTH SHALL be disabled."; requirement = "SHALL"; nist80053 = "AC-17(2)" }
        [ordered]@{ id = "MS.EXO.6.1v1";  product = "EXO"; description = "Contact folders SHALL NOT be shared with all domains."; requirement = "SHALL NOT"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.EXO.6.2v1";  product = "EXO"; description = "Calendar details SHALL NOT be shared with all domains."; requirement = "SHALL NOT"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.EXO.7.1v1";  product = "EXO"; description = "External sender warnings SHALL be implemented."; requirement = "SHALL"; nist80053 = "SI-3" }
        [ordered]@{ id = "MS.EXO.8.1v1";  product = "EXO"; description = "A DLP solution SHALL be used."; requirement = "SHALL"; nist80053 = "SC-7" }
        [ordered]@{ id = "MS.EXO.8.2v1";  product = "EXO"; description = "The DLP solution SHALL protect PII and sensitive information."; requirement = "SHALL"; nist80053 = "SC-7" }
        [ordered]@{ id = "MS.EXO.9.1v1";  product = "EXO"; description = "Emails SHALL be filtered by attachment file types."; requirement = "SHALL"; nist80053 = "SI-3" }
        [ordered]@{ id = "MS.EXO.9.2v1";  product = "EXO"; description = "Emails SHALL be filtered based on content."; requirement = "SHALL"; nist80053 = "SI-3" }
        [ordered]@{ id = "MS.EXO.9.3v1";  product = "EXO"; description = "Inbound email from senders with a significant spam score SHALL be quarantined."; requirement = "SHALL"; nist80053 = "SI-8" }
        [ordered]@{ id = "MS.EXO.9.4v1";  product = "EXO"; description = "Inbound email from senders with a significant high confidence spam score SHALL be quarantined."; requirement = "SHALL"; nist80053 = "SI-8" }
        [ordered]@{ id = "MS.EXO.9.5v1";  product = "EXO"; description = "Inbound email detected as phishing SHALL be quarantined."; requirement = "SHALL"; nist80053 = "SI-8" }
        [ordered]@{ id = "MS.EXO.10.1v1"; product = "EXO"; description = "Emails SHALL be scanned for malware."; requirement = "SHALL"; nist80053 = "SI-3" }
        [ordered]@{ id = "MS.EXO.10.2v1"; product = "EXO"; description = "Emails with malware SHALL be quarantined or blocked."; requirement = "SHALL"; nist80053 = "SI-3" }
        [ordered]@{ id = "MS.EXO.10.3v1"; product = "EXO"; description = "Email scanning SHALL include internal emails."; requirement = "SHALL"; nist80053 = "SI-3" }
        [ordered]@{ id = "MS.EXO.11.1v1"; product = "EXO"; description = "Impersonation protection checks SHOULD be used."; requirement = "SHOULD"; nist80053 = "SI-8" }
        [ordered]@{ id = "MS.EXO.11.2v1"; product = "EXO"; description = "User impersonation protection SHOULD be enabled for key users."; requirement = "SHOULD"; nist80053 = "SI-8" }
        [ordered]@{ id = "MS.EXO.11.3v1"; product = "EXO"; description = "Domain impersonation protection SHOULD be enabled for key domains."; requirement = "SHOULD"; nist80053 = "SI-8" }
        [ordered]@{ id = "MS.EXO.12.1v1"; product = "EXO"; description = "IP allow lists SHOULD NOT be used."; requirement = "SHOULD NOT"; nist80053 = "SC-7" }
        [ordered]@{ id = "MS.EXO.12.2v1"; product = "EXO"; description = "Safe lists SHOULD NOT be enabled."; requirement = "SHOULD NOT"; nist80053 = "SC-7" }
        [ordered]@{ id = "MS.EXO.13.1v1"; product = "EXO"; description = "Mailbox auditing SHALL be enabled."; requirement = "SHALL"; nist80053 = "AU-2" }
        [ordered]@{ id = "MS.EXO.14.1v1"; product = "EXO"; description = "Safe Links SHALL be enabled for email messages."; requirement = "SHALL"; nist80053 = "SI-3" }
        [ordered]@{ id = "MS.EXO.14.2v1"; product = "EXO"; description = "Safe Links SHALL scan URLs at time of click."; requirement = "SHALL"; nist80053 = "SI-3" }
        [ordered]@{ id = "MS.EXO.14.3v1"; product = "EXO"; description = "Safe Links SHALL be enabled in Teams."; requirement = "SHALL"; nist80053 = "SI-3" }
        [ordered]@{ id = "MS.EXO.15.1v1"; product = "EXO"; description = "Safe Attachments SHALL be enabled for SharePoint, OneDrive, and Teams."; requirement = "SHALL"; nist80053 = "SI-3" }
        [ordered]@{ id = "MS.EXO.15.2v1"; product = "EXO"; description = "Safe Attachments SHALL be enabled for email."; requirement = "SHALL"; nist80053 = "SI-3" }
        [ordered]@{ id = "MS.EXO.15.3v1"; product = "EXO"; description = "Unsafe attachments SHALL be blocked."; requirement = "SHALL"; nist80053 = "SI-3" }
        [ordered]@{ id = "MS.EXO.16.1v1"; product = "EXO"; description = "Alerts SHALL be enabled."; requirement = "SHALL"; nist80053 = "SI-4" }
        [ordered]@{ id = "MS.EXO.16.2v1"; product = "EXO"; description = "Alerts SHOULD be sent to a monitored address."; requirement = "SHOULD"; nist80053 = "SI-4" }
        [ordered]@{ id = "MS.EXO.17.1v1"; product = "EXO"; description = "The number of users allowed to consent to third-party apps SHOULD be restricted."; requirement = "SHOULD"; nist80053 = "CM-7" }
        [ordered]@{ id = "MS.EXO.17.2v1"; product = "EXO"; description = "Integrated apps SHOULD only be available to specific users."; requirement = "SHOULD"; nist80053 = "CM-7" }
        [ordered]@{ id = "MS.EXO.17.3v1"; product = "EXO"; description = "Sideloading of apps SHOULD be restricted."; requirement = "SHOULD"; nist80053 = "CM-7" }

        [ordered]@{ id = "MS.DEFENDER.1.1v1"; product = "DEFENDER"; description = "The standard and strict preset security policies SHALL be enabled."; requirement = "SHALL"; nist80053 = "SI-3" }
        [ordered]@{ id = "MS.DEFENDER.1.2v1"; product = "DEFENDER"; description = "All users SHALL be added to Exchange Online Protection."; requirement = "SHALL"; nist80053 = "SI-3" }
        [ordered]@{ id = "MS.DEFENDER.1.3v1"; product = "DEFENDER"; description = "All users SHALL be added to Defender for Office 365 protection."; requirement = "SHALL"; nist80053 = "SI-3" }
        [ordered]@{ id = "MS.DEFENDER.1.4v1"; product = "DEFENDER"; description = "Sensitive accounts SHALL be added to the strict preset security policy."; requirement = "SHALL"; nist80053 = "SI-3" }
        [ordered]@{ id = "MS.DEFENDER.1.5v1"; product = "DEFENDER"; description = "Standard preset security policies SHALL NOT be applied to sensitive accounts."; requirement = "SHALL NOT"; nist80053 = "SI-3" }
        [ordered]@{ id = "MS.DEFENDER.2.1v1"; product = "DEFENDER"; description = "Safe Links SHALL be enabled for email."; requirement = "SHALL"; nist80053 = "SI-3" }
        [ordered]@{ id = "MS.DEFENDER.2.2v1"; product = "DEFENDER"; description = "Safe Links SHALL scan URLs at time of click."; requirement = "SHALL"; nist80053 = "SI-3" }
        [ordered]@{ id = "MS.DEFENDER.2.3v1"; product = "DEFENDER"; description = "Safe Links SHALL be enabled in Teams."; requirement = "SHALL"; nist80053 = "SI-3" }
        [ordered]@{ id = "MS.DEFENDER.3.1v1"; product = "DEFENDER"; description = "Safe Attachments SHALL be enabled for SharePoint, OneDrive, and Teams."; requirement = "SHALL"; nist80053 = "SI-3" }
        [ordered]@{ id = "MS.DEFENDER.4.1v1"; product = "DEFENDER"; description = "A custom anti-phishing policy SHALL be enabled."; requirement = "SHALL"; nist80053 = "SI-8" }
        [ordered]@{ id = "MS.DEFENDER.4.2v1"; product = "DEFENDER"; description = "User impersonation protection SHOULD be enabled."; requirement = "SHOULD"; nist80053 = "SI-8" }
        [ordered]@{ id = "MS.DEFENDER.4.3v1"; product = "DEFENDER"; description = "Domain impersonation protection SHOULD be enabled."; requirement = "SHOULD"; nist80053 = "SI-8" }
        [ordered]@{ id = "MS.DEFENDER.4.4v1"; product = "DEFENDER"; description = "Intelligence for impersonation protection SHALL be enabled."; requirement = "SHALL"; nist80053 = "SI-8" }
        [ordered]@{ id = "MS.DEFENDER.5.1v1"; product = "DEFENDER"; description = "At a minimum, the alerts required by the CISA SCuBA alerts list SHALL be enabled."; requirement = "SHALL"; nist80053 = "SI-4" }
        [ordered]@{ id = "MS.DEFENDER.5.2v1"; product = "DEFENDER"; description = "The alerts SHOULD be sent to a monitored mailbox."; requirement = "SHOULD"; nist80053 = "SI-4" }
        [ordered]@{ id = "MS.DEFENDER.6.1v1"; product = "DEFENDER"; description = "Microsoft Purview audit logging SHALL be enabled."; requirement = "SHALL"; nist80053 = "AU-2" }
        [ordered]@{ id = "MS.DEFENDER.6.2v1"; product = "DEFENDER"; description = "Audit logs SHALL be maintained for at least the minimum duration."; requirement = "SHALL"; nist80053 = "AU-11" }
        [ordered]@{ id = "MS.DEFENDER.6.3v1"; product = "DEFENDER"; description = "Advanced audit SHALL be enabled to provide additional logging."; requirement = "SHALL"; nist80053 = "AU-2" }

        [ordered]@{ id = "MS.SHAREPOINT.1.1v1"; product = "SHAREPOINT"; description = "External sharing for SharePoint SHALL be limited."; requirement = "SHALL"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.SHAREPOINT.1.2v1"; product = "SHAREPOINT"; description = "External sharing for OneDrive SHALL be limited."; requirement = "SHALL"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.SHAREPOINT.1.3v1"; product = "SHAREPOINT"; description = "External sharing SHALL be restricted to approved domains and security groups."; requirement = "SHALL"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.SHAREPOINT.1.4v1"; product = "SHAREPOINT"; description = "Guest access links SHALL be restricted."; requirement = "SHALL"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.SHAREPOINT.2.1v1"; product = "SHAREPOINT"; description = "File and folder default sharing link types SHALL be set to specific people."; requirement = "SHALL"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.SHAREPOINT.2.2v1"; product = "SHAREPOINT"; description = "Default sharing link permissions SHALL be set to view."; requirement = "SHALL"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.SHAREPOINT.3.1v1"; product = "SHAREPOINT"; description = "Expiration times for guest access links SHALL be set."; requirement = "SHALL"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.SHAREPOINT.4.1v1"; product = "SHAREPOINT"; description = "Users SHALL be prevented from running custom scripts."; requirement = "SHALL"; nist80053 = "CM-7" }

        [ordered]@{ id = "MS.TEAMS.1.1v1";  product = "TEAMS"; description = "External access SHALL only be enabled on a per-domain basis."; requirement = "SHALL"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.TEAMS.1.2v1";  product = "TEAMS"; description = "Unmanaged users SHALL NOT be enabled to initiate contact."; requirement = "SHALL NOT"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.TEAMS.1.3v1";  product = "TEAMS"; description = "Skype users SHALL NOT be enabled to initiate contact."; requirement = "SHALL NOT"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.TEAMS.1.4v1";  product = "TEAMS"; description = "Teams email integration SHALL be disabled."; requirement = "SHALL"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.TEAMS.1.5v1";  product = "TEAMS"; description = "If Teams email integration is enabled, only internal addresses SHOULD be allowed."; requirement = "SHOULD"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.TEAMS.1.6v1";  product = "TEAMS"; description = "Contact with internal users only SHALL be enabled."; requirement = "SHALL"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.TEAMS.1.7v1";  product = "TEAMS"; description = "Reporting tools SHALL be configured."; requirement = "SHALL"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.TEAMS.2.1v1";  product = "TEAMS"; description = "Anonymous users SHALL NOT be enabled to start meetings."; requirement = "SHALL NOT"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.TEAMS.2.2v1";  product = "TEAMS"; description = "Anonymous user access SHALL be controlled via lobby."; requirement = "SHALL"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.TEAMS.2.3v1";  product = "TEAMS"; description = "Internal users SHOULD be admitted to meetings without lobby."; requirement = "SHOULD"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.TEAMS.3.1v1";  product = "TEAMS"; description = "Only the meeting organizer SHOULD be able to record."; requirement = "SHOULD"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.TEAMS.4.1v1";  product = "TEAMS"; description = "External participants SHOULD NOT be enabled to request control."; requirement = "SHOULD NOT"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.TEAMS.5.1v1";  product = "TEAMS"; description = "Unmanaged users SHALL NOT have access to internal meetings."; requirement = "SHALL NOT"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.TEAMS.5.2v1";  product = "TEAMS"; description = "Anonymous users SHALL NOT have access to internal meetings."; requirement = "SHALL NOT"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.TEAMS.5.3v1";  product = "TEAMS"; description = "Dial-in users SHALL NOT be enabled to bypass the lobby."; requirement = "SHALL NOT"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.TEAMS.6.1v1";  product = "TEAMS"; description = "Only approved apps SHOULD be available in Teams."; requirement = "SHOULD"; nist80053 = "CM-7" }
        [ordered]@{ id = "MS.TEAMS.6.2v1";  product = "TEAMS"; description = "Sideloading of apps SHOULD be restricted."; requirement = "SHOULD"; nist80053 = "CM-7" }
        [ordered]@{ id = "MS.TEAMS.7.1v1";  product = "TEAMS"; description = "Attachments SHALL be scanned for malware."; requirement = "SHALL"; nist80053 = "SI-3" }
        [ordered]@{ id = "MS.TEAMS.7.2v1";  product = "TEAMS"; description = "Link scanning SHALL be enabled for chat messages."; requirement = "SHALL"; nist80053 = "SI-3" }
        [ordered]@{ id = "MS.TEAMS.8.1v1";  product = "TEAMS"; description = "DLP solutions SHALL be enabled for Teams messages."; requirement = "SHALL"; nist80053 = "SC-7" }

        [ordered]@{ id = "MS.POWERPLATFORM.1.1v1"; product = "POWERPLATFORM"; description = "The ability to create production and sandbox environments SHALL be restricted."; requirement = "SHALL"; nist80053 = "CM-7" }
        [ordered]@{ id = "MS.POWERPLATFORM.1.2v1"; product = "POWERPLATFORM"; description = "The ability to create trial environments SHALL be restricted."; requirement = "SHALL"; nist80053 = "CM-7" }
        [ordered]@{ id = "MS.POWERPLATFORM.2.1v1"; product = "POWERPLATFORM"; description = "A DLP policy SHALL be created to restrict connector access in the default Power Platform environment."; requirement = "SHALL"; nist80053 = "SC-7" }
        [ordered]@{ id = "MS.POWERPLATFORM.2.2v1"; product = "POWERPLATFORM"; description = "Non-default environments SHOULD have at least one DLP policy."; requirement = "SHOULD"; nist80053 = "SC-7" }
        [ordered]@{ id = "MS.POWERPLATFORM.2.3v1"; product = "POWERPLATFORM"; description = "All connectors except those selected SHALL be blocked in the default environment."; requirement = "SHALL"; nist80053 = "SC-7" }
        [ordered]@{ id = "MS.POWERPLATFORM.3.1v1"; product = "POWERPLATFORM"; description = "Power Platform tenant isolation SHALL be enabled."; requirement = "SHALL"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.POWERPLATFORM.3.2v1"; product = "POWERPLATFORM"; description = "An inbound/outbound connection allowlist SHOULD be configured."; requirement = "SHOULD"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.POWERPLATFORM.4.1v1"; product = "POWERPLATFORM"; description = "Content Security Policy SHALL be enforced for model-driven Power Apps."; requirement = "SHALL"; nist80053 = "CM-7" }

        [ordered]@{ id = "MS.POWERBI.1.1v1"; product = "POWERBI"; description = "External sharing SHALL be disabled unless authorized."; requirement = "SHALL"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.POWERBI.1.2v1"; product = "POWERBI"; description = "Azure AD guest access SHALL be restricted."; requirement = "SHALL"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.POWERBI.1.3v1"; product = "POWERBI"; description = "Publishing to the web SHALL be disabled."; requirement = "SHALL"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.POWERBI.2.1v1"; product = "POWERBI"; description = "External data sharing SHALL be restricted."; requirement = "SHALL"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.POWERBI.2.2v1"; product = "POWERBI"; description = "Only approved external users SHOULD access Power BI content."; requirement = "SHOULD"; nist80053 = "AC-3" }
        [ordered]@{ id = "MS.POWERBI.3.1v1"; product = "POWERBI"; description = "Service principals SHALL NOT be allowed to use Power BI APIs unless authorized."; requirement = "SHALL NOT"; nist80053 = "AC-6" }
        [ordered]@{ id = "MS.POWERBI.3.2v1"; product = "POWERBI"; description = "Block ResourceKey Authentication SHALL be enabled."; requirement = "SHALL"; nist80053 = "IA-2" }
    )

    return @($defaults)
}
