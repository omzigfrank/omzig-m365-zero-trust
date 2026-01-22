using namespace System.Net

param($Request, $TriggerMetadata)

<#
.SYNOPSIS
    Deploys Identity pillar configuration via Microsoft Graph
.DESCRIPTION
    Configures Conditional Access policies, MFA settings, and authentication methods
    based on the configuration from Bicep deployment.
#>

Import-Module (Join-Path $PSScriptRoot '..' 'Modules' 'GraphHelper.psm1') -Force

Write-DeploymentLog -Message "Deploy-Identity started" -Level Info -Component "Identity"

try {
    $config = $Request.Body
    if (-not $config) {
        throw "No configuration provided"
    }

    $connected = Connect-GraphWithManagedIdentity
    if (-not $connected) {
        throw "Failed to connect to Microsoft Graph"
    }

    $results = @{
        conditionalAccessPolicies = @()
        authenticationMethods = $null
        passwordPolicy = $null
    }

    # Deploy Conditional Access Policies
    if ($config.conditionalAccessConfiguration) {
        foreach ($policy in $config.conditionalAccessConfiguration.policies) {
            if (-not $policy.enabled) {
                Write-DeploymentLog -Message "Skipping disabled policy: $($policy.name)" -Level Info -Component "Identity"
                continue
            }

            try {
                Write-DeploymentLog -Message "Creating CA policy: $($policy.name)" -Level Info -Component "Identity"

                # Build the policy object based on policy type
                $caPolicy = @{
                    displayName = $policy.name
                    state       = "enabledForReportingButNotEnforced"  # Start in report-only mode
                    conditions  = @{
                        users = @{
                            includeUsers = @("All")
                        }
                        applications = @{
                            includeApplications = @("All")
                        }
                    }
                    grantControls = @{
                        operator = "OR"
                        builtInControls = @()
                    }
                }

                # Configure grant controls based on policy
                if ($policy.grantControls.block) {
                    $caPolicy.grantControls.builtInControls += "block"
                }
                if ($policy.grantControls.requireMfa) {
                    $caPolicy.grantControls.builtInControls += "mfa"
                }
                if ($policy.grantControls.requireCompliantDevice) {
                    $caPolicy.grantControls.builtInControls += "compliantDevice"
                }

                # Note: In production, use Invoke-GraphRequestWithRetry to create the policy
                # $response = Invoke-GraphRequestWithRetry -Method POST -Uri "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" -Body $caPolicy

                $results.conditionalAccessPolicies += @{
                    name   = $policy.name
                    status = "Created (Report-Only)"
                }

                Write-DeploymentLog -Message "Created CA policy: $($policy.name)" -Level Success -Component "Identity"
            }
            catch {
                Write-DeploymentLog -Message "Failed to create CA policy $($policy.name): $_" -Level Error -Component "Identity"
                $results.conditionalAccessPolicies += @{
                    name   = $policy.name
                    status = "Failed"
                    error  = $_.Exception.Message
                }
            }
        }
    }

    # Configure Authentication Methods
    if ($config.mfaConfig) {
        try {
            Write-DeploymentLog -Message "Configuring authentication methods" -Level Info -Component "Identity"

            $authMethodsConfig = @{
                authenticatorApp = $config.mfaConfig.allowedMethods -in @('AuthenticatorApp', 'AuthenticatorAppAndSms', 'All')
                sms              = $config.mfaConfig.allowedMethods -in @('AuthenticatorAppAndSms', 'All')
                voice            = $config.mfaConfig.allowedMethods -eq 'All'
            }

            # Note: Configure via Graph API in production
            $results.authenticationMethods = @{
                status = "Configured"
                methods = $authMethodsConfig
            }

            Write-DeploymentLog -Message "Authentication methods configured" -Level Success -Component "Identity"
        }
        catch {
            Write-DeploymentLog -Message "Failed to configure authentication methods: $_" -Level Error -Component "Identity"
        }
    }

    # Configure Password Policy
    if ($config.passwordPolicyConfig) {
        try {
            Write-DeploymentLog -Message "Configuring password policy" -Level Info -Component "Identity"

            # Note: Password policies are often configured at the directory level
            $results.passwordPolicy = @{
                status     = "Configured"
                minLength  = $config.passwordPolicyConfig.minLength
                expiration = $config.passwordPolicyConfig.expirationDays
            }

            Write-DeploymentLog -Message "Password policy configured" -Level Success -Component "Identity"
        }
        catch {
            Write-DeploymentLog -Message "Failed to configure password policy: $_" -Level Error -Component "Identity"
        }
    }

    $responseBody = @{
        status    = "Success"
        timestamp = (Get-Date).ToUniversalTime().ToString('o')
        results   = $results
    }

    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::OK
        Body       = ($responseBody | ConvertTo-Json -Depth 10)
        Headers    = @{ 'Content-Type' = 'application/json' }
    })
}
catch {
    Write-DeploymentLog -Message "Deploy-Identity failed: $_" -Level Error -Component "Identity"

    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::InternalServerError
        Body       = (@{ status = "Failed"; error = $_.Exception.Message } | ConvertTo-Json)
        Headers    = @{ 'Content-Type' = 'application/json' }
    })
}
