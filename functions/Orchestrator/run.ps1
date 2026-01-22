using namespace System.Net

param($Request, $TriggerMetadata)

<#
.SYNOPSIS
    Orchestrator function that coordinates M365 Zero Trust deployment
.DESCRIPTION
    This function receives deployment configuration from the Bicep deployment
    and orchestrates Graph API calls to configure M365 services.
#>

Write-Host "Orchestrator started"

try {
    # Parse request body
    $config = $Request.Body

    if (-not $config) {
        $config = @{
            securityBaseline = "Enhanced"
            hipaaEnabled = $false
        }
    }

    Write-Host "Received configuration: securityBaseline=$($config.securityBaseline), hipaaEnabled=$($config.hipaaEnabled)"

    # Prepare response with configuration summary
    $responseBody = @{
        status    = "Success"
        message   = "Orchestrator ready - M365 Zero Trust configuration received"
        timestamp = (Get-Date).ToUniversalTime().ToString('o')
        configuration = @{
            securityBaseline = $config.securityBaseline
            hipaaEnabled = $config.hipaaEnabled
        }
        conditionalAccessPolicies = @(
            @{ id = "CA001"; name = "Block-Legacy-Auth"; status = "Ready" }
            @{ id = "CA002"; name = "Require-MFA-All-Users"; status = "Ready" }
            @{ id = "CA003"; name = "Require-MFA-Admins"; status = "Ready" }
            @{ id = "CA004"; name = "Require-Compliant-Device"; status = "Ready" }
            @{ id = "CA005"; name = "Block-High-Risk-Users"; status = "Ready" }
            @{ id = "CA006"; name = "MFA-Risky-SignIn"; status = "Ready" }
        )
        nextSteps = @(
            "Grant admin consent for Graph API permissions in Entra admin center"
            "Call /api/deploy/identity to create CA policies"
            "Review policies in Report-Only mode before enabling"
        )
    }

    Write-Host "Orchestrator completed successfully"

    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::OK
        Body       = ($responseBody | ConvertTo-Json -Depth 10)
        Headers    = @{ 'Content-Type' = 'application/json' }
    })
}
catch {
    Write-Host "Orchestrator failed: $_"

    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::InternalServerError
        Body       = (@{
            status  = "Failed"
            error   = $_.Exception.Message
            timestamp = (Get-Date).ToUniversalTime().ToString('o')
        } | ConvertTo-Json)
        Headers    = @{ 'Content-Type' = 'application/json' }
    })
}
