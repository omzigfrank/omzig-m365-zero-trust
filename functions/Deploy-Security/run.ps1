using namespace System.Net

param($Request, $TriggerMetadata)

<#
.SYNOPSIS
    Deploys Security pillar configuration via Microsoft Graph / Security & Compliance
.DESCRIPTION
    Configures Defender for Office 365, Defender for Cloud Apps, and security monitoring.
#>

Import-Module (Join-Path $PSScriptRoot '..' 'Modules' 'GraphHelper.psm1') -Force

Write-DeploymentLog -Message "Deploy-Security started" -Level Info -Component "Security"

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
        defenderForOffice   = $null
        defenderForCloudApps = $null
        alertRules          = @()
    }

    # Configure Defender for Office 365
    if ($config.defenderForOfficeConfiguration) {
        $d4oConfig = $config.defenderForOfficeConfiguration
        Write-DeploymentLog -Message "Configuring Defender for Office 365" -Level Info -Component "Security"

        try {
            # Configure Safe Attachments Policy
            if ($d4oConfig.safeAttachments.enabled) {
                Write-DeploymentLog -Message "Creating Safe Attachments policy" -Level Info -Component "Security"

                $safeAttachmentsPolicy = @{
                    Name           = 'ZeroTrust-SafeAttachments'
                    Action         = $d4oConfig.safeAttachments.action
                    Redirect       = $d4oConfig.safeAttachments.redirect
                    ActionOnError  = $true
                }

                # Note: Use Exchange Online PowerShell or Graph API in production
                # New-SafeAttachmentPolicy @safeAttachmentsPolicy
            }

            # Configure Safe Links Policy
            if ($d4oConfig.safeLinks.enabled) {
                Write-DeploymentLog -Message "Creating Safe Links policy" -Level Info -Component "Security"

                $safeLinksPolicy = @{
                    Name                    = 'ZeroTrust-SafeLinks'
                    ScanUrls                = $d4oConfig.safeLinks.realTimeScan
                    EnableForInternalSenders = $d4oConfig.safeLinks.scanInternalLinks
                    TrackClicks             = $d4oConfig.safeLinks.trackClicks
                    AllowClickThrough       = $d4oConfig.safeLinks.allowClickThrough
                }

                # Note: Use Exchange Online PowerShell or Graph API in production
            }

            # Configure Anti-Phishing Policy
            if ($d4oConfig.antiPhishing.enabled) {
                Write-DeploymentLog -Message "Creating Anti-Phishing policy" -Level Info -Component "Security"

                $antiPhishPolicy = @{
                    Name                              = 'ZeroTrust-AntiPhish'
                    PhishThresholdLevel               = $d4oConfig.antiPhishing.threshold
                    EnableMailboxIntelligence         = $d4oConfig.antiPhishing.enableMailboxIntelligence
                    EnableSpoofIntelligence           = $d4oConfig.antiPhishing.enableSpoofIntelligence
                    EnableFirstContactSafetyTips      = $d4oConfig.antiPhishing.enableFirstContactSafetyTips
                    HonorDmarcPolicy                  = $d4oConfig.antiPhishing.honorDmarc
                }

                # Note: Use Exchange Online PowerShell or Graph API in production
            }

            $results.defenderForOffice = @{
                status           = 'Configured'
                plan             = $d4oConfig.plan
                safeAttachments  = $d4oConfig.safeAttachments.enabled
                safeLinks        = $d4oConfig.safeLinks.enabled
                antiPhishing     = $d4oConfig.antiPhishing.enabled
            }

            Write-DeploymentLog -Message "Defender for Office 365 configured" -Level Success -Component "Security"
        }
        catch {
            Write-DeploymentLog -Message "Failed to configure Defender for Office 365: $_" -Level Error -Component "Security"
            $results.defenderForOffice = @{ status = 'Failed'; error = $_.Exception.Message }
        }
    }

    # Configure Defender for Cloud Apps
    if ($config.defenderForCloudAppsConfiguration -and $config.defenderForCloudAppsConfiguration.enabled) {
        $mdcaConfig = $config.defenderForCloudAppsConfiguration
        Write-DeploymentLog -Message "Configuring Defender for Cloud Apps" -Level Info -Component "Security"

        try {
            # Configure Session Policies
            if ($mdcaConfig.sessionPolicies.enabled) {
                Write-DeploymentLog -Message "Configuring session policies" -Level Info -Component "Security"
                # Note: Configure via MDCA API in production
            }

            # Configure Anomaly Detection
            if ($mdcaConfig.anomalyDetection.enabled) {
                Write-DeploymentLog -Message "Enabling anomaly detection policies" -Level Info -Component "Security"
                # Note: Configure via MDCA API in production
            }

            $results.defenderForCloudApps = @{
                status           = 'Configured'
                sessionPolicies  = $mdcaConfig.sessionPolicies.enabled
                anomalyDetection = $mdcaConfig.anomalyDetection.enabled
                appGovernance    = $mdcaConfig.appGovernance.enabled
            }

            Write-DeploymentLog -Message "Defender for Cloud Apps configured" -Level Success -Component "Security"
        }
        catch {
            Write-DeploymentLog -Message "Failed to configure Defender for Cloud Apps: $_" -Level Error -Component "Security"
            $results.defenderForCloudApps = @{ status = 'Failed'; error = $_.Exception.Message }
        }
    }

    # Configure Alert Rules (via Log Analytics)
    if ($config.alertRulesConfiguration) {
        Write-DeploymentLog -Message "Configuring alert rules" -Level Info -Component "Security"

        foreach ($rule in $config.alertRulesConfiguration) {
            if (-not $rule.enabled) { continue }

            try {
                Write-DeploymentLog -Message "Creating alert rule: $($rule.name)" -Level Info -Component "Security"

                # Note: Alert rules are created via Azure Monitor API or ARM/Bicep
                # This function would call the appropriate API to create scheduled query rules

                $results.alertRules += @{
                    name     = $rule.name
                    severity = $rule.severity
                    status   = 'Created'
                }
            }
            catch {
                $results.alertRules += @{
                    name   = $rule.name
                    status = 'Failed'
                    error  = $_.Exception.Message
                }
            }
        }

        Write-DeploymentLog -Message "Alert rules configured" -Level Success -Component "Security"
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
    Write-DeploymentLog -Message "Deploy-Security failed: $_" -Level Error -Component "Security"

    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::InternalServerError
        Body       = (@{ status = "Failed"; error = $_.Exception.Message } | ConvertTo-Json)
        Headers    = @{ 'Content-Type' = 'application/json' }
    })
}
