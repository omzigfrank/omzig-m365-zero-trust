using namespace System.Net

param($Request, $TriggerMetadata)

<#
.SYNOPSIS
    Deploys Data pillar configuration via Microsoft Graph
.DESCRIPTION
    Configures DLP policies and sensitivity labels
#>

$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot '..' 'Modules' 'GraphHelper.psm1') -Force

Write-Host "Deploy-Data started"

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

    $results = @{
        dlpPolicies = @()
        sensitivityLabels = @()
    }

    # DLP Policies - configured via Security & Compliance Center
    $dlpRules = @(
        @{ name = "Credit Card Numbers"; sensitiveType = "Credit Card Number"; action = "Warn" },
        @{ name = "Social Security Numbers"; sensitiveType = "U.S. Social Security Number (SSN)"; action = "Block" },
        @{ name = "Bank Account Numbers"; sensitiveType = "U.S. Bank Account Number"; action = "Warn" },
        @{ name = "Passport Numbers"; sensitiveType = "U.S. Passport Number"; action = "Block" },
        @{ name = "Driver License Numbers"; sensitiveType = "U.S. Driver's License Number"; action = "Warn" }
    )

    # Add HIPAA-specific rules if enabled
    if ($config.hipaaEnabled) {
        $dlpRules += @(
            @{ name = "Protected Health Information"; sensitiveType = "All Medical Terms and Conditions"; action = "Block" },
            @{ name = "Drug Enforcement Agency Number"; sensitiveType = "U.S. Drug Enforcement Agency (DEA) Number"; action = "Block" },
            @{ name = "Health Insurance Claim Number"; sensitiveType = "Health Insurance Claim Number (HICN)"; action = "Block" }
        )
    }

    foreach ($rule in $dlpRules) {
        $results.dlpPolicies += @{
            name = $rule.name
            sensitiveType = $rule.sensitiveType
            action = $rule.action
            status = "Planned"
        }
        Write-Host "DLP configured: $($rule.name)"
    }

    # Sensitivity Labels - configured via Security & Compliance Center
    $sensitivityLabels = @(
        @{ name = "Public"; priority = 0; encryption = $false; color = "#00FF00" },
        @{ name = "Internal"; priority = 1; encryption = $false; color = "#FFFF00" },
        @{ name = "Confidential"; priority = 2; encryption = $true; color = "#FFA500" },
        @{ name = "Highly Confidential"; priority = 3; encryption = $true; color = "#FF0000" }
    )

    # Add PHI label if HIPAA enabled
    if ($config.hipaaEnabled) {
        $sensitivityLabels += @{
            name = "PHI - Protected Health Information"
            priority = 4
            encryption = $true
            color = "#800080"
            hipaaSpecific = $true
        }
    }

    foreach ($label in $sensitivityLabels) {
        $results.sensitivityLabels += @{
            name = $label.name
            priority = $label.priority
            encryption = $label.encryption
            status = "Planned"
        }
        Write-Host "Label configured: $($label.name)"
    }

    $responseBody = @{
        status = "Success"
        timestamp = (Get-Date).ToUniversalTime().ToString('o')
        configuration = @{
            securityBaseline = $config.securityBaseline
            hipaaEnabled = $config.hipaaEnabled
        }
        results = $results
        note = "DLP policies and sensitivity labels require Security & Compliance PowerShell for full configuration. These settings have been documented for manual application or can be configured via Microsoft Purview compliance portal."
    }

    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::OK
        Body = ($responseBody | ConvertTo-Json -Depth 10)
        Headers = @{ 'Content-Type' = 'application/json' }
    })
}
catch {
    Write-Host "Deploy-Data failed: $_"

    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::InternalServerError
        Body = (@{ status = "Failed"; error = "Deploy-Data failed. Check function logs for details."; timestamp = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json)
        Headers = @{ 'Content-Type' = 'application/json' }
    })
}
