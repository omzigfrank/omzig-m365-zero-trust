using namespace System.Net

param($Request, $TriggerMetadata)

# --- Handle CORS preflight ---
if ($Request.Method -eq 'OPTIONS') {
    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::OK
        Headers    = @{
            'Access-Control-Allow-Origin'  = '*'
            'Access-Control-Allow-Methods' = 'POST, OPTIONS'
            'Access-Control-Allow-Headers' = 'Authorization, Content-Type'
            'Access-Control-Max-Age'       = '86400'
        }
    })
    return
}

$corsHeaders = @{ 'Access-Control-Allow-Origin' = '*' }

# --- Extract and validate Bearer token ---
$authHeader = $Request.Headers['Authorization']
if (-not $authHeader -or -not $authHeader.StartsWith('Bearer ')) {
    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::Unauthorized
        Headers    = $corsHeaders
        Body       = '{"error":"Missing or invalid Authorization header. Expected: Bearer <token>"}'
    })
    return
}

$delegatedToken = $authHeader.Substring(7)

# --- Parse request body ---
$body = $Request.Body
$framework = 'Both'
if ($body -and $body.framework) {
    $validFrameworks = @('CISA', 'NIST', 'Both')
    if ($validFrameworks -contains $body.framework) {
        $framework = $body.framework
    }
}

Write-Host "[Run-Audit] Framework: $framework"

try {
    # --- Set the delegated token for Graph API calls ---
    $script:DelegatedBearerToken = $delegatedToken

    # --- Dot-source audit modules ---
    $scriptsDir = Join-Path $PSScriptRoot '..\..\scripts'
    $auditDir = Join-Path $scriptsDir 'audit'

    . (Join-Path $scriptsDir 'FrameworkAuditHelper.ps1')

    # The FrameworkAuditHelper dot-sources the audit/ files if they exist,
    # but in Azure Functions the relative path may differ.
    # Explicitly load them if not already loaded.
    if (-not (Get-Command 'Get-TenantAuditFacts' -ErrorAction SilentlyContinue)) {
        . (Join-Path $auditDir 'CisaCatalogFetcher.ps1')
        . (Join-Path $auditDir 'TenantFactCollector.ps1')
        . (Join-Path $auditDir 'CisaEvaluatorRegistry.ps1')
        . (Join-Path $auditDir 'NistEvaluatorRegistry.ps1')
    }

    # --- Collect tenant facts using delegated token ---
    Write-Host "[Run-Audit] Collecting tenant facts..."
    $tenantFacts = Get-TenantAuditFacts -DelegatedToken $delegatedToken

    $reports = @{}
    $allChecks = @()

    # --- Run CISA evaluation ---
    if ($framework -eq 'CISA' -or $framework -eq 'Both') {
        Write-Host "[Run-Audit] Running CISA SCuBA evaluation..."
        $cisaCatalog = Get-CisaControlCatalogDefaults
        $cisaChecks = Invoke-CisaControlEvaluation -Facts $tenantFacts -ControlCatalog $cisaCatalog
        $allChecks += $cisaChecks

        $cisaPass = @($cisaChecks | Where-Object { $_.rating -eq 'pass' }).Count
        $cisaFail = @($cisaChecks | Where-Object { $_.rating -eq 'fail' }).Count
        $cisaWarn = @($cisaChecks | Where-Object { $_.rating -eq 'warn' }).Count

        $reports['CISA'] = @{
            id          = 'CISA'
            displayName = 'CISA SCuBA'
            checks      = $cisaChecks
            summary     = @{
                total = $cisaChecks.Count
                pass  = $cisaPass
                warn  = $cisaWarn
                fail  = $cisaFail
            }
        }
    }

    # --- Run NIST evaluation ---
    if ($framework -eq 'NIST' -or $framework -eq 'Both') {
        Write-Host "[Run-Audit] Running NIST ZTA evaluation..."
        $nistChecks = Get-NistZtaChecks -Facts $tenantFacts
        $allChecks += $nistChecks

        $nistPass = @($nistChecks | Where-Object { $_.rating -eq 'pass' }).Count
        $nistFail = @($nistChecks | Where-Object { $_.rating -eq 'fail' }).Count
        $nistWarn = @($nistChecks | Where-Object { $_.rating -eq 'warn' }).Count

        $reports['NIST'] = @{
            id          = 'NIST'
            displayName = 'NIST SP 800-207 Zero Trust'
            checks      = $nistChecks
            summary     = @{
                total = $nistChecks.Count
                pass  = $nistPass
                warn  = $nistWarn
                fail  = $nistFail
            }
        }
    }

    # --- Build combined summary ---
    $totalPass = @($allChecks | Where-Object { $_.rating -eq 'pass' }).Count
    $totalFail = @($allChecks | Where-Object { $_.rating -eq 'fail' }).Count
    $totalWarn = @($allChecks | Where-Object { $_.rating -eq 'warn' }).Count
    $totalNa = @($allChecks | Where-Object { $_.rating -eq 'na' }).Count

    $applicable = $totalPass + $totalFail
    $scorePercent = $(if ($applicable -gt 0) { [math]::Round(($totalPass / $applicable) * 100) } else { 0 })

    $envelope = @{
        generatedAt       = (Get-Date -Format 'o')
        selectedFramework = $framework
        frameworks        = @($reports.Keys)
        tenantInfo        = @{
            tenantId      = $(if ($tenantFacts.organization.tenantId) { $tenantFacts.organization.tenantId } else { '' })
            displayName   = $(if ($tenantFacts.organization.displayName) { $tenantFacts.organization.displayName } else { '' })
            primaryDomain = $(if ($tenantFacts.domains.primaryDomain) { $tenantFacts.domains.primaryDomain } else { '' })
        }
        combinedSummary   = @{
            total    = $allChecks.Count
            pass     = $totalPass
            warn     = $totalWarn
            fail     = $totalFail
            na       = $totalNa
            score    = $scorePercent
        }
        reports           = $reports
    }

    Write-Host "[Run-Audit] Complete. Score: $scorePercent% ($totalPass pass / $totalFail fail / $totalNa na)"

    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::OK
        Headers    = $corsHeaders + @{ 'Content-Type' = 'application/json' }
        Body       = ($envelope | ConvertTo-Json -Depth 10 -Compress)
    })
}
catch {
    Write-Error "[Run-Audit] Error: $($_.Exception.Message)"
    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::InternalServerError
        Headers    = $corsHeaders
        Body       = (@{ error = $_.Exception.Message } | ConvertTo-Json -Compress)
    })
}
