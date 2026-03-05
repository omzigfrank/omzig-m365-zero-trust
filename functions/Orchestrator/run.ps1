using namespace System.Net

param($Request, $TriggerMetadata)

$ErrorActionPreference = "Stop"

<#
.SYNOPSIS
    Orchestrator function that coordinates M365 Zero Trust deployment
.DESCRIPTION
    This function receives deployment configuration from the Bicep deployment
    and orchestrates Graph API calls to configure M365 services including:
    - Identity (CA policies, MFA)
    - Devices (Intune compliance)
    - Security (Defender configuration)
    - Data (DLP, sensitivity labels)
    - SCT Baselines (OS/app hardening via Intune)
#>

Write-Host "Orchestrator started"

try {
    # Parse request body; fall back to Function App settings for Marketplace deployments
    $config = $Request.Body

    if (-not $config) {
        $config = @{
            securityBaseline = "Enhanced"
            hipaaEnabled = $false
        }
    }

    # Validate securityBaseline
    $validBaselines = @('Standard', 'Enhanced', 'Maximum')
    if ($config.securityBaseline -and $config.securityBaseline -notin $validBaselines) {
        throw "Invalid securityBaseline: '$($config.securityBaseline)'. Must be one of: $($validBaselines -join ', ')"
    }

    Write-Host "Received configuration: securityBaseline=$($config.securityBaseline), hipaaEnabled=$($config.hipaaEnabled)"

    # Build SCT baseline deployment configuration
    $baselineDeploymentMode = if ($config.baselineDeploymentMode) { $config.baselineDeploymentMode } else { "audit" }
    $baselineAssignment = if ($config.baselineAssignment) { $config.baselineAssignment } else { "none" }

    # Validate baseline inputs
    if ($baselineDeploymentMode -notin @('audit', 'enforce')) {
        throw "Invalid baselineDeploymentMode: '$baselineDeploymentMode'. Must be 'audit' or 'enforce'."
    }
    if ($baselineAssignment -notin @('allDevices', 'group', 'none')) {
        throw "Invalid baselineAssignment: '$baselineAssignment'. Must be 'allDevices', 'group', or 'none'."
    }

    $baselineConfig = @{
        enabled = [bool]$config.enableSctBaselines
        baselineIds = @()
        deploymentMode = $baselineDeploymentMode
        assignmentTarget = $baselineAssignment
        hipaaEnabled = [bool]$config.hipaaEnabled
    }

    if ($baselineConfig.enabled) {
        if ($config.workstationBaseline -and $config.workstationBaseline -ne "none") {
            $baselineConfig.baselineIds += $config.workstationBaseline
        }
        if ($config.serverBaseline -and $config.serverBaseline -ne "none") {
            $baselineConfig.baselineIds += $config.serverBaseline
        }
        if ($config.deployEdgeBaseline) {
            $baselineConfig.baselineIds += "edge-v139"
        }
        if ($config.deployM365AppsBaseline) {
            $baselineConfig.baselineIds += "m365apps-2512"
        }
        if ($config.deployUpdateBaseline) {
            $baselineConfig.baselineIds += "win10-update"
        }
        Write-Host "SCT baselines: $($baselineConfig.baselineIds -join ', ') (mode=$($baselineConfig.deploymentMode), target=$($baselineConfig.assignmentTarget))"
    }
    else {
        Write-Host "SCT baselines: disabled"
    }

    # Prepare response with configuration summary and deployment plan
    $responseBody = @{
        status    = "Success"
        message   = "Orchestrator ready - M365 Zero Trust configuration received"
        timestamp = (Get-Date).ToUniversalTime().ToString('o')
        configuration = @{
            securityBaseline = $config.securityBaseline
            hipaaEnabled = $config.hipaaEnabled
            sctBaselines = $baselineConfig
        }
        conditionalAccessPolicies = @(
            @{ id = "CA001"; name = "Block-Legacy-Auth"; status = "Ready" }
            @{ id = "CA002"; name = "Require-MFA-All-Users"; status = "Ready" }
            @{ id = "CA003"; name = "Require-MFA-Admins"; status = "Ready" }
            @{ id = "CA004"; name = "Require-Compliant-Device"; status = "Ready" }
            @{ id = "CA005"; name = "Block-High-Risk-Users"; status = "Ready" }
            @{ id = "CA006"; name = "MFA-Risky-SignIn"; status = "Ready" }
        )
        deploymentPlan = @(
            @{ step = 1; function = "Deploy-Identity"; description = "CA policies, MFA, break-glass"; status = "Ready" }
            @{ step = 2; function = "Deploy-Security"; description = "Defender, Log Analytics, Sentinel"; status = "Ready" }
            @{ step = 3; function = "Deploy-Data"; description = "DLP, sensitivity labels"; status = "Ready" }
            @{ step = 4; function = "Deploy-Devices"; description = "Intune compliance policies"; status = "Ready" }
            @{
                step = 5
                function = "Deploy-Baselines"
                description = "SCT security baselines ($($baselineConfig.baselineIds.Count) baselines)"
                status = if ($baselineConfig.enabled -and $baselineConfig.baselineIds.Count -gt 0) { "Ready" } else { "Skipped" }
                endpoint = "/api/deploy-baselines"
                payload = if ($baselineConfig.enabled) {
                    @{
                        baselineIds = $baselineConfig.baselineIds
                        deploymentMode = $baselineConfig.deploymentMode
                        assignmentTarget = $baselineConfig.assignmentTarget
                        hipaaEnabled = $baselineConfig.hipaaEnabled
                    }
                } else { $null }
            }
        )
        nextSteps = @(
            "Grant admin consent for Graph API permissions in Entra admin center"
            "Call /api/deploy/identity to create CA policies"
            "Review policies in Report-Only mode before enabling"
        )
    }

    # Add baseline-specific next step if enabled
    if ($baselineConfig.enabled -and $baselineConfig.baselineIds.Count -gt 0) {
        $responseBody.nextSteps += "Call POST /api/deploy-baselines to deploy SCT profiles: $($baselineConfig.baselineIds -join ', ')"
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
            error   = "Orchestrator failed. Check function logs for details."
            timestamp = (Get-Date).ToUniversalTime().ToString('o')
        } | ConvertTo-Json)
        Headers    = @{ 'Content-Type' = 'application/json' }
    })
}
